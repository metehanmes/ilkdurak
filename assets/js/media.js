// Fotoğraf küçültme, ses kaydı ve ses çalma — telefon farklılıklarına karşı yedekli.
import { h, icon } from './ui.js';
import { isIOS } from './env.js';

export const MAX_PHOTO_INPUT = 30 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 120;

/**
 * Fotoğrafı en uzun kenarı 1600px JPEG'e çevirir (mobil veride hızlı açılsın).
 * iPhone'un HEIC fotoğrafları Safari'de otomatik JPEG'e döner; Android'de çözülemezse anlaşılır hata verir.
 */
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  if (!file) throw new Error('Dosya seçilmedi.');
  if (file.size > MAX_PHOTO_INPUT) throw new Error('Fotoğraf çok büyük (en fazla 30 MB).');
  if (file.type && !file.type.startsWith('image/')) throw new Error('Lütfen bir fotoğraf seç.');
  let bmp = null, w, hgt;
  try {
    if ('createImageBitmap' in window) {
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      w = bmp.width; hgt = bmp.height;
    }
  } catch { bmp = null; }
  let img = null;
  if (!bmp) {
    img = await new Promise((resolve, reject) => {
      const u = URL.createObjectURL(file);
      const i = new Image();
      i.onload = () => { URL.revokeObjectURL(u); resolve(i); };
      i.onerror = () => { URL.revokeObjectURL(u); reject(new Error(/hei[cf]/i.test(file.name + file.type)
        ? 'Bu fotoğraf biçimi (HEIC) bu tarayıcıda açılamıyor. Fotoğrafın ekran görüntüsünü alıp onu seçebilirsin.'
        : 'Bu fotoğraf açılamadı. Başka bir fotoğraf dene.')); };
      i.src = u;
    });
    w = img.naturalWidth; hgt = img.naturalHeight;
  }
  if (!w || !hgt) throw new Error('Bu fotoğraf açılamadı. Başka bir fotoğraf dene.');
  const scale = Math.min(1, maxSide / Math.max(w, hgt));
  const cw = Math.round(w * scale), ch = Math.round(hgt * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); // şeffaf PNG'ler siyah olmasın
  ctx.drawImage(bmp || img, 0, 0, cw, ch);
  if (bmp && bmp.close) bmp.close();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('Fotoğraf hazırlanamadı. Başka bir fotoğraf dene.');
  return { blob, width: cw, height: ch, type: 'image/jpeg', ext: 'jpg' };
}

// ── Ses kaydı
/** iPhone'da da çalınabilsin diye önce MP4/AAC, olmazsa WebM */
export function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const m of list) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* yok */ } }
  return '';
}
export function canRecord() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined');
}
export function extForMime(m) {
  const t = (m || '').split(';')[0];
  return { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/ogg': 'ogg' }[t] || 'm4a';
}
export function baseMime(m) { return (m || '').split(';')[0] || 'audio/mp4'; }

/**
 * Kayıt düğmesi + süre. onDone(blob, mime) kayıt bitince çağrılır.
 */
export function createRecorder({ onDone, onError }) {
  let rec = null, stream = null, chunks = [], started = 0, timer = null, mime = '';
  const timeEl = h('span', { class: 'rec-time' }, '0:00');
  const btn = h('button', { type: 'button', class: 'btn rec' }, icon('mic'), h('span', null, 'Kaydı başlat'));
  const box = h('div', { class: 'recorder' }, btn, timeEl);

  const stopAll = () => {
    clearInterval(timer); timer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    box.classList.remove('on');
    btn.replaceChildren(icon('mic'), h('span', null, 'Yeniden kaydet'));
  };
  btn.addEventListener('click', async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    try {
      mime = pickAudioMime();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      rec = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 }) : new MediaRecorder(stream);
      mime = rec.mimeType || mime || 'audio/mp4';
      chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stopAll();
        const blob = new Blob(chunks, { type: baseMime(mime) });
        if (blob.size < 800) { onError && onError(new Error('Ses kaydedilemedi. Mikrofonun çalıştığından emin ol.')); return; }
        onDone && onDone(blob, baseMime(mime));
      };
      rec.start(1000);
      started = Date.now();
      box.classList.add('on');
      btn.replaceChildren(icon('stop'), h('span', null, 'Kaydı bitir'));
      timer = setInterval(() => {
        const s = Math.floor((Date.now() - started) / 1000);
        timeEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        if (s >= MAX_AUDIO_SECONDS) rec.stop();
      }, 250);
    } catch (e) {
      stopAll();
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      onError && onError(new Error(denied
        ? 'Mikrofon izni verilmedi. Tarayıcı ayarlarından bu site için mikrofona izin verip tekrar dene.'
        : 'Mikrofon açılamadı. Hazır bir ses dosyası da yükleyebilirsin.'));
    }
  });
  return { el: box, stop: () => { if (rec && rec.state === 'recording') rec.stop(); else stopAll(); } };
}

/**
 * Ses çalar: iPhone otomatik çalmaya izin vermediği için her zaman dokunarak başlar.
 * Çalınamazsa (ör. iPhone'da WebM) anlaşılır mesaj gösterir.
 */
export function audioPlayer(src, label = 'Sesli mesajı dinle') {
  const audio = new Audio();
  audio.preload = 'none';
  audio.src = src;
  const bar = h('span', { class: 'ap-bar' }, h('span', { class: 'ap-fill' }));
  const time = h('span', { class: 'ap-time' }, '');
  const btn = h('button', { type: 'button', class: 'ap-btn', 'aria-label': label }, icon('play', 22));
  const msg = h('p', { class: 'ap-msg', hidden: true }, '');
  const el = h('div', { class: 'audio-player' }, btn, h('div', { class: 'ap-main' }, h('span', { class: 'ap-label' }, label), bar, time), msg);
  const fmt = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');
  audio.addEventListener('timeupdate', () => {
    if (audio.duration && isFinite(audio.duration)) bar.firstChild.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
    time.textContent = fmt(audio.currentTime) + (isFinite(audio.duration) ? ' / ' + fmt(audio.duration) : '');
  });
  audio.addEventListener('ended', () => { btn.replaceChildren(icon('play', 22)); el.classList.remove('playing'); });
  audio.addEventListener('pause', () => { btn.replaceChildren(icon('play', 22)); el.classList.remove('playing'); });
  audio.addEventListener('play', () => { btn.replaceChildren(icon('pause', 22)); el.classList.add('playing'); });
  audio.addEventListener('error', () => {
    msg.hidden = false;
    msg.textContent = isIOS ? 'Bu ses kaydı iPhone\'da çalınamadı. Gönderen kişiden mesajı yazılı iletmesini isteyebilirsin.' : 'Ses kaydı açılamadı. İnternet bağlantını kontrol edip tekrar dene.';
  });
  btn.addEventListener('click', async () => {
    if (!audio.paused) { audio.pause(); return; }
    try { await audio.play(); } catch (e) {
      if (e && e.name === 'NotSupportedError') audio.dispatchEvent(new Event('error'));
    }
  });
  bar.addEventListener('click', (e) => {
    if (!audio.duration || !isFinite(audio.duration)) return;
    const r = bar.getBoundingClientRect();
    audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
  });
  return { el, audio };
}
