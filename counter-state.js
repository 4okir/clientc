export const PREFIX = 'diman-counter:v1:';
export const DEVICE_KEY = PREFIX + 'device';
export const SNAPSHOT_KEY = PREFIX + 'snapshot';
export const PENDING_PREFIX = PREFIX + 'pending:';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const integer = value => Number.isSafeInteger(value) && value >= 0;

export function validDevice(value) {
  return !!value && typeof value.device === 'string' && UUID.test(value.device)
    && typeof value.token === 'string' && value.token.startsWith(value.device + '.')
    && /^[A-Za-z0-9_-]{43}$/.test(value.token.slice(value.device.length + 1));
}
export function validSnapshot(value) {
  return !!value && integer(value.total) && integer(value.today) && value.today <= value.total
    && integer(value.revision) && value.revision >= value.total
    && (value.lastAt === null || (typeof value.lastAt === 'string' && Number.isFinite(Date.parse(value.lastAt))))
    && (value.ownLastEventId === null || (typeof value.ownLastEventId === 'string' && UUID.test(value.ownLastEventId)))
    && typeof value.serverTime === 'string' && Number.isFinite(Date.parse(value.serverTime))
    && (!Object.hasOwn(value, 'appliedIds') || (Array.isArray(value.appliedIds) && value.appliedIds.length <= 5000
      && value.appliedIds.every(id => typeof id === 'string' && UUID.test(id))));
}
export function validOperation(value) {
  return !!value && typeof value.id === 'string' && UUID.test(value.id) && validDevice(value)
    && integer(value.order) && ['increment', 'undo'].includes(value.action)
    && (value.action !== 'undo' || (typeof value.target === 'string' && UUID.test(value.target)));
}
export function readJson(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
}
export function readPending(storage) {
  const operations = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(PENDING_PREFIX)) continue;
    const value = readJson(storage, key);
    if (validOperation(value) && key === PENDING_PREFIX + value.id) operations.push(value);
  }
  return orderOperations(operations);
}
export function orderOperations(operations) {
  operations = operations.filter(validOperation).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const byId = new Map(operations.map(value => [value.id, value]));
  const ordered = [], seen = new Set();
  for (const value of operations) {
    const target = value.action === 'undo' ? byId.get(value.target) : null;
    if (target?.action === 'increment' && !seen.has(target.id)) { ordered.push(target); seen.add(target.id); }
    if (!seen.has(value.id)) { ordered.push(value); seen.add(value.id); }
  }
  return ordered;
}
export function optimisticTotal(snapshot, pending, legacyPendingIds = []) {
  const valid = validSnapshot(snapshot);
  const applied = new Set([...(valid && Array.isArray(snapshot.appliedIds) ? snapshot.appliedIds : []), ...legacyPendingIds]);
  let total = valid ? snapshot.total : 0;
  for (const operation of orderOperations(pending)) {
    if (!applied.has(operation.id)) total += operation.action === 'increment' ? 1 : -1;
  }
  return Math.max(0, total);
}
export function selectBatch(pending, max = 32) {
  const ordered = orderOperations(pending);
  if (!ordered.length) return null;
  const { device, token } = ordered[0];
  const limit = Number.isInteger(max) && max > 0 ? Math.min(max, 32) : 32;
  const queued = new Set(ordered.map(operation => operation.id));
  const included = new Set(), events = [];
  for (const operation of ordered) {
    if (operation.device !== device || operation.token !== token) continue;
    if (operation.action === 'undo' && queued.has(operation.target) && !included.has(operation.target)) continue;
    events.push({ action: operation.action, id: operation.id,
      ...(operation.action === 'undo' ? { target: operation.target } : {}) });
    included.add(operation.id);
    if (events.length >= limit) break;
  }
  return { device, token, events, pending: ordered.map(operation => operation.id) };
}
export function storeOperation(storage, value) {
  if (!validOperation(value)) throw new Error('Invalid operation');
  storage.setItem(PENDING_PREFIX + value.id, JSON.stringify(value));
}
export function removeOperation(storage, id) { storage.removeItem(PENDING_PREFIX + id); }
export function eventBody(operation) {
  return { action: operation.action, id: operation.id, device: operation.device,
    ...(operation.action === 'undo' ? { target: operation.target } : {}) };
}
export function mergeSnapshot(current, incoming, pendingIds) {
  if (!validSnapshot(incoming)) throw new Error('Invalid snapshot');
  let merged;
  if (!validSnapshot(current) || incoming.revision > current.revision) merged = { ...incoming };
  else if (incoming.revision < current.revision) {
    if (pendingIds === undefined) return current;
    merged = current;
  }
  else if (!Object.hasOwn(current, 'appliedIds') && !Object.hasOwn(incoming, 'appliedIds')) merged = { ...incoming };
  else merged = { ...incoming, appliedIds: [...new Set([...(current.appliedIds || []), ...(incoming.appliedIds || [])])] };
  if (Object.hasOwn(merged, 'appliedIds')) {
    const pending = pendingIds === undefined ? null : new Set(pendingIds);
    const appliedIds = [...new Set(merged.appliedIds)].filter(id => !pending || pending.has(id));
    if (appliedIds.length > 5000) throw new Error('Snapshot receipts exceed 5000; supply active pending IDs');
    return { ...merged, appliedIds };
  }
  return merged;
}
