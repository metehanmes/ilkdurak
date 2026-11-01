// Ekran yardımcıları: güvenli eleman üretimi, bildirim, onay penceresi, panel, kopyalama, paylaşma.

/** h('div', {class:'x', onclick}, 'metin', child) — metinler her zaman güvenli (textContent) eklenir */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v; // sadece sabit, bizim yazdığımız içerik için
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// Çizgi ikonlar (sabit SVG)
const ICONS = {
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.9"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L3.7 14a1.5 1.5 0 0 1 2.4-1.8L8 14"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
  pause: '<path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  share: '<path d="M12 4v11M7.5 8.5 12 4l4.5 4.5M5 13v6h14v-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  whatsapp: '<path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.4 18.5z"/><path d="M9.2 8.6c.3-.7.6-.7.9-.7h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.6l-.5.6c.6 1.1 1.5 2 2.6 2.6l.6-.5c.2-.1.4-.2.6-.1l1.6.7c.3.1.4.3.4.5v.5c0 .4-.4.9-1.1 1.1-1 .3-3-.4-4.6-2s-2.3-3.6-2-4.6"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>',
  locate: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5"/><circle cx="12" cy="12" r="7.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  sparkle: '<path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
};
export function icon(name, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.7');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}

// ── Bildirim
let toastBox;
export function toast(message, kind = 'info', ms = 3200) {
  if (!toastBox) { toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastBox); }
  const t = h('div', { class: `toast toast-${kind}` }, message);
  toastBox.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

// ── Onay penceresi (tarayıcının confirm() yerine; uygulama içi tarayıcılarda engellenmez)
export function confirmBox(text, { ok = 'Tamam', cancel = 'Vazgeç', danger = false } = {}) {
  return new Promise((resolve) => {
    const close = (v) => { wrap.remove(); document.body.classList.remove('noscroll'); resolve(v); };
    const wrap = h('div', { class: 'overlay', onclick: (e) => { if (e.target === wrap) close(false); } },
      h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
        h('p', { class: 'dialog-text' }, text),
        h('div', { class: 'row end' },
          h('button', { class: 'btn ghost', onclick: () => close(false) }, cancel),
          h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => close(true) }, ok))));
    document.body.appendChild(wrap);
    document.body.classList.add('noscroll');
    wrap.querySelector('.btn.primary, .btn.danger').focus();
  });
}

// ── Tam ekran panel (telefonda alttan açılan)
export function openSheet(title, content, { onClose, wide = false } = {}) {
  const prevFocus = document.activeElement;
  const close = () => {
    sheet.classList.remove('show');
    setTimeout(() => { wrap.remove(); if (!document.querySelector('.sheet-wrap')) document.body.classList.remove('noscroll'); }, 220);
    window.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const sheet = h('div', { class: `sheet${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title' }, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Kapat', onclick: close }, icon('x'))),
    h('div', { class: 'sheet-body' }, content));
  const wrap = h('div', { class: 'sheet-wrap' }, sheet);
  document.body.appendChild(wrap);
  document.body.classList.add('noscroll');
  window.addEventListener('keydown', onKey);
  requestAnimationFrame(() => sheet.classList.add('show'));
  return { close, sheet, body: sheet.querySelector('.sheet-body') };
}

// ── Kopyala / paylaş
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* aşağıdaki yönteme geç */ }
  const ta = h('textarea', { style: { position: 'fixed', top: '-1000px', opacity: '0' }, readonly: true });
  ta.value = text; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
export function whatsappLink(text, phone = '') {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

// ── Biçimlendirme (Türkiye saati)
const TZ = 'Europe/Istanbul';
export function fmtDateTime(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch { return new Date(iso).toLocaleString('tr-TR'); }
}
export function fmtShort(iso) {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }
  catch { return iso; }
}
export function fmtDistance(m) {
  if (m == null) return '';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}
export function fmtCountdown(ms) {
  if (ms <= 0) return 'şimdi';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  if (d > 0) return `${d} gün ${hh} saat`;
  if (hh > 0) return `${hh} saat ${mm} dakika`;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}
export function debounce(fn, ms) {
  let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); return fn(...a); };
  return d;
}
export function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch { /* yok */ } }

/** Düğmeyi işlem sürerken kilitle (çift tıklamayı önler) */
export async function busy(btn, fn) {
  if (btn.disabled) return;
  const label = btn.innerHTML;
  btn.disabled = true; btn.classList.add('loading');
  try { return await fn(); }
  finally { btn.disabled = false; btn.classList.remove('loading'); btn.innerHTML = label; }
}

/** Metin alanı + karakter sayacı */
export function field({ label, value = '', max, multiline = false, placeholder = '', hint = '', rows = 3, attrs = {}, onInput }) {
  const input = multiline
    ? h('textarea', { rows, maxlength: max, placeholder, ...attrs })
    : h('input', { type: 'text', maxlength: max, placeholder, ...attrs });
  input.value = value || '';
  const count = max ? h('span', { class: 'count' }, `${input.value.length}/${max}`) : null;
  input.addEventListener('input', () => { if (count) count.textContent = `${input.value.length}/${max}`; onInput && onInput(input.value); });
  const id = 'f' + Math.random().toString(36).slice(2, 9);
  input.id = id;
  return {
    el: h('div', { class: 'field' },
      h('div', { class: 'field-top' }, h('label', { for: id }, label), count),
      input,
      hint ? h('p', { class: 'field-hint' }, hint) : null),
    input,
  };
}

// ── Türkçe ek uyumu: "Mete'den", "Elif'ten", "Ayşe'den", "Burak'tan"
const BACK = 'aıou', FRONT = 'eiöü', HARD = 'çfhkpsştÇFHKPSŞT';
// İnce "l" ile biten yaygın isimler kalın ünlüye rağmen ince ek alır (Kemal'den, Hilal'den)
const FRONT_EXCEPTIONS = ['kemal', 'cemal', 'celal', 'hilal', 'bilal', 'iclal', 'ikbal', 'meral', 'ahval', 'nihal', 'kemalettin', 'saat', 'hakikat', 'sadakat'];
function lastVowel(w) {
  if (FRONT_EXCEPTIONS.includes(w.toLocaleLowerCase('tr-TR'))) return 'e';
  for (let i = w.length - 1; i >= 0; i--) {
    const c = w[i].toLocaleLowerCase('tr-TR');
    if (BACK.includes(c) || FRONT.includes(c)) return c;
    if ('âû'.includes(c)) return 'a';
    if ('î'.includes(c)) return 'i';
  }
  return 'e';
}
/** ayrılma eki (-den/-dan/-ten/-tan), kesme işaretiyle */
export function fromName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  const v = lastVowel(n);
  const t = HARD.includes(n[n.length - 1]) ? 't' : 'd';
  return `${n}'${t}${BACK.includes(v) ? 'an' : 'en'}`;
}
/** yönelme eki (-e/-a/-ye/-ya) */
export function toName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  const v = lastVowel(n);
  const endsVowel = (BACK + FRONT + 'âîû').includes(n[n.length - 1].toLocaleLowerCase('tr-TR'));
  return `${n}'${endsVowel ? 'y' : ''}${BACK.includes(v) ? 'a' : 'e'}`;
}
