import { getAchievements, getPhrase, createSoundPlayer } from './personality.js?v=4';

export const SOUND_KEY = 'diman-counter:preferences:sound-v1';

// This optional layer cannot change the counter, its queue, credentials or database.
export function mountEnhancements({ document = globalThis.document, storage, announce = () => {}, soundFactory = createSoundPlayer, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? { matches: false } }) {
  const $ = id => document.getElementById(id);
  const number = new Intl.NumberFormat('ru-RU');
  const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' });
  const soundButton = $('sound-toggle');
  const player = soundFactory();
  let soundEnabled = false, userUnlocked = false, phraseIndex = -1, previousTotal = null;
  try { soundEnabled = storage.getItem(SOUND_KEY) === 'true'; } catch {}
  function soundState() {
    soundButton.disabled = !player.supported;
    soundButton.setAttribute('aria-pressed', String(soundEnabled && player.supported));
    $('sound-label').textContent = player.supported ? (soundEnabled ? 'Звук: вкл.' : 'Звук: выкл.') : 'Звук недоступен';
  }
  function saveSound() { try { storage.setItem(SOUND_KEY, String(soundEnabled)); } catch {} }
  soundState();
  soundButton.addEventListener('click', async () => {
    try {
      if (!player.supported) return;
      if (soundEnabled) { soundEnabled = false; userUnlocked = false; saveSound(); soundState(); return; }
      const allowed = await player.unlock();
      soundEnabled = allowed === true;
      userUnlocked = allowed === true;
      saveSound(); soundState();
      if (!allowed) announce('Не получилось включить звук. Попробуйте ещё раз.');
    } catch { soundEnabled = false; userUnlocked = false; saveSound(); soundState(); }
  });
  // Unlock only during the user's click; the puff waits for server confirmation.
  $('increment').addEventListener('click', () => {
    if (soundEnabled) {
      try { Promise.resolve(player.unlock()).then(allowed => { userUnlocked = allowed === true; }).catch(() => {}); } catch {}
    }
  });
  function render(snapshot) {
    try {
      const known = Number.isSafeInteger(snapshot?.total) && snapshot.total >= 0;
      const total = known ? snapshot.total : 0;
      const hasRecord = Number.isSafeInteger(snapshot?.dailyRecord) && snapshot.dailyRecord >= 0;
      $('record-value').textContent = hasRecord ? number.format(snapshot.dailyRecord) : '—';
      const day = typeof snapshot?.recordDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(snapshot.recordDay)
        ? new Date(snapshot.recordDay + 'T12:00:00+03:00') : null;
      $('record-date').textContent = hasRecord ? (day && Number.isFinite(day.getTime()) ? date.format(day) : 'Рекорд ещё впереди') : 'Лучший день за всё время';
      for (const achievement of getAchievements(total)) {
        const threshold = achievement.threshold;
        const card = $('achievement-' + threshold);
        const progress = $('achievement-progress-' + threshold);
        $('achievement-title-' + threshold).textContent = achievement.title;
        $('achievement-description-' + threshold).textContent = achievement.description;
        progress.max = threshold; progress.value = achievement.progress;
        progress.textContent = number.format(achievement.progress) + ' из ' + number.format(threshold);
        const status = !known ? 'Ждём сохранённый результат' : achievement.earned ? 'Открыто' : 'Осталось ' + number.format(achievement.remaining);
        progress.setAttribute('aria-valuetext', status);
        $('achievement-status-' + threshold).textContent = status;
        card.classList.toggle('is-earned', known && achievement.earned);
        if (!achievement.earned) card.classList.remove('is-newly-earned');
        if (known && previousTotal !== null && previousTotal < threshold && total >= threshold && !reducedMotion.matches && !document.hidden) {
          card.classList.add('is-newly-earned');
          setTimeout(() => card.classList.remove('is-newly-earned'), 1400);
        }
      }
      if (known) previousTotal = total;
      return true;
    } catch { return false; }
  }
  async function confirmedIncrement(total) {
    try {
      const phrase = getPhrase(total, phraseIndex); phraseIndex = phrase.index;
      $('diman-phrase').textContent = phrase.text;
      announce(phrase.text + ' Сохранено.');
      if (soundEnabled && userUnlocked && !document.hidden) await player.play();
      return true;
    } catch { return false; }
  }
  return Object.freeze({ render, confirmedIncrement });
}
