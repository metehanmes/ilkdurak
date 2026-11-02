// Sinematik anlar: yumuşak piyano (cihazda üretilir, dosya indirmez), daktilo yazısı, kalp atışı titreşimi.
const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const sleep = (ms) => new Promise((r) => setTimeout(r, reduce() ? Math.min(ms, 60) : ms));

/** Metni harf harf yazar. Dokunulursa hemen tamamlar. */
export async function typeText(el, text, { speed = 38, skipOn = document } = {}) {
  el.textContent = '';
  if (!text) return;
  if (reduce()) { el.textContent = text; return; }
  let skip = false;
  const onSkip = () => { skip = true; };
  skipOn.addEventListener('pointerdown', onSkip, { once: true });
  const caret = document.createElement('span');
  caret.className = 'caret';
  for (let i = 0; i < text.length; i++) {
    if (skip) break;
    el.textContent = text.slice(0, i + 1);
    el.appendChild(caret);
    const ch = text[i];
    await new Promise((r) => setTimeout(r, '.!?…'.includes(ch) ? speed * 9 : ',;:'.includes(ch) ? speed * 4 : speed));
  }
  el.textContent = text;
  skipOn.removeEventListener('pointerdown', onSkip);
}

export function heartbeat(times = 2) {
  try { if (navigator.vibrate) navigator.vibrate(Array.from({ length: times }, () => [70, 110, 90, 650]).flat()); } catch { /* yok */ }
}

// ── Müzik: Am–F–C–G üzerinde yavaş arpej + yumuşak zemin. İlk dokunuştan sonra başlar (telefonlar ancak böyle izin verir).
let ctx = null, master = null, timer = null, playing = false;
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function reverb(c) {
  const len = c.sampleRate * 2.6, buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
  const v = c.createConvolver(); v.buffer = buf; return v;
}
function note(midi, t, dur, vol) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle'; o2.type = 'sine';
  o.frequency.value = hz(midi); o2.frequency.value = hz(midi + 12);
  const g2 = ctx.createGain(); g2.gain.value = 0.18;
  o.connect(g); o2.connect(g2).connect(g); g.connect(master);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
function pad(chord, t, dur) {
  for (const m of chord) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = hz(m - 12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 1.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.1);
  }
}
export function musicStart() {
  if (playing) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') ctx.resume();
    master = ctx.createGain(); master.gain.value = 0.0001;
    const rv = reverb(ctx), dry = ctx.createGain(), wet = ctx.createGain();
    dry.gain.value = 0.7; wet.gain.value = 0.55;
    master.connect(dry).connect(ctx.destination);
    master.connect(rv).connect(wet).connect(ctx.destination);
    master.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 2.5);
    playing = true;
    let bar = 0, next = ctx.currentTime + 0.1;
    const BAR = 3.2;
    const schedule = () => {
      while (next < ctx.currentTime + 1.5) {
        const ch = CHORDS[bar % 4];
        pad(ch, next, BAR + 0.6);
        const seq = [ch[0], ch[1], ch[2], ch[1] + 12, ch[2], ch[1]];
        seq.forEach((m, i) => note(m + 12, next + i * (BAR / 6), 2.2, i === 3 ? 0.11 : 0.08));
        bar++; next += BAR;
      }
    };
    schedule();
    timer = setInterval(schedule, 400);
    return true;
  } catch { return false; }
}
export function musicStop(fade = 1.5) {
  if (!playing || !ctx) return;
  playing = false;
  const m = master, t = timer;
  try { m.gain.cancelScheduledValues(ctx.currentTime); m.gain.setValueAtTime(m.gain.value, ctx.currentTime); m.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + fade); } catch { /* yok */ }
  setTimeout(() => { clearInterval(t); try { m.disconnect(); } catch { /* yok */ } }, fade * 1000 + 100);
}
export const musicPlaying = () => playing;

/** Sağ üstte müziği aç/kapat düğmesi */
export function musicToggle(h, icon) {
  const btn = h('button', { class: 'music-btn', type: 'button', 'aria-label': 'Müziği aç/kapat' });
  const draw = () => { btn.replaceChildren(icon(playing ? 'volume' : 'mute', 20)); btn.classList.toggle('on', playing); };
  btn.addEventListener('click', () => { if (playing) musicStop(0.6); else musicStart(); setTimeout(draw, 50); });
  draw();
  return btn;
}
