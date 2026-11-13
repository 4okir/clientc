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
    && typeof value.serverTime === 'string' && Number.isFinite(Date.parse(value.serverTime));
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
  operations.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const byId = new Map(operations.map(value => [value.id, value]));
  const ordered = [], seen = new Set();
  for (const value of operations) {
    const target = value.action === 'undo' ? byId.get(value.target) : null;
    if (target?.action === 'increment' && !seen.has(target.id)) { ordered.push(target); seen.add(target.id); }
    if (!seen.has(value.id)) { ordered.push(value); seen.add(value.id); }
  }
  return ordered;
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
export function mergeSnapshot(current, incoming) {
  if (!validSnapshot(incoming)) throw new Error('Invalid snapshot');
  return !validSnapshot(current) || incoming.revision >= current.revision ? { ...incoming } : current;
}
