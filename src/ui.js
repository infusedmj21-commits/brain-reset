export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

let toastTimer;
export function toast(message) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2200);
}

/** Run fn every second until the view changes. */
export function ticker(fn, ctx) {
  fn();
  // 4 times a second, so a just-started timer never looks stuck.
  const id = setInterval(fn, 250);
  ctx.onCleanup(() => clearInterval(id));
}

/** Big countdown ring. --p is 0–100 elapsed. */
export function timerRing({ id, label, time, fraction = 0, colour = 'var(--grape)', soft = 'var(--grape-soft)' }) {
  return `<div class="timer-ring" id="${id}" style="--p:${Math.round(fraction * 100)};--ring:${colour};--ring-soft:${soft}">
    <div class="timer-face"><div class="timer-time num" data-time>${esc(time)}</div><div class="timer-label" data-label>${esc(label)}</div></div>
  </div>`;
}

export function updateRing(el, { time, label, fraction, over = false }) {
  if (!el) return;
  el.style.setProperty('--p', Math.round(fraction * 100));
  el.classList.toggle('over', over);
  const t = el.querySelector('[data-time]');
  if (t && t.textContent !== time) t.textContent = time;
  const l = el.querySelector('[data-label]');
  if (l && label != null && l.textContent !== label) l.textContent = label;
}

// A short two-note chime when a timer ends. Needs a prior tap to be allowed to play,
// which the Start buttons provide. Vibrates too where supported (not iPhone).
let audioCtx;
export function unlockAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    /* no audio */
  }
}
export function chime() {
  try {
    unlockAudio();
    const t0 = audioCtx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.35);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + i * 0.18);
      o.stop(t0 + i * 0.18 + 0.4);
    });
  } catch {
    /* no audio */
  }
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([120, 80, 120]);
}

/** Shrink a photo to at most maxSide px as JPEG, so notes photos stay small. */
export async function compressImage(file, maxSide = 1600, quality = 0.8) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function confirmAction(message) {
  return window.confirm(message);
}
