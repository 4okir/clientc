import { DEVICE_KEY, SNAPSHOT_KEY, PENDING_PREFIX, validDevice, validSnapshot, validOperation, readJson, orderOperations, optimisticTotal, selectBatch, mergeSnapshot } from './counter-state.js?v=6';

const API = 'https://diman-counter-4okir.mythic-peach-5761.chatgpt.site';
// Old tabs may still submit v1 operations. Preserve their queue while isolating
// new operations and receipt-aware snapshots from that older client.
const FAST_PENDING_PREFIX = 'diman-counter:v2:pending:';
const FAST_SNAPSHOT_KEY = 'diman-counter:v2:snapshot';
const SYNC_LOCK = 'diman-counter:v2:sync';
const LIMIT = 5000;
const $ = id => document.getElementById(id);
const format = new Intl.NumberFormat('ru-RU');
const timeFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let persistent = true;
let storage;
try { storage = localStorage; storage.setItem('diman-counter:probe', '1'); storage.removeItem('diman-counter:probe'); }
catch {
  persistent = false;
  const memory = new Map();
  storage = { get length() { return memory.size; }, key: index => [...memory.keys()][index] ?? null,
    getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
}
let device = readJson(storage, DEVICE_KEY);
if (!validDevice(device)) device = null;
const fastCache = readJson(storage, FAST_SNAPSHOT_KEY);
const cached = validSnapshot(fastCache?.value) ? fastCache : readJson(storage, SNAPSHOT_KEY);
let snapshot = validSnapshot(cached?.value) ? cached.value : null;
if (snapshot && cached.device !== device?.device) snapshot = { ...snapshot, ownLastEventId: null };
const queue = new Map();
let reachable = false, syncing = false, starting = false;
let syncPromise = null, syncTimer, renderFrame, toastTimer, animationTimer;
let lastSuccess = 0, lastOrder = Date.now() * 1000;
let enhancements = null;

function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 7000); }
function queueKey(key) { return key?.startsWith(FAST_PENDING_PREFIX) || key?.startsWith(PENDING_PREFIX); }
function remember(key, value) {
  if (validOperation(value) && key === (key.startsWith(FAST_PENDING_PREFIX) ? FAST_PENDING_PREFIX : PENDING_PREFIX) + value.id) {
    queue.set(value.id, { value, key, legacy: key.startsWith(PENDING_PREFIX) });
    lastOrder = Math.max(lastOrder, value.order);
  }
}
function loadQueue() {
  queue.clear();
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (queueKey(key)) remember(key, readJson(storage, key));
  }
}
function pending() { return orderOperations([...queue.values()].map(entry => entry.value)); }
function legacyIds() { return [...queue.values()].filter(entry => entry.legacy).map(entry => entry.value.id); }
function undoTarget(operations = pending()) {
  if (!device) return null;
  const own = operations.filter(value => value.device === device.device);
  const cancelled = new Set(own.filter(value => value.action === 'undo').map(value => value.target));
  const latest = [...own].reverse().find(value => value.action === 'increment' && !queue.get(value.id)?.legacy && !cancelled.has(value.id));
  if (latest) return latest.id;
  return snapshot?.ownLastEventId && !cancelled.has(snapshot.ownLastEventId) ? snapshot.ownLastEventId : null;
}
function scheduleRender() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => { renderFrame = null; render(); });
}
function render() {
  const operations = pending();
  const total = optimisticTotal(snapshot, operations, legacyIds());
  $('counter-value').textContent = snapshot || operations.length ? format.format(total) : '—';
  $('today-value').textContent = snapshot && dayFormat.format(new Date(snapshot.serverTime)) === dayFormat.format(new Date()) ? format.format(snapshot.today) : '—';
  $('last-value').textContent = snapshot?.lastAt ? timeFormat.format(new Date(snapshot.lastAt)) + ' МСК' : 'Пока тихо';
  $('increment').disabled = !device || queue.size >= LIMIT;
  $('undo').disabled = !undoTarget(operations) || queue.size >= LIMIT;
  const fresh = reachable && Date.now() - lastSuccess < 18000;
  document.body.dataset.connection = fresh ? (queue.size || syncing ? 'syncing' : 'online') : (starting ? 'syncing' : 'offline');
  $('connection-status').textContent = fresh ? (queue.size ? 'Сохраняем в фоне…' : 'Сохранено · общий для всех')
    : starting ? 'Подключаем общую базу…' : snapshot ? 'Нет связи · нажатия сохранены на устройстве' : 'Не удалось подключиться к базе';
  $('retry-sync').hidden = fresh || starting;
  $('pending-note').textContent = queue.size
    ? 'В фоне сохраняются: ' + format.format(queue.size) + '. Можно нажимать дальше. ' + (persistent ? '' : 'Оставьте страницу открытой до сохранения.')
    : persistent ? '' : 'При потере связи оставьте страницу открытой до сохранения.';
  $('counter-value').style.fontSize = total >= 1000000 ? 'clamp(56px, 13vw, 145px)' : '';
  try { enhancements?.render(snapshot); } catch {}
}
function bump() {
  if (reducedMotion.matches) return;
  clearTimeout(animationTimer);
  $('counter-value').classList.add('is-bumping'); $('stage-puff').classList.add('is-puffing');
  animationTimer = setTimeout(() => { $('counter-value').classList.remove('is-bumping'); $('stage-puff').classList.remove('is-puffing'); }, 700);
}
function applySnapshot(value, sourceDevice, persist = true) {
  if (!validSnapshot(value)) throw new Error('Сервер вернул некорректное значение.');
  const ownLastEventId = sourceDevice === device?.device ? value.ownLastEventId : snapshot?.ownLastEventId ?? null;
  snapshot = mergeSnapshot(snapshot, { ...value, ownLastEventId }, [...queue.keys()]);
  // Save receipts before deleting operations, so a reload cannot count them twice.
  if (persist) try { storage.setItem(FAST_SNAPSHOT_KEY, JSON.stringify({ value: snapshot, device: device?.device })); } catch {}
  reachable = true; lastSuccess = Date.now();
  scheduleRender();
}
function removeQueued(id) {
  const entry = queue.get(id);
  if (!entry) return;
  try { storage.removeItem(entry.key); } catch { return; }
  queue.delete(id);
}
function acknowledge(ids) {
  let ownIncrement = false;
  for (const id of ids) {
    const operation = queue.get(id)?.value;
    if (operation?.action === 'increment' && operation.device === device?.device) ownIncrement = true;
    removeQueued(id);
  }
  if (ownIncrement) try { Promise.resolve(enhancements?.confirmedIncrement(snapshot.total)).catch(() => {}); } catch {}
}
async function request(path, { token, body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(API + path, {
      method: 'POST', credentials: 'omit', cache: 'no-store', signal: controller.signal,
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const value = await response.json();
    if (!response.ok) { const error = new Error(value.error || 'Не удалось сохранить. Попробуем ещё раз.'); error.status = response.status; error.eventId = value.eventId; throw error; }
    return value;
  } finally { clearTimeout(timeout); }
}
function scheduleSync(delay = 80) {
  if (syncTimer) return;
  syncTimer = setTimeout(() => { syncTimer = null; sync(); }, delay);
}
async function reconcile(identity) {
  const value = await request('/api/sync', { token: identity.token, body: { device: identity.device, events: [], pending: [...queue.keys()] } });
  if (!Array.isArray(value.appliedIds)) throw new Error('Сервер ещё обновляется. Повторим сохранение.');
  applySnapshot(value, identity.device);
  acknowledge(value.appliedIds);
}
function sync() {
  if (!device) return Promise.resolve();
  if (syncPromise) return syncPromise;
  syncing = true; scheduleRender();
  const work = async () => {
    loadQueue();
    const shared = readJson(storage, FAST_SNAPSHOT_KEY);
    if (validSnapshot(shared?.value)) applySnapshot(shared.value, shared.device, false);
    for (let turn = 0; turn < 16; turn++) {
      const batch = selectBatch(pending());
      const identity = batch || device;
      try {
        const value = await request('/api/sync', { token: identity.token, body: { device: identity.device, events: batch?.events || [], pending: [...queue.keys()] } });
        if (!Array.isArray(value.appliedIds)) throw new Error('Сервер ещё обновляется. Повторим сохранение.');
        applySnapshot(value, identity.device);
        acknowledge(value.appliedIds);
      } catch (error) {
        const rejected = queue.get(error.eventId)?.value;
        if (rejected?.action === 'undo' && [404, 409].includes(error.status)) {
          await reconcile(identity);
          removeQueued(rejected.id);
          toast('Это нажатие уже отменено. Остальные сохраняются.');
          continue;
        }
        throw error;
      }
      if (!queue.size) break;
      loadQueue();
    }
  };
  // Serialize new tabs, including reads. The API also deduplicates every ID.
  const lockedWork = navigator.locks?.request ? () => navigator.locks.request(SYNC_LOCK, work) : work;
  syncPromise = Promise.resolve().then(lockedWork).catch(error => {
    reachable = false;
    if (error.status === 401 && !queue.size) { device = null; try { storage.removeItem(DEVICE_KEY); } catch {} }
    if (error.status) toast(error.message);
  }).finally(() => {
    syncPromise = null; syncing = false; scheduleRender();
    if (queue.size && reachable) scheduleSync(0);
  });
  return syncPromise;
}
async function connect() {
  if (starting) return;
  starting = true; scheduleRender();
  try {
    if (!device) {
      const identity = await request('/api/device');
      if (!validDevice(identity)) throw new Error('Не удалось подключить устройство.');
      device = identity;
      try { storage.setItem(DEVICE_KEY, JSON.stringify(device)); } catch { persistent = false; }
    }
    await sync();
  } catch { reachable = false; }
  finally { starting = false; scheduleRender(); }
}
function enqueue(action, target) {
  if (!device) return;
  if (queue.size >= LIMIT) { toast('Очередь заполнена. Подключитесь к сети, чтобы сохранить нажатия.'); return; }
  lastOrder = Math.max(Date.now() * 1000, lastOrder + 1);
  const operation = { action, id: crypto.randomUUID(), device: device.device, token: device.token, order: lastOrder, ...(target ? { target } : {}) };
  const key = FAST_PENDING_PREFIX + operation.id;
  try { storage.setItem(key, JSON.stringify(operation)); }
  catch { toast('Браузер не смог сохранить нажатие. Попробуйте освободить место и повторить.'); return; }
  queue.set(operation.id, { value: operation, key, legacy: false });
  scheduleRender(); bump(); scheduleSync();
}
$('increment').addEventListener('click', () => enqueue('increment'));
$('undo').addEventListener('click', () => { const target = undoTarget(); if (target) enqueue('undo', target); });
$('retry-sync').addEventListener('click', () => connect());
$('share').addEventListener('click', async () => {
  const url = 'https://4okir.github.io/clientc/';
  try {
    if (navigator.share) await navigator.share({ title: 'Счётчик пердышей Димана', url });
    else { await navigator.clipboard.writeText(url); toast('Ссылка скопирована. Счётчик у всех будет общий.'); }
  } catch (error) { if (error.name !== 'AbortError') toast('Ссылка на счётчик: ' + url); }
});
window.addEventListener('online', () => connect());
window.addEventListener('offline', () => { reachable = false; scheduleRender(); });
window.addEventListener('storage', event => {
  if (event.key === null) loadQueue();
  else if (queueKey(event.key)) {
    const prefix = event.key.startsWith(FAST_PENDING_PREFIX) ? FAST_PENDING_PREFIX : PENDING_PREFIX;
    queue.delete(event.key.slice(prefix.length));
    if (event.newValue) remember(event.key, readJson(storage, event.key));
  }
  if (event.key === FAST_SNAPSHOT_KEY) {
    let next;
    try { next = JSON.parse(event.newValue || 'null'); } catch {}
    if (validSnapshot(next?.value)) applySnapshot(next.value, next.device, false);
  }
  scheduleRender();
  if (event.key === null || queueKey(event.key)) scheduleSync();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) connect(); });
window.addEventListener('pageshow', () => connect());
setInterval(() => { if (!document.hidden) { if (!device) connect(); else sync(); } }, 5000);
loadQueue(); render(); connect();
// Entertainment remains optional and cannot prevent saving.
import('./enhancements.js?v=6').then(({ mountEnhancements }) => {
  enhancements = mountEnhancements({ storage, announce: toast });
  enhancements.render(snapshot);
}).catch(() => {
  const button = $('sound-toggle'); if (button) button.disabled = true;
  const label = $('sound-label'); if (label) label.textContent = 'Звук недоступен';
});
