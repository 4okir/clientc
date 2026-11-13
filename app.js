import { DEVICE_KEY, SNAPSHOT_KEY, PENDING_PREFIX, validDevice, validSnapshot, readJson, readPending, storeOperation, removeOperation, eventBody, mergeSnapshot } from './counter-state.js?v=3';

const API = "https://diman-counter-4okir.mythic-peach-5761.chatgpt.site";
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
const cached = readJson(storage, SNAPSHOT_KEY);
let snapshot = validSnapshot(cached?.value) ? cached.value : null;
if (snapshot && cached.device !== device?.device) snapshot = { ...snapshot, ownLastEventId: null };
let reachable = false, syncing = false, reading = false, starting = false;
let lastSuccess = 0, lastOrder = Date.now() * 1000, toastTimer, animationTimer;
const LIMIT = 500;
let enhancements = null;

function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 7000); }
function pending() { try { return readPending(storage); } catch { return []; } }
function undoTarget(operations = pending()) {
  if (!device) return null;
  const own = operations.filter(value => value.device === device.device);
  const cancelled = new Set(own.filter(value => value.action === 'undo').map(value => value.target));
  const latest = [...own].reverse().find(value => value.action === 'increment' && !cancelled.has(value.id));
  if (latest) return latest.id;
  return snapshot?.ownLastEventId && !cancelled.has(snapshot.ownLastEventId) ? snapshot.ownLastEventId : null;
}
function render() {
  const operations = pending();
  $('counter-value').textContent = snapshot ? format.format(snapshot.total) : '—';
  $('today-value').textContent = snapshot && dayFormat.format(new Date(snapshot.serverTime)) === dayFormat.format(new Date()) ? format.format(snapshot.today) : '—';
  $('last-value').textContent = snapshot?.lastAt ? timeFormat.format(new Date(snapshot.lastAt)) + ' МСК' : 'Пока тихо';
  $('increment').disabled = !device || operations.length >= LIMIT;
  $('undo').disabled = !undoTarget(operations) || operations.length >= LIMIT;
  const fresh = reachable && Date.now() - lastSuccess < 18000;
  document.body.dataset.connection = fresh ? (operations.length || syncing ? 'syncing' : 'online') : (starting ? 'syncing' : 'offline');
  $('connection-status').textContent = fresh ? (operations.length ? 'Сохраняем в общую базу…' : 'Сохранено · общий для всех')
    : starting ? 'Подключаем общую базу…' : snapshot ? 'Нет связи · последнее сохранённое число' : 'Не удалось подключиться к базе';
  $('retry-sync').hidden = fresh || starting;
  $('pending-note').textContent = operations.length
    ? 'Ожидают подтверждения: ' + format.format(operations.length) + '. ' + (persistent ? 'Очередь сохранена на этом устройстве.' : 'Оставьте страницу открытой до сохранения.')
    : persistent ? '' : 'Данные уже в общей базе. При потере связи оставьте страницу открытой до подтверждения.';
  $('counter-value').style.fontSize = snapshot?.total >= 1000000 ? 'clamp(56px, 13vw, 145px)' : '';
  try { enhancements?.render(snapshot); } catch { /* Optional presentation never blocks the counter. */ }
}
function applySnapshot(value, sourceDevice) {
  if (!validSnapshot(value)) throw new Error('Сервер вернул некорректное значение.');
  if (snapshot && value.revision < snapshot.revision) return;
  const previousTotal = snapshot?.total;
  const ownLastEventId = sourceDevice === device?.device ? value.ownLastEventId : snapshot?.ownLastEventId ?? null;
  snapshot = mergeSnapshot(snapshot, { ...value, ownLastEventId });
  try { storage.setItem(SNAPSHOT_KEY, JSON.stringify({ value: snapshot, device: device?.device })); } catch { /* The confirmed value remains on the server. */ }
  reachable = true; lastSuccess = Date.now();
  if (previousTotal !== undefined && previousTotal !== snapshot.total && !reducedMotion.matches) {
    clearTimeout(animationTimer);
    $('counter-value').classList.remove('is-bumping'); $('stage-puff').classList.remove('is-puffing');
    void $('counter-value').offsetWidth;
    $('counter-value').classList.add('is-bumping'); $('stage-puff').classList.add('is-puffing');
    animationTimer = setTimeout(() => { $('counter-value').classList.remove('is-bumping'); $('stage-puff').classList.remove('is-puffing'); }, 700);
  }
  render();
}
async function request(path, { method = 'GET', token, body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(API + path, {
      method, credentials: 'omit', cache: 'no-store', signal: controller.signal,
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const value = await response.json();
    if (!response.ok) { const error = new Error(value.error || 'Не удалось сохранить. Попробуем ещё раз.'); error.status = response.status; throw error; }
    return value;
  } finally { clearTimeout(timeout); }
}
async function connect() {
  if (starting) return;
  starting = true; render();
  try {
    if (!device) {
      const identity = await request('/api/device', { method: 'POST' });
      if (!validDevice(identity)) throw new Error('Не удалось подключить устройство.');
      device = identity;
      try { storage.setItem(DEVICE_KEY, JSON.stringify(device)); } catch { persistent = false; }
    }
    await refresh();
    if (reachable) await flush();
  } catch { reachable = false; }
  finally { starting = false; render(); }
}
async function refresh() {
  if (!device || reading) return;
  reading = true;
  try {
    const value = await request('/api/count?device=' + encodeURIComponent(device.device), { token: device.token });
    applySnapshot(value, device.device);
  } catch (error) {
    reachable = false;
    if (error.status === 401 && !pending().length) { device = null; try { storage.removeItem(DEVICE_KEY); } catch {} }
  } finally { reading = false; render(); }
}
async function flush() {
  if (syncing || !device) return;
  syncing = true; render();
  try {
    for (let i = 0; i < LIMIT; i++) {
      const operation = pending()[0];
      if (!operation) break;
      try {
        const value = await request('/api/events', { method: 'POST', token: operation.token, body: eventBody(operation) });
        let firstAcknowledgement = false;
        try { firstAcknowledgement = storage.getItem(PENDING_PREFIX + operation.id) !== null; } catch {}
        applySnapshot(value, operation.device);
        removeOperation(storage, operation.id);
        if (firstAcknowledgement && operation.action === 'increment' && operation.device === device.device) {
          try { Promise.resolve(enhancements?.confirmedIncrement(snapshot?.total ?? value.total)).catch(() => {}); } catch {}
        }
      } catch (error) {
        if (operation.action === 'undo' && [404, 409].includes(error.status)) {
          removeOperation(storage, operation.id);
          toast('Нажатие уже отменено или не найдено. Обновляем общий счётчик.');
          continue;
        }
        reachable = false;
        if (error.status) toast(error.message);
        break;
      }
      render();
    }
  } finally { syncing = false; render(); }
  if (reachable) await refresh();
}
function enqueue(action, target) {
  if (!device) return;
  const operations = pending();
  if (operations.length >= LIMIT) { toast('Очередь заполнена. Дождитесь синхронизации.'); return; }
  lastOrder = Math.max(Date.now() * 1000, lastOrder + 1, ...operations.map(value => value.order + 1));
  const operation = { action, id: crypto.randomUUID(), device: device.device, token: device.token, order: lastOrder, ...(target ? { target } : {}) };
  try { storeOperation(storage, operation); }
  catch { toast('Браузер не смог сохранить нажатие. Попробуйте освободить место и повторить.'); return; }
  toast(action === 'increment' ? 'Зафиксировали. Сохраняем…' : 'Отменяем ваше последнее нажатие…');
  render(); flush();
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
window.addEventListener('offline', () => { reachable = false; render(); });
window.addEventListener('storage', event => {
  if (event.key?.startsWith(PENDING_PREFIX)) { render(); flush(); }
  if (event.key === SNAPSHOT_KEY) {
    const next = readJson(storage, SNAPSHOT_KEY);
    if (validSnapshot(next?.value) && (!snapshot || next.value.revision >= snapshot.revision)) {
      snapshot = { ...next.value, ownLastEventId: next.device === device?.device ? next.value.ownLastEventId : snapshot?.ownLastEventId ?? null }; render();
    }
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) connect(); });
window.addEventListener('pageshow', () => connect());
setInterval(() => { if (!document.hidden) { if (!device) connect(); else { refresh(); flush(); } } }, 5000);
render(); connect();
// Load entertainment after the reliable counter has started; failed downloads stay optional.
import('./enhancements.js?v=5').then(({ mountEnhancements }) => {
  enhancements = mountEnhancements({ storage, announce: toast });
  enhancements.render(snapshot);
}).catch(() => {
  const button = $('sound-toggle'); if (button) button.disabled = true;
  const label = $('sound-label'); if (label) label.textContent = 'Звук недоступен';
});
