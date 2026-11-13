'use strict';

const palette = {
  graphite: { name: 'Графит', code: '01 / ГРАФИТ', main: '#454840', light: '#74776b', dark: '#22271f', scene: '#e9e6da', circle: '#d5d8b9' },
  clay: { name: 'Терракота', code: '02 / ТЕРРАКОТА', main: '#a8563e', light: '#d48c69', dark: '#663225', scene: '#eee1d5', circle: '#dfbaa0' },
  olive: { name: 'Олива', code: '03 / ОЛИВА', main: '#727948', light: '#a0a873', dark: '#3f472c', scene: '#e4e7d8', circle: '#c6cda9' },
  sand: { name: 'Песок', code: '04 / ПЕСОК', main: '#bdaa86', light: '#e2d5b6', dark: '#7d694b', scene: '#eee7d9', circle: '#dfcfad' }
};
const root = document.documentElement;
const art = document.getElementById('hat-art');
const stage = document.getElementById('hat-stage');
const tilt = document.getElementById('hat-tilt');
const greeting = document.getElementById('hat-greeting');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let greetingTimer;

function chooseColor(key) {
  const color = palette[key];
  if (!color) return;
  for (const property of ['main', 'light', 'dark']) root.style.setProperty(`--hat-${property}`, color[property]);
  root.style.setProperty('--scene', color.scene);
  root.style.setProperty('--circle', color.circle);
  document.getElementById('color-name').textContent = color.name;
  document.getElementById('color-code').textContent = color.code;
  art.setAttribute('aria-label', `Фетровая шляпа. Цвет: ${color.name}`);
  for (const swatch of document.querySelectorAll('[data-color]')) {
    const selected = swatch.dataset.color === key;
    swatch.classList.toggle('is-selected', selected);
    swatch.setAttribute('aria-pressed', String(selected));
  }
}

document.querySelectorAll('[data-color]').forEach(button => {
  button.addEventListener('click', () => chooseColor(button.dataset.color));
});

stage.addEventListener('pointermove', event => {
  if (reducedMotion.matches || event.pointerType !== 'mouse') return;
  const bounds = stage.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - 0.5;
  const y = (event.clientY - bounds.top) / bounds.height - 0.5;
  tilt.style.setProperty('--tilt-x', `${-y * 9}deg`);
  tilt.style.setProperty('--tilt-y', `${x * 12}deg`);
});
stage.addEventListener('pointerleave', () => {
  tilt.style.setProperty('--tilt-x', '0deg');
  tilt.style.setProperty('--tilt-y', '0deg');
});

document.getElementById('tip-hat').addEventListener('click', () => {
  clearTimeout(greetingTimer);
  if (!reducedMotion.matches) {
    art.classList.remove('is-tipping');
    void art.offsetWidth;
    art.classList.add('is-tipping');
  }
  greeting.textContent = 'Снимаю шляпу перед вами.';
  greeting.classList.add('is-visible');
  greetingTimer = setTimeout(() => {
    greeting.classList.remove('is-visible');
    greeting.textContent = '';
    art.classList.remove('is-tipping');
  }, 2200);
});

// Inline the same-origin artwork so that its felt colors inherit the page palette.
async function loadHat() {
  try {
    const response = await fetch(new URL('./hat.svg', document.baseURI));
    if (!response.ok) throw new Error('Artwork unavailable');
    const documentSvg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    if (documentSvg.querySelector('parsererror') || documentSvg.documentElement.localName !== 'svg') throw new Error('Invalid SVG');
    const svg = document.importNode(documentSvg.documentElement, true);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    art.replaceChildren(svg);
  } catch {
    const fallback = document.createElement('img');
    fallback.src = './hat.svg';
    fallback.alt = '';
    fallback.style.width = '100%';
    art.replaceChildren(fallback);
    document.getElementById('color-name').textContent = 'Графит';
    document.querySelectorAll('[data-color]').forEach(button => { button.disabled = true; });
    greeting.textContent = 'Не удалось загрузить палитру. Попробуйте обновить страницу.';
    greeting.classList.add('is-visible');
  }
}
loadHat();
