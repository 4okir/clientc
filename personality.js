// Presentation only: this module never reads or writes counter data or storage.
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-ten', threshold: 10, title: 'Первый десяток', description: 'Разогрев окончен. Диман вошёл в ритм.' }),
  Object.freeze({ id: 'fifty', threshold: 50, title: 'Полсотни в эфире', description: 'Пятьдесят поводов открыть форточку.' }),
  Object.freeze({ id: 'hundred', threshold: 100, title: 'Диман — ураган', description: 'Три цифры. Одна атмосферная легенда.' })
]);

export const PHRASES = Object.freeze([
  'Диман изменил атмосферу.',
  'Плюс один к легенде.',
  'Диман снова в эфире.',
  'Порыв засчитан.',
  'Вот это подача!',
  'Звук ушёл, цифра осталась.',
  'Тихо, но засчитано.',
  'В истории уже {total}. Диман продолжает.'
]);

function safeTotal(total) { return Number.isSafeInteger(total) && total >= 0 ? total : 0; }

// progress is an absolute count, suitable for <progress value=progress max=threshold>.
export function getAchievements(total) {
  const count = safeTotal(total);
  return ACHIEVEMENTS.map(achievement => ({
    ...achievement,
    earned: count >= achievement.threshold,
    progress: Math.min(count, achievement.threshold),
    remaining: Math.max(0, achievement.threshold - count)
  }));
}

export function getPhrase(total, previousIndex, random = Math.random) {
  const hasPrevious = Number.isInteger(previousIndex) && previousIndex >= 0 && previousIndex < PHRASES.length;
  const choices = PHRASES.length - (hasPrevious ? 1 : 0);
  let sample = 0;
  try { sample = typeof random === 'function' ? random() : 0; } catch { /* A cosmetic failure must remain harmless. */ }
  sample = Number.isFinite(sample) ? Math.max(0, Math.min(1 - Number.EPSILON, sample)) : 0;
  let index = Math.floor(sample * choices);
  if (hasPrevious && index >= previousIndex) index += 1;
  return { index, text: PHRASES[index].replace('{total}', String(safeTotal(total))) };
}

const FART_VARIANTS = Object.freeze([
  { duration: 0.23, high: 150, low: 55, pulses: 4, cutoff: 900, noise: 0.075, voice: 0.055 },
  { duration: 0.31, high: 110, low: 40, pulses: 7, cutoff: 650, noise: 0.085, voice: 0.065 },
  { duration: 0.43, high: 78, low: 29, pulses: 10, cutoff: 450, noise: 0.1, voice: 0.045 },
  { duration: 0.49, high: 135, low: 43, pulses: 15, cutoff: 1100, noise: 0.08, voice: 0.06 }
]);

// The caller owns the sound preference. Importing/constructing never starts audio.
// Invoke play() directly from the click gesture; it unlocks WebAudio internally.
export function createSoundPlayer({ AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext, random = Math.random } = {}) {
  const supported = typeof AudioContextCtor === 'function';
  let context = null, noiseBuffer = null, closed = false, busy = false;
  let lastPlayedAt = -Infinity, lastVariant = -1;
  const activeSources = new Set();
  const disconnect = node => { try { node.disconnect(); } catch {} };

  async function unlock() {
    if (!supported || closed) return false;
    try {
      if (!context) context = new AudioContextCtor({ latencyHint: 'interactive' });
      if (context.state === 'closed') return false;
      if (context.state !== 'running') await context.resume();
      return context.state === 'running';
    } catch { return false; }
  }

  async function play() {
    if (busy || closed) return false;
    busy = true;
    const nodes = [];
    const sources = [];
    try {
      if (!await unlock()) return false;
      const start = context.currentTime;
      if (start - lastPlayedAt < 0.08) return false;
      let sample = 0;
      try { sample = random(); } catch {}
      sample = Number.isFinite(sample) ? Math.max(0, Math.min(1 - Number.EPSILON, sample)) : 0;
      const choices = FART_VARIANTS.length - (lastVariant >= 0 ? 1 : 0);
      let variantIndex = Math.floor(sample * choices);
      if (lastVariant >= 0 && variantIndex >= lastVariant) variantIndex += 1;
      const variant = FART_VARIANTS[variantIndex];
      const { duration } = variant;
      const track = node => { nodes.push(node); return node; };
      if (!noiseBuffer) {
        noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.55), context.sampleRate);
        const channel = noiseBuffer.getChannelData(0);
        for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
      }
      const noise = track(context.createBufferSource()); noise.buffer = noiseBuffer;
      const filter = track(context.createBiquadFilter()); filter.type = 'lowpass';
      filter.frequency.setValueAtTime(variant.cutoff, start);
      filter.frequency.exponentialRampToValueAtTime(120, start + duration);
      filter.Q.setValueAtTime(0.7, start);
      const noiseGain = track(context.createGain());
      noiseGain.gain.setValueAtTime(0.0001, start);
      noiseGain.gain.linearRampToValueAtTime(variant.noise, start + 0.02);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(context.destination);

      const voice = track(context.createOscillator()); voice.type = 'sawtooth';
      voice.frequency.setValueAtTime(variant.high, start);
      const voiceGain = track(context.createGain());
      voiceGain.gain.setValueAtTime(0.0001, start);
      voiceGain.gain.linearRampToValueAtTime(variant.voice, start + 0.012);
      // Alternating pitch and pressure make a short comic "brrp", rather than a beep.
      for (let pulse = 1; pulse <= variant.pulses; pulse++) {
        const fraction = pulse / (variant.pulses + 1);
        const time = start + duration * fraction;
        const pitch = variant.high * Math.pow(variant.low / variant.high, fraction);
        voice.frequency.linearRampToValueAtTime(pitch * (pulse % 2 ? 1.18 : 0.82), time);
        voiceGain.gain.linearRampToValueAtTime(variant.voice * (pulse % 2 ? 0.48 : 1) * (1 - fraction * 0.55), time);
      }
      voice.frequency.exponentialRampToValueAtTime(variant.low, start + duration);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      voice.connect(voiceGain); voiceGain.connect(context.destination);

      sources.push(noise, voice);
      const cleanup = () => { for (const node of nodes) disconnect(node); for (const source of sources) activeSources.delete(source); };
      let ended = 0;
      for (const source of sources) {
        source.onended = () => { ended += 1; if (ended === sources.length) cleanup(); };
        activeSources.add(source);
        source.start(start); source.stop(start + duration + 0.015);
      }
      lastPlayedAt = start;
      lastVariant = variantIndex;
      return true;
    } catch {
      for (const source of sources) { try { source.stop(); } catch {} activeSources.delete(source); }
      for (const node of nodes) disconnect(node);
      return false;
    } finally { busy = false; }
  }

  async function close() {
    closed = true;
    for (const source of activeSources) { try { source.stop(); } catch {} disconnect(source); }
    activeSources.clear();
    if (context) { try { await context.close(); } catch {} }
    context = null; noiseBuffer = null;
  }

  return Object.freeze({ supported, unlock, play, close });
}
