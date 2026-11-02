// Sürprizi hazırlayan kişinin ekranı (hazirla.html)
import { CONFIG } from './config.js';
import { db, storage, ensureAnonymousSession, ApiError } from './sb.js';
import { h, $, clear, icon, toast, confirmBox, openSheet, copyText, whatsappLink, fmtDateTime, fmtShort, debounce, busy, field, toName, vibrate } from './ui.js';
import { installErrorReporting, installOfflineBanner, inAppBrowser, openInBrowserHint } from './env.js';
import { compressImage, createRecorder, canRecord, audioPlayer, extForMime, baseMime } from './media.js';
import { createPicker, parseCoords, searchPlaces, getPosition } from './map.js';
import { TEMPLATES, UNLOCK_TYPES, fill } from './templates.js';

installErrorReporting('creator');
installOfflineBanner();

const app = $('#app');
const LAST_KEY = 'ilk.last.journey';
const STATUS_LABEL = { draft: ['Taslak', ''], active: ['Gönderildi', 'ok'], completed: ['Tamamlandı', 'rose'], disabled: ['Kapatıldı', 'bad'] };
const PLAN_LABEL = { mini: 'Mini', standart: 'Standart', ozel: 'Biz Hazırlayalım' };
const AUDIO_TYPES = ['audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg'];

let J = null;          // açık yolculuk
let STOPS = [];        // durakları
let saveState;         // kayıt göstergesi

const baseUrl = () => location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
const playLink = (j) => `${baseUrl()}s.html#${j.play_token}`;
const editLink = (j) => `${baseUrl()}hazirla.html#duzenle=${j.id}.${j.claim_secret}`;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

// ───────────────────────── başlangıç ─────────────────────────
async function boot() {
  loader('Hazırlanıyor…');
  try {
    await ensureAnonymousSession();
  } catch (e) {
    return fatal('Başlatılamadı', e.message, true);
  }
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('duzenle=')) {
    const [id, secret] = hash.slice(8).split('.');
    try {
      const r = await db.rpc('ilk_claim', { p_journey: id, p_secret: secret });
      if (r.ok) { toast('Yolculuğun bu cihaza bağlandı.', 'ok'); history.replaceState(null, '', `#${id}`); }
      else toast('Düzenleme bağlantısı geçersiz.', 'bad', 5000);
    } catch (e) { toast(e.message, 'bad'); }
  }
  await route();
}

async function route() {
  const want = decodeURIComponent(location.hash.slice(1)).replace(/^duzenle=.*/, '');
  let list = [];
  try {
    list = await db.select('ilk_journeys', 'select=id,recipient_name,sender_name,status,template,updated_at,plan&order=updated_at.desc', { retries: 2 });
  } catch (e) {
    return fatal('Yolculukların yüklenemedi', e.message, true);
  }
  const last = (() => { try { return localStorage.getItem(LAST_KEY); } catch { return null; } })();
  const target = want || last;
  if (target && target !== 'yeni' && list.some((j) => j.id === target)) return openEditor(target);
  // Bu cihazda açılan yolculuk artık burada değilse (düzenleme bağlantısı başka telefonda açıldıysa) açıkça söyle
  if (target && target !== 'yeni' && /^[0-9a-f-]{36}$/.test(target)) {
    try { localStorage.removeItem(LAST_KEY); } catch { /* yok */ }
    history.replaceState(null, '', location.pathname);
    setTimeout(() => toast('Bu yolculuk başka bir cihaza taşınmış. Burada devam etmek için düzenleme bağlantını bu telefonda aç.', 'info', 9000), 300);
  }
  if (want === 'yeni' || !list.length) return viewStart(list.length > 0);
  return viewList(list);
}

window.addEventListener('hashchange', () => { if (!document.querySelector('.sheet-wrap')) route(); });

function loader(text) {
  clear(app);
  app.appendChild(h('div', { class: 'loader' }, h('div', { class: 'center' }, h('div', { class: 'loader-dot', style: { margin: '0 auto 14px' } }), h('p', { class: 'muted' }, text))));
}
function fatal(title, text, retry) {
  clear(app);
  app.appendChild(h('div', { class: 'wrap' }, h('div', { class: 'card center', style: { marginTop: '40px' } },
    h('h2', null, title), h('p', { class: 'muted' }, text || ''),
    retry ? h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Tekrar dene') : null)));
}
function topbar(extra) {
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: 'index.html' }, h('span', { class: 'brand-mark' }, icon('heart')), CONFIG.BRAND),
    extra || null);
}

// ───────────────────────── yolculuklarım ─────────────────────────
function viewList(list) {
  clear(app);
  app.append(topbar(), h('main', { class: 'wrap' },
    h('h1', null, 'Yolculukların'),
    h('p', { class: 'muted' }, 'Devam etmek istediğine dokun ya da yeni bir tane başlat.'),
    h('div', { class: 'stack', style: { margin: '18px 0' } },
      list.map((j) => {
        const [lbl, cls] = STATUS_LABEL[j.status] || ['', ''];
        return h('button', { class: 'tpl', onclick: () => { location.hash = j.id; } },
          h('span', { class: 'tpl-ico' }, icon('heart', 22)),
          h('span', { class: 'grow' },
            h('span', { class: 'tpl-title', style: { display: 'block' } }, j.recipient_name ? `${j.recipient_name} için` : 'İsimsiz yolculuk'),
            h('span', { class: 'tpl-sub' }, `${TEMPLATES[j.template]?.title || ''} · ${fmtShort(j.updated_at)}`)),
          h('span', { class: `pill ${cls}` }, lbl));
      })),
    h('button', { class: 'btn primary block', onclick: () => { location.hash = 'yeni'; } }, icon('plus'), 'Yeni yolculuk başlat')));
}

// ───────────────────────── yeni yolculuk ─────────────────────────
function viewStart(hasOthers) {
  let chosen = 'yildonumu';
  clear(app);
  const iab = inAppBrowser();
  const cards = Object.entries(TEMPLATES).map(([k, t]) => h('button', {
    class: `tpl${k === chosen ? ' on' : ''}`, 'data-tpl': k,
    onclick: (e) => { chosen = k; app.querySelectorAll('.tpl').forEach((b) => b.classList.toggle('on', b.dataset.tpl === k)); e.currentTarget.blur(); },
  }, h('span', { class: 'tpl-ico' }, icon(k === 'teklif' ? 'sparkle' : k === 'dogumgunu' ? 'heart' : k === 'serbest' ? 'edit' : 'pin', 22)),
  h('span', null, h('span', { class: 'tpl-title', style: { display: 'block' } }, t.title), h('span', { class: 'tpl-sub' }, t.tagline))));
  const sender = field({ label: 'Senin adın', max: 40, placeholder: 'ör. Mert', hint: 'Alıcı "Mert\'ten sana" diye görecek.', attrs: { autocomplete: 'given-name' } });
  const recip = field({ label: 'Sürprizi kime hazırlıyorsun?', max: 40, placeholder: 'ör. Ece', attrs: { autocomplete: 'off' } });
  const go = h('button', { class: 'btn primary block' }, 'Hazırlamaya başla', icon('arrow'));
  go.addEventListener('click', () => busy(go, async () => {
    const r = recip.input.value.trim();
    if (!r) { recip.input.focus(); toast('Sürprizi kime hazırladığını yaz.', 'bad'); return; }
    await createJourney(chosen, sender.input.value.trim(), r);
  }));
  app.append(topbar(hasOthers ? h('a', { class: 'btn ghost small', href: '#' , onclick: (e) => { e.preventDefault(); history.replaceState(null, '', location.pathname); try { localStorage.removeItem(LAST_KEY); } catch {} route(); } }, 'Yolculuklarım') : null),
    h('main', { class: 'wrap' },
      iab ? h('div', { class: 'note warn', style: { marginBottom: '14px' } }, icon('info'), h('span', null, openInBrowserHint())) : null,
      h('p', { class: 'eyebrow' }, 'Yeni yolculuk'),
      h('h1', null, 'Nasıl bir sürpriz?'),
      h('p', { class: 'muted' }, 'Bir şablon seç; örnek ipuçları hazır gelir, hepsini değiştirebilirsin.'),
      h('div', { class: 'tpl-grid', style: { margin: '16px 0 22px' } }, cards),
      h('div', { class: 'card' }, sender.el, recip.el, go),
      h('p', { class: 'tiny center', style: { marginTop: '14px' } }, 'Hazırlamak ücretsiz. Sadece göndermeden önce paket kodu gerekir.')));
  setTimeout(() => sender.input.focus(), 50);
}

async function createJourney(tplKey, senderName, recipName) {
  const t = TEMPLATES[tplKey];
  const j = await db.insert('ilk_journeys', {
    template: tplKey, sender_name: senderName, recipient_name: recipName,
    intro_message: fill(t.intro, recipName), final_title: t.final_title, final_message: fill(t.final_message, recipName),
  });
  let pos = 1;
  for (const s of t.stops) {
    await db.insert('ilk_stops', {
      journey_id: j.id, position: pos++, place_label: s.place_label, clue: s.clue, unlock_type: s.unlock_type,
      question: s.question || '', answers: [], hint: s.hint || '',
    });
  }
  try { localStorage.setItem(LAST_KEY, j.id); sessionStorage.setItem('ilk.welcome', j.id); } catch { /* yok */ }
  location.hash = j.id;
}

// ───────────────────────── düzenleyici ─────────────────────────
async function loadJourney(id) {
  const [j] = await db.select('ilk_journeys', `id=eq.${id}&select=*`, { retries: 2 });
  if (!j) throw new ApiError('Yolculuk bulunamadı.');
  J = j;
  STOPS = await db.select('ilk_stops', `journey_id=eq.${id}&select=*&order=position.asc`, { retries: 2 });
}

async function openEditor(id) {
  loader('Yolculuğun açılıyor…');
  try { await loadJourney(id); } catch (e) { return fatal('Açılamadı', e.message, true); }
  try { localStorage.setItem(LAST_KEY, id); } catch { /* yok */ }
  if (location.hash.slice(1) !== id) history.replaceState(null, '', `#${id}`);
  renderEditor();
  let welcome = null; try { welcome = sessionStorage.getItem('ilk.welcome'); } catch { /* yok */ }
  if (welcome === id) {
    try { sessionStorage.removeItem('ilk.welcome'); } catch { /* yok */ }
    showEditLinkSheet(true);
  }
}

const locked = () => J.status === 'completed' || J.status === 'disabled';
const stopLimit = () => (J.plan === 'mini' ? 3 : 7);

const pending = {};
const flush = debounce(async () => {
  const patch = { ...pending };
  for (const k of Object.keys(pending)) delete pending[k];
  if (!Object.keys(patch).length) return;
  setSave('saving');
  try {
    const r = await db.update('ilk_journeys', `id=eq.${J.id}`, patch);
    if (!r) throw new ApiError('Kaydedilemedi: yolculuk değiştirilemez durumda olabilir.');
    Object.assign(J, r);
    setSave('ok');
  } catch (e) {
    Object.assign(pending, patch, { ...pending });
    setSave('err', e.message);
  }
}, 700);
function saveJourney(patch) { Object.assign(pending, patch); setSave('dirty'); flush(); }
window.addEventListener('beforeunload', (e) => { if (Object.keys(pending).length) { flush.flush(); e.preventDefault(); e.returnValue = ''; } });
function setSave(kind, msg) {
  if (!saveState) return;
  saveState.className = 'save-state' + (kind === 'err' ? ' err' : '');
  saveState.replaceChildren(
    kind === 'saving' || kind === 'dirty' ? 'Kaydediliyor…' :
      kind === 'ok' ? h('span', { class: 'row', style: { gap: '4px' } }, icon('check', 15), 'Kaydedildi') :
        kind === 'err' ? h('button', { class: 'link-btn', onclick: () => flush.flush() }, `Kaydedilemedi, tekrar dene`) : '');
  if (kind === 'err' && msg) toast(msg, 'bad', 5000);
}

function problemsLocal() {
  const out = [];
  if (!J.recipient_name.trim()) out.push({ code: 'recipient_name' });
  if (!STOPS.length) out.push({ code: 'no_stops' });
  for (const s of STOPS) {
    if (!s.clue.trim()) out.push({ code: 'clue', position: s.position });
    if (s.unlock_type === 'question' && (!s.question.trim() || !(s.answers || []).length)) out.push({ code: 'question', position: s.position });
    if (s.unlock_type === 'location' && (s.lat == null || s.lng == null)) out.push({ code: 'location', position: s.position });
    if (s.unlock_type === 'code' && !s.code.trim()) out.push({ code: 'code', position: s.position });
    if (!s.reveal_message.trim() && !s.photo_path && !s.audio_path) out.push({ code: 'reveal', position: s.position });
  }
  if (!J.final_message.trim() && !J.final_photo_path && !J.final_audio_path) out.push({ code: 'final' });
  return out;
}
const PROBLEM_TEXT = {
  recipient_name: () => 'Sürprizi alacak kişinin adını yaz.',
  no_stops: () => 'En az bir durak ekle.',
  clue: (p) => `Durak ${p}: ipucu boş.`,
  question: (p) => `Durak ${p}: soru ve en az bir doğru cevap yaz.`,
  location: (p) => `Durak ${p}: haritadan konum seç.`,
  code: (p) => `Durak ${p}: gizli kodu yaz.`,
  reveal: (p) => `Durak ${p}: orada açılacak bir mesaj, fotoğraf ya da ses ekle.`,
  final: () => 'Son sürpriz için bir mesaj, fotoğraf ya da ses ekle.',
};

function renderEditor() {
  const [lbl, cls] = STATUS_LABEL[J.status] || ['', ''];
  saveState = h('span', { class: 'save-state' }, '');
  clear(app);
  const ro = locked();

  const sender = field({ label: 'Senin adın', value: J.sender_name, max: 40, attrs: { disabled: ro || null }, onInput: (v) => saveJourney({ sender_name: v.trim() }) });
  const recip = field({ label: 'Sürprizi alacak kişi', value: J.recipient_name, max: 40, attrs: { disabled: ro || null }, onInput: (v) => { saveJourney({ recipient_name: v.trim() }); } });
  const intro = field({ label: 'Açılış mesajı', value: J.intro_message, max: 800, multiline: true, rows: 4, hint: 'Bağlantıyı açınca ilk bunu okuyacak.', attrs: { disabled: ro || null }, onInput: (v) => saveJourney({ intro_message: v }) });
  const ftitle = field({ label: 'Son sürprizin başlığı', value: J.final_title, max: 80, placeholder: 'ör. Arkana dön', hint: 'Büyük harflerle ekranda belirecek. "Arkana dön" gibi bir cümle, yanına gittiğin an için harika olur.', attrs: { disabled: ro || null }, onInput: (v) => saveJourney({ final_title: v }) });
  const fmsg = field({ label: 'Son mesaj', value: J.final_message, max: 1200, multiline: true, rows: 4, attrs: { disabled: ro || null }, onInput: (v) => saveJourney({ final_message: v }) });

  const problems = problemsLocal();
  const stopsBox = h('div', { class: 'stack' });
  STOPS.forEach((s, i) => stopsBox.appendChild(stopItem(s, i, problems, ro)));
  const addBtn = h('button', { class: 'btn outline block', disabled: ro || STOPS.length >= stopLimit() || null, onclick: () => editStop(null) }, icon('plus'), 'Durak ekle');

  app.append(
    topbar(h('span', { class: 'row', style: { gap: '8px' } }, saveState, h('a', { class: 'icon-btn', href: '#', title: 'Yolculuklarım', 'aria-label': 'Yolculuklarım', onclick: (e) => { e.preventDefault(); try { localStorage.removeItem(LAST_KEY); } catch {} history.replaceState(null, '', location.pathname); route(); } }, icon('back')))),
    h('main', { class: 'wrap' },
      h('div', { class: 'row between', style: { alignItems: 'flex-start' } },
        h('div', null, h('p', { class: 'eyebrow', style: { marginBottom: '4px' } }, TEMPLATES[J.template]?.title || 'Yolculuk'),
          h('h1', { style: { fontSize: '30px' } }, J.recipient_name ? `${J.recipient_name} için` : 'Yolculuğun')),
        h('span', { class: `pill ${cls}` }, lbl, J.plan ? ` · ${PLAN_LABEL[J.plan]}` : '')),
      J.status === 'active' ? h('div', { class: 'live-cta' },
        h('div', null, h('strong', null, 'Gönderildi'), h('p', { class: 'small', style: { margin: '2px 0 0' } }, `${J.recipient_name || 'Alıcı'} yolculuğa çıkınca hangi durakta olduğunu buradan canlı izle.`)),
        h('button', { class: 'btn primary', 'data-live': '1', onclick: openLive }, h('span', { class: 'live-dot' }), 'Canlı takip')) : null,
      ro ? h('div', { class: 'note', style: { margin: '6px 0 14px' } }, icon('lock'), h('span', null, 'Bu yolculuk tamamlandı, artık değiştirilemez.')) : null,

      h('section', { class: 'card' }, h('h2', { class: 'card-title' }, icon('heart'), 'Başlangıç'), sender.el, recip.el, intro.el),

      h('section', { class: 'card' },
        h('div', { class: 'row between' }, h('h2', { class: 'card-title' }, icon('pin'), 'Duraklar'), h('span', { class: 'tiny' }, `${STOPS.length}/${stopLimit()}`)),
        h('p', { class: 'small muted' }, 'Her durakta alıcı önce ipucunu okur, oraya gider, sonra senin bıraktığın anı açılır.'),
        stopsBox, h('div', { style: { marginTop: '12px' } }, addBtn),
        J.plan === 'mini' ? h('p', { class: 'tiny', style: { marginTop: '8px' } }, 'Mini pakette en fazla 3 durak olabilir.') : null),

      h('section', { class: 'card' }, h('h2', { class: 'card-title' }, icon('sparkle'), 'Son sürpriz'),
        ftitle.el, fmsg.el,
        h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('label', null, 'Fotoğraf (isteğe bağlı)')),
          photoInput(J.final_photo_path, async (p) => { await db.update('ilk_journeys', `id=eq.${J.id}`, { final_photo_path: p }); J.final_photo_path = p; refreshProblemsBadge(); }, ro)),
        h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('label', null, 'Sesli mesaj (isteğe bağlı)')),
          audioInput(J.final_audio_path, async (p) => { await db.update('ilk_journeys', `id=eq.${J.id}`, { final_audio_path: p }); J.final_audio_path = p; refreshProblemsBadge(); }, ro))),

      h('section', { class: 'card flat' },
        h('h2', { class: 'card-title' }, icon('lock'), 'Düzenleme bağlantın'),
        h('p', { class: 'small muted' }, 'Hesap açmadan hazırlıyorsun. Başka bir telefondan devam etmek için bu bağlantıyı kendine kaydet.'),
        h('button', { class: 'btn small', onclick: () => showEditLinkSheet(false) }, icon('share', 18), 'Bağlantıyı kendime kaydet')),

      J.status === 'draft' ? h('div', { class: 'center', style: { marginTop: '22px' } },
        h('button', { class: 'link-btn', style: { color: 'var(--bad)' }, onclick: deleteJourney }, 'Bu yolculuğu sil')) : null),

    h('div', { class: 'bottom-bar' }, h('div', { class: 'inner' },
      h('button', { class: 'btn', onclick: (e) => busy(e.currentTarget, startTest) }, icon('play', 18), 'Dene'),
      h('button', { class: 'btn primary', 'data-send': '1', onclick: () => openSend() }, J.status === 'draft' ? 'Gönder' : 'Paylaş', icon('arrow')))),
  );
  refreshProblemsBadge();
}

function refreshProblemsBadge() {
  const btn = app.querySelector('[data-send]');
  if (!btn || J.status !== 'draft') return;
  const n = problemsLocal().length;
  btn.querySelector('.pill')?.remove();
  if (n) btn.appendChild(h('span', { class: 'pill', style: { background: 'rgba(255,255,255,.25)', color: '#fff', marginLeft: '4px' } }, `${n} eksik`));
}

function stopItem(s, i, problems, ro) {
  const mine = problems.filter((p) => p.position === s.position);
  const t = UNLOCK_TYPES[s.unlock_type];
  return h('div', { class: 'card flat', style: { padding: '14px' } },
    h('div', { class: 'stop-item' },
      h('span', { class: 'stop-num' }, String(s.position)),
      h('div', { class: 'stop-body' },
        h('div', { class: 'stop-place' }, s.place_label || `Durak ${s.position}`),
        h('p', { class: 'stop-clue' }, s.clue || 'İpucu henüz yazılmadı'),
        h('div', { class: 'stop-meta' },
          h('span', { class: 'pill' }, icon(t.icon, 15), t.short),
          s.photo_path ? h('span', { class: 'pill' }, icon('image', 15), 'Fotoğraf') : null,
          s.audio_path ? h('span', { class: 'pill' }, icon('mic', 15), 'Ses') : null,
          mine.length ? h('span', { class: 'pill warn' }, `${mine.length} eksik`) : h('span', { class: 'pill ok' }, icon('check', 15), 'Hazır')))),
    h('div', { class: 'stop-tools' },
      h('button', { class: 'btn small grow', onclick: () => editStop(s) }, icon('edit', 17), ro ? 'Gör' : 'Düzenle'),
      h('button', { class: 'icon-btn', 'aria-label': 'Yukarı taşı', disabled: ro || i === 0 || null, onclick: (e) => busy(e.currentTarget, () => move(i, -1)) }, icon('up')),
      h('button', { class: 'icon-btn', 'aria-label': 'Aşağı taşı', disabled: ro || i === STOPS.length - 1 || null, onclick: (e) => busy(e.currentTarget, () => move(i, 1)) }, icon('down')),
      h('button', { class: 'icon-btn', 'aria-label': 'Durağı sil', disabled: ro || null, onclick: () => removeStop(s) }, icon('trash'))));
}

async function move(i, d) {
  const ids = STOPS.map((s) => s.id);
  [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
  try {
    await db.rpc('ilk_reorder', { p_journey: J.id, p_ids: ids });
    await reloadStops();
  } catch (e) { toast(e.message, 'bad'); }
}
async function removeStop(s) {
  if (!(await confirmBox(`Durak ${s.position} silinsin mi? İçindeki fotoğraf ve ses de silinir.`, { ok: 'Sil', danger: true }))) return;
  try {
    await db.rpc('ilk_delete_stop', { p_stop: s.id });
    storage.remove([s.photo_path, s.audio_path]);
    await reloadStops();
    toast('Durak silindi.');
  } catch (e) { toast(e.message, 'bad'); }
}
async function reloadStops() {
  STOPS = await db.select('ilk_stops', `journey_id=eq.${J.id}&select=*&order=position.asc`, { retries: 2 });
  const y = window.scrollY;
  renderEditor();
  window.scrollTo(0, y);
}
async function deleteJourney() {
  if (!(await confirmBox('Bu yolculuk ve içindeki tüm fotoğraf ve sesler kalıcı olarak silinsin mi?', { ok: 'Evet, sil', danger: true }))) return;
  try {
    const files = [J.final_photo_path, J.final_audio_path, ...STOPS.flatMap((s) => [s.photo_path, s.audio_path])];
    await db.remove('ilk_journeys', `id=eq.${J.id}`);
    storage.remove(files);
    try { localStorage.removeItem(LAST_KEY); } catch { /* yok */ }
    history.replaceState(null, '', location.pathname);
    toast('Yolculuk silindi.');
    route();
  } catch (e) { toast(e.message, 'bad'); }
}

// ───────────────────────── fotoğraf / ses girişleri ─────────────────────────
function photoInput(path, onSet, ro, instant = true) {
  const box = h('div');
  const draw = (p) => {
    clear(box);
    if (p) {
      box.appendChild(h('div', { class: 'media-row' }, h('div', { class: 'thumb' },
        h('img', { src: storage.publicUrl(p), alt: 'Seçilen fotoğraf' }),
        ro ? null : h('button', { class: 'x', type: 'button', 'aria-label': 'Fotoğrafı kaldır', onclick: async () => {
          try { await onSet(null); if (instant) storage.remove([p]); draw(null); } catch (e) { toast(e.message, 'bad'); }
        } }, icon('x', 16)))));
      return;
    }
    if (ro) { box.appendChild(h('p', { class: 'tiny' }, 'Fotoğraf yok')); return; }
    const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const bar = h('div', { class: 'upload-bar', hidden: true }, h('span'));
    const btn = h('button', { type: 'button', class: 'btn small', onclick: () => input.click() }, icon('camera', 18), 'Fotoğraf ekle');
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      input.value = '';
      if (!f) return;
      await busy(btn, async () => {
        try {
          const img = await compressImage(f);
          bar.hidden = false;
          const newPath = `${J.id}/${uid()}.${img.ext}`;
          await storage.upload(newPath, img.blob, img.type, (x) => { bar.firstChild.style.width = `${Math.round(x * 100)}%`; });
          await onSet(newPath);
          draw(newPath);
        } catch (e) { bar.hidden = true; toast(e.message, 'bad', 6000); }
      });
    });
    box.append(btn, input, bar);
  };
  draw(path);
  return box;
}

function audioInput(path, onSet, ro, instant = true) {
  const box = h('div');
  const draw = (p) => {
    clear(box);
    if (p) {
      box.append(audioPlayer(storage.publicUrl(p), 'Sesli mesaj').el,
        ro ? null : h('button', { type: 'button', class: 'link-btn', style: { marginTop: '8px' }, onclick: async () => {
          try { await onSet(null); if (instant) storage.remove([p]); draw(null); } catch (e) { toast(e.message, 'bad'); }
        } }, 'Sesi kaldır'));
      return;
    }
    if (ro) { box.appendChild(h('p', { class: 'tiny' }, 'Ses yok')); return; }
    const bar = h('div', { class: 'upload-bar', hidden: true }, h('span'));
    const status = h('p', { class: 'tiny', hidden: true });
    const upload = async (blob, mime) => {
      if (blob.size > 10 * 1024 * 1024) throw new Error('Ses dosyası çok büyük (en fazla 10 MB, yaklaşık 10 dakika).');
      bar.hidden = false; status.hidden = false; status.textContent = 'Ses yükleniyor…';
      const newPath = `${J.id}/${uid()}.${extForMime(mime)}`;
      await storage.upload(newPath, blob, baseMime(mime), (x) => { bar.firstChild.style.width = `${Math.round(x * 100)}%`; });
      await onSet(newPath);
      draw(newPath);
    };
    const rec = canRecord() ? createRecorder({
      onDone: async (blob, mime) => { try { await upload(blob, mime); } catch (e) { bar.hidden = true; status.hidden = true; toast(e.message, 'bad', 6000); } },
      onError: (e) => toast(e.message, 'bad', 6000),
    }) : null;
    const file = h('input', { type: 'file', accept: 'audio/*', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      const type = baseMime(f.type || (/\.m4a$/i.test(f.name) ? 'audio/mp4' : /\.mp3$/i.test(f.name) ? 'audio/mpeg' : ''));
      if (!AUDIO_TYPES.includes(type)) { toast('Bu ses biçimi desteklenmiyor. M4A ya da MP3 dosyası seç.', 'bad', 6000); return; }
      if (type === 'audio/webm' || type === 'audio/ogg') toast('Not: Bu biçim bazı iPhone\'larda çalmayabilir. Mümkünse M4A ya da MP3 kullan.', 'info', 6000);
      try { await upload(f, type); } catch (e) { bar.hidden = true; status.hidden = true; toast(e.message, 'bad', 6000); }
    });
    box.append(
      rec ? rec.el : h('p', { class: 'tiny' }, 'Bu tarayıcı ses kaydını desteklemiyor; hazır bir ses dosyası yükleyebilirsin.'),
      h('button', { type: 'button', class: 'link-btn', style: { marginTop: '6px' }, onclick: () => file.click() }, 'ya da ses dosyası yükle'),
      file, bar, status,
      h('p', { class: 'field-hint' }, 'En fazla 2 dakika. Sessiz bir yerde, telefonu ağzına yakın tutarak kaydet.'));
  };
  draw(path);
  return box;
}

// ───────────────────────── durak düzenleme ─────────────────────────
function editStop(stop) {
  const ro = locked();
  const isNew = !stop;
  const s = stop ? { ...stop, answers: [...(stop.answers || [])] } : {
    place_label: '', clue: '', unlock_type: 'question', question: '', answers: [], hint: '', code: '',
    lat: null, lng: null, radius_m: 80, reveal_message: '', photo_path: null, audio_path: null,
  };
  const uploaded = []; // bu panelde yüklenip kaydedilmezse silinecek dosyalar
  const replaced = []; // kaydedilince silinecek eski dosyalar
  let picker = null;
  let saved = false;

  const place = field({ label: 'Yerin adı', value: s.place_label, max: 60, placeholder: 'ör. İlk buluştuğumuz kafe', hint: 'Sadece senin listende ve en sondaki "Hikâyemiz" sayfasında görünür. İpucunu ele vermez.', onInput: (v) => { s.place_label = v; } });
  const clue = field({ label: 'İpucu', value: s.clue, max: 600, multiline: true, rows: 3, placeholder: 'ör. Her şeyin başladığı yere git. İlk kahvemizi içtiğimiz yeri hatırlıyor musun?', hint: 'Alıcı bunu okuyup oraya gidecek. Sadece ikinizin anlayacağı ipuçları en güzeli.', onInput: (v) => { s.clue = v; } });

  const typeBox = h('div');
  const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Vardığını nasıl anlayalım?' },
    Object.entries(UNLOCK_TYPES).map(([k, t]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(k === s.unlock_type), class: k === s.unlock_type ? 'on' : '', 'data-type': k, disabled: ro || null,
      onclick: () => { s.unlock_type = k; seg.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.type === k); b.setAttribute('aria-checked', String(b.dataset.type === k)); }); drawType(); } },
    icon(t.icon), t.label)));

  const drawType = () => {
    if (picker) { picker.destroy(); picker = null; }
    clear(typeBox);
    typeBox.appendChild(h('p', { class: 'field-hint', style: { margin: '8px 2px 12px' } }, UNLOCK_TYPES[s.unlock_type].help));
    if (s.unlock_type === 'question') {
      const q = field({ label: 'Soru', value: s.question, max: 300, placeholder: 'ör. O gün ne içmiştik?', onInput: (v) => { s.question = v; } });
      const chips = h('div', { class: 'chips' });
      const drawChips = () => { clear(chips); s.answers.forEach((a, idx) => chips.appendChild(h('span', { class: 'chip' }, a, ro ? null : h('button', { type: 'button', 'aria-label': `${a} cevabını sil`, onclick: () => { s.answers.splice(idx, 1); drawChips(); } }, icon('x', 15))))); };
      const ansInput = h('input', { type: 'text', maxlength: 80, placeholder: 'Doğru cevap', autocomplete: 'off', disabled: ro || null });
      const addAns = () => {
        const v = ansInput.value.trim();
        if (!v) return;
        if (s.answers.length >= 5) { toast('En fazla 5 doğru cevap yazabilirsin.', 'bad'); return; }
        if (!s.answers.some((a) => a.toLocaleLowerCase('tr-TR') === v.toLocaleLowerCase('tr-TR'))) s.answers.push(v);
        ansInput.value = ''; drawChips(); ansInput.focus();
      };
      ansInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addAns(); } });
      ansInput.addEventListener('blur', () => { if (ansInput.value.trim()) addAns(); });
      const hint = field({ label: 'Yardım ipucu (isteğe bağlı)', value: s.hint, max: 300, placeholder: 'ör. İnce belli bardakta…', hint: 'Alıcı "İpucu al"a basarsa görür.', onInput: (v) => { s.hint = v; } });
      drawChips();
      typeBox.append(q.el,
        h('div', { class: 'field' },
          h('div', { class: 'field-top' }, h('label', null, 'Doğru cevaplar')),
          h('div', { class: 'row' }, ansInput, h('button', { type: 'button', class: 'btn small', disabled: ro || null, onclick: addAns }, 'Ekle')),
          h('div', { style: { marginTop: '10px' } }, chips),
          h('p', { class: 'field-hint' }, 'Birden fazla yazım ekleyebilirsin (ör. "çay", "demli çay"). Büyük/küçük harf, Türkçe karakter ve küçük yazım hataları sorun olmaz. 3 yanlıştan sonra alıcı cevabı görüp devam edebilir.')),
        hint.el);
    } else if (s.unlock_type === 'code') {
      const c = field({ label: 'Gizli kod', value: s.code, max: 40, placeholder: 'ör. ILKOPUCUK', hint: 'Kodu oraya bir kâğıda yaz ya da oradaki birine emanet et. Boşluk, tire ve büyük/küçük harf fark etmez.', attrs: { autocapitalize: 'characters', autocomplete: 'off' }, onInput: (v) => { s.code = v; } });
      const hint = field({ label: 'Yardım ipucu (isteğe bağlı)', value: s.hint, max: 300, placeholder: 'ör. Garsona adını söyle', onInput: (v) => { s.hint = v; } });
      typeBox.append(c.el, hint.el);
    } else if (s.unlock_type === 'location') {
      typeBox.appendChild(locationEditor(s, ro, (p) => { picker = p; }));
    } else {
      const hint = field({ label: 'Yardım ipucu (isteğe bağlı)', value: s.hint, max: 300, onInput: (v) => { s.hint = v; } });
      typeBox.append(hint.el);
    }
  };

  const reveal = field({ label: 'Mesajın', value: s.reveal_message, max: 1200, multiline: true, rows: 4, placeholder: 'ör. Seni ilk gördüğüm an hâlâ aklımda…', onInput: (v) => { s.reveal_message = v; } });
  const photoBox = photoInput(s.photo_path, async (p) => { if (s.photo_path && !uploaded.includes(s.photo_path)) replaced.push(s.photo_path); if (p) uploaded.push(p); s.photo_path = p; }, ro, false);
  const audioBox = audioInput(s.audio_path, async (p) => { if (s.audio_path && !uploaded.includes(s.audio_path)) replaced.push(s.audio_path); if (p) uploaded.push(p); s.audio_path = p; }, ro, false);

  const saveBtn = h('button', { class: 'btn primary grow', disabled: ro || null }, icon('check'), 'Kaydet');
  const content = h('div', null,
    place.el, clue.el,
    h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('label', null, 'Vardığını nasıl anlayalım?')), seg, typeBox),
    h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '22px 0' } }),
    h('h3', null, 'Orada ne açılsın?'),
    h('p', { class: 'small muted' }, 'Alıcı durağı açınca bunları görecek. En az birini ekle.'),
    reveal.el,
    h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('label', null, 'Fotoğraf')), photoBox),
    h('div', { class: 'field' }, h('div', { class: 'field-top' }, h('label', null, 'Sesli mesaj')), audioBox),
    h('div', { class: 'row', style: { marginTop: '18px', position: 'sticky', bottom: '0', background: 'var(--paper)', padding: '10px 0' } },
      h('button', { class: 'btn ghost', onclick: () => sheet.close() }, 'Vazgeç'), saveBtn));

  const sheet = openSheet(isNew ? `Yeni durak (${STOPS.length + 1})` : `Durak ${s.position}`, content, {
    onClose: () => {
      if (picker) picker.destroy();
      // kaydedilmeden kapatıldıysa bu panelde yüklenen dosyalar çöp kalmasın
      if (!saved && uploaded.length) storage.remove(uploaded);
    },
  });
  drawType();

  saveBtn.addEventListener('click', () => busy(saveBtn, async () => {
    const row = {
      place_label: s.place_label.trim(), clue: s.clue.trim(), unlock_type: s.unlock_type, question: s.question.trim(),
      answers: s.answers, hint: s.hint.trim(), code: s.code.trim(), lat: s.lat, lng: s.lng, radius_m: s.radius_m,
      reveal_message: s.reveal_message.trim(), photo_path: s.photo_path, audio_path: s.audio_path,
    };
    try {
      if (isNew) await db.insert('ilk_stops', { ...row, journey_id: J.id, position: STOPS.length + 1 });
      else {
        const r = await db.update('ilk_stops', `id=eq.${s.id}`, row);
        if (!r) throw new ApiError('Kaydedilemedi. Sayfayı yenileyip tekrar dene.');
      }
      saved = true;
      // eski dosyalar ve bu panelde yüklenip sonra değiştirilenler silinir; kaydedilenler kalır
      storage.remove([...replaced, ...uploaded.filter((p) => p !== s.photo_path && p !== s.audio_path)]);
      uploaded.length = 0;
      sheet.close();
      await reloadStops();
      toast('Durak kaydedildi.', 'ok');
    } catch (e) { toast(e.message, 'bad', 5000); }
  }));
}

function locationEditor(s, ro, setPicker) {
  const wrap = h('div');
  const mapBox = h('div');
  const coordText = h('p', { class: 'tiny', style: { margin: '6px 2px' } });
  const showCoord = () => { coordText.textContent = s.lat != null ? `Seçilen nokta: ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}` : 'Henüz nokta seçilmedi. Haritaya dokun ya da aşağıdan bul.'; };
  const radiusLbl = h('span', { class: 'tiny' });
  const radius = h('input', { type: 'range', min: 30, max: 300, step: 10, value: s.radius_m || 80, style: { width: '100%' }, disabled: ro || null });
  const drawRadius = () => { radiusLbl.textContent = `${radius.value} m — alıcı bu kadar yaklaşınca açılır`; };
  radius.addEventListener('input', () => { s.radius_m = Number(radius.value); drawRadius(); picker && picker.setRadius(s.radius_m); });
  let picker = null;
  const others = STOPS.filter((o) => o.lat != null && o.id !== s.id).map((o) => ({ lat: o.lat, lng: o.lng, label: o.place_label || `Durak ${o.position}` }));
  createPicker(mapBox, { lat: s.lat, lng: s.lng, radius: s.radius_m, others, onChange: ({ lat, lng }) => { if (ro) return; s.lat = lat; s.lng = lng; showCoord(); } })
    .then((p) => { if (!document.contains(mapBox)) { p.destroy(); return; } picker = p; setPicker(p); });

  const here = h('button', { type: 'button', class: 'btn small', disabled: ro || null }, icon('locate', 18), 'Şu an buradayım');
  here.addEventListener('click', () => busy(here, async () => {
    try {
      const p = await getPosition();
      s.lat = p.lat; s.lng = p.lng; showCoord();
      picker && picker.set(p.lat, p.lng);
      if (p.accuracy > 60) toast(`Konum hassasiyeti düşük (±${Math.round(p.accuracy)} m). Gerekirse iğneyi elle düzelt.`, 'info', 5000);
    } catch (e) {
      toast(e.kind === 'denied' ? 'Konum izni verilmedi. Haritaya dokunarak da seçebilirsin.' : 'Konum alınamadı. Haritaya dokunarak seçebilirsin.', 'bad', 5000);
    }
  }));

  const q = h('input', { type: 'search', placeholder: 'Yer ara (ör. Moda Sahili, Kadıköy)', enterkeyhint: 'search', disabled: ro || null });
  const results = h('ul', { class: 'search-results', hidden: true });
  const doSearch = h('button', { type: 'button', class: 'btn small', disabled: ro || null }, icon('search', 18), 'Ara');
  const run = () => busy(doSearch, async () => {
    const text = q.value.trim();
    if (text.length < 3) { toast('En az 3 harf yaz.'); return; }
    const c = parseCoords(text);
    if (c) { s.lat = c.lat; s.lng = c.lng; showCoord(); picker && picker.set(c.lat, c.lng); results.hidden = true; return; }
    try {
      const list = await searchPlaces(text);
      clear(results);
      if (!list.length) { results.hidden = false; results.appendChild(h('li', null, h('button', { type: 'button', disabled: true }, 'Sonuç bulunamadı. Daha genel bir ad dene ya da haritaya dokun.'))); return; }
      results.hidden = false;
      for (const r of list) {
        results.appendChild(h('li', null, h('button', { type: 'button', onclick: () => { s.lat = r.lat; s.lng = r.lng; showCoord(); picker && picker.set(r.lat, r.lng); results.hidden = true; } }, r.name)));
      }
    } catch (e) { toast(e.message, 'bad', 5000); }
  });
  doSearch.addEventListener('click', run);
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });

  const paste = h('input', { type: 'text', placeholder: 'Koordinat ya da Google Haritalar bağlantısı yapıştır', disabled: ro || null });
  paste.addEventListener('change', () => {
    const c = parseCoords(paste.value);
    if (!c) { toast('Bu bağlantıdan konum okunamadı. "41.0123, 29.0456" biçiminde koordinat yapıştırabilirsin. (Kısa "goo.gl" bağlantıları okunamaz; bağlantıyı tarayıcıda açıp adres çubuğundakini kopyala.)', 'bad', 8000); return; }
    s.lat = c.lat; s.lng = c.lng; showCoord(); picker && picker.set(c.lat, c.lng); paste.value = '';
    toast('Konum yerleştirildi.', 'ok');
  });

  showCoord(); drawRadius();
  wrap.append(
    h('div', { class: 'row', style: { marginBottom: '8px' } }, q, doSearch),
    results,
    h('div', { style: { margin: '10px 0' } }, mapBox),
    coordText,
    h('div', { class: 'row wrap-row', style: { margin: '8px 0 12px' } }, here),
    paste,
    h('div', { class: 'field', style: { marginTop: '14px' } }, h('div', { class: 'field-top' }, h('label', null, 'Yaklaşma mesafesi'), radiusLbl), radius),
    h('div', { class: 'note' }, icon('info'), h('span', null, 'Kapalı mekânlarda ve yüksek binaların arasında telefon konumu 50–100 m şaşabilir. Alıcı 2 denemeden sonra "Buradayım" diyerek devam edebilir.')));
  return wrap;
}

// ───────────────────────── deneme ─────────────────────────
async function startTest() {
  flush.flush();
  const probs = problemsLocal().filter((p) => p.code !== 'final');
  if (!STOPS.length) { toast('Denemek için en az bir durak ekle.', 'bad'); return; }
  if (probs.length) toast('Bazı eksikler var; deneme yine açılıyor ama eksik duraklar düzgün çalışmayabilir.', 'info', 4500);
  try { await db.rpc('ilk_reset_test', { p_journey: J.id }); } catch { /* yok */ }
  try { localStorage.removeItem(`ilk.intro.ilk.cache.t.${J.id}`); } catch { /* yok */ }
  location.href = `s.html?deneme=${encodeURIComponent(J.id)}`;
}

// ───────────────────────── düzenleme bağlantısı ─────────────────────────
function showEditLinkSheet(welcome) {
  const link = editLink(J);
  openSheet(welcome ? 'Hoş geldin!' : 'Düzenleme bağlantın', h('div', { class: 'stack' },
    welcome ? h('p', null, `${J.recipient_name ? toName(J.recipient_name) + ' ' : ''}hazırlayacağın yolculuğun taslağı hazır. Örnek ipuçlarını kendi anılarınla değiştir, her durağa bir mesaj, fotoğraf ya da ses ekle.`) : null,
    h('div', { class: 'note rose' }, icon('lock'), h('span', null, 'Hesap açmadan hazırlıyorsun. Telefonunu değiştirirsen ya da tarayıcı verilerini silersen yolculuğuna bu bağlantıyla geri dönersin. Bağlantıyı hangi cihazda açarsan yolculuk o cihaza geçer. Kimseyle paylaşma; bu, alıcıya gidecek bağlantı değil.')),
    h('div', { class: 'link-box mono' }, link),
    h('div', { class: 'row wrap-row' },
      h('button', { class: 'btn small', onclick: async () => { toast((await copyText(link)) ? 'Kopyalandı.' : 'Kopyalanamadı; elle seç.', 'ok'); } }, icon('copy', 18), 'Kopyala'),
      h('a', { class: 'btn wa small', href: whatsappLink(`İlk Durak düzenleme bağlantım (kimseyle paylaşma): ${link}`), target: '_blank', rel: 'noopener' }, icon('whatsapp', 18), 'Kendime WhatsApp\'tan gönder'))));
}


// ───────────────────────── canlı takip ─────────────────────────
// Alıcının konumu izlenmez; sadece hangi durakta olduğu ve sayfaya en son ne zaman baktığı görünür.
function chime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; const c = new AC();
    [784, 988, 1319].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * 0.18;
      o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 1);
    });
  } catch { /* yok */ }
}
function agoText(seen, now) {
  if (!seen) return null;
  const s = Math.max(0, (new Date(now) - new Date(seen)) / 1000);
  if (s < 75) return 'şu an ekrana bakıyor';
  if (s < 3600) return `${Math.round(s / 60)} dk önce baktı`;
  return `${fmtShort(seen)} tarihinde baktı`;
}
function openLive() {
  const name = J.recipient_name || 'Alıcı';
  const head = h('div', { class: 'live-head' });
  const list = h('ol', { class: 'live-list' });
  const alertBox = h('div', { 'aria-live': 'assertive' });
  const foot = h('p', { class: 'tiny center', style: { marginTop: '14px' } }, 'Bu ekran açık kaldıkça her birkaç saniyede bir güncellenir. Son durağa gelince sesli uyarı verir.');
  const body = h('div', null, alertBox, head, list, foot);
  let timer = null, lock = null, lastPos = null, alerted = false, done = false;
  const sheet = openSheet(`${name} nerede?`, body, { onClose: () => { clearTimeout(timer); try { lock && lock.release(); } catch { /* yok */ } document.title = 'Hazırla — İlk Durak'; } });
  try { navigator.wakeLock && navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {}); } catch { /* yok */ }
  const draw = (st) => {
    const total = st.total || STOPS.length, pos = st.position || 0;
    const completed = st.status === 'completed';
    const ago = agoText(st.seen_at, st.now);
    head.replaceChildren(
      h('div', { class: `live-state${completed ? ' done' : st.started_at ? ' on' : ''}` },
        h('span', { class: 'live-dot' }),
        h('strong', null, completed ? `${name} yolculuğu tamamladı` : st.started_at ? `${name} yolculukta: ${pos}/${total} durak açıldı` : `${name} bağlantıyı henüz açmadı`)),
      ago ? h('p', { class: 'small muted', style: { margin: '6px 0 0' } }, ago) : null);
    clear(list);
    STOPS.forEach((s, i) => {
      const state = i < pos ? 'done' : (i === pos && st.started_at && !completed ? 'cur' : '');
      const skipped = (st.skipped || []).includes(s.position);
      list.appendChild(h('li', { class: state },
        h('span', { class: 'live-pin' }, state === 'done' ? icon('check', 16) : String(s.position)),
        h('div', null,
          h('strong', null, s.place_label || `Durak ${s.position}`),
          h('p', { class: 'tiny', style: { margin: '2px 0 0' } },
            state === 'done' ? (skipped ? 'Açıldı (ipucuyla geçti)' : 'Açıldı') : state === 'cur' ? 'Şu an bu durağın ipucunu okuyor' : 'Bekliyor'))));
    });
    list.appendChild(h('li', { class: completed ? 'done final' : (pos >= total && !completed ? 'cur' : 'final') },
      h('span', { class: 'live-pin' }, icon('heart', 16)),
      h('div', null, h('strong', null, J.final_title || 'Son sürpriz'), h('p', { class: 'tiny', style: { margin: '2px 0 0' } }, completed ? 'Son sürprizi gördü' : 'Sen'))));
    const lastStopNow = st.started_at && !completed && total > 0 && pos === total - 1;
    if (lastStopNow && !alerted) {
      alerted = true; chime(); vibrate([200, 100, 200, 100, 400]);
      document.title = `🔔 ${name} son durakta!`;
    }
    alertBox.replaceChildren(lastStopNow
      ? h('div', { class: 'live-alert' }, h('strong', null, 'Son durağa geldi!'), h('span', null, `${name} son ipucunu okuyor. Yerini al; "${J.final_title || 'Sürpriz'}" yazısı birazdan onun ekranında belirecek.`))
      : completed && !done ? h('div', { class: 'live-alert done' }, h('strong', null, 'Tamamlandı'), h('span', null, `${name} son sürprizi gördü.`)) : '');
    if (completed && !done) { done = true; if (lastPos !== null && lastPos < total) { chime(); vibrate([300]); } }
    if (lastPos !== null && pos > lastPos && !lastStopNow && !completed) vibrate(60);
    lastPos = pos;
  };
  const poll = async () => {
    try { draw(await db.rpc('ilk_my_status', { p_journey: J.id })); } catch (e) { head.replaceChildren(h('p', { class: 'note warn' }, e.message)); }
    if (sheet.sheet.isConnected) timer = setTimeout(poll, document.hidden ? 15000 : 6000);
  };
  poll();
}

// ───────────────────────── gönder / paylaş ─────────────────────────
async function openSend() {
  flush.flush();
  if (J.status === 'draft') return openActivate();
  return openShare();
}

function problemList(probs, sheet) {
  return h('ul', { class: 'problems', style: { paddingLeft: '18px' } }, probs.map((p) => h('li', null,
    PROBLEM_TEXT[p.code] ? PROBLEM_TEXT[p.code](p.position) : p.code,
    p.position ? h('button', { class: 'link-btn', style: { marginLeft: '6px' }, onclick: () => { sheet.close(); const st = STOPS.find((x) => x.position === p.position); if (st) setTimeout(() => editStop(st), 250); } }, 'Düzelt') : null)));
}

async function openActivate() {
  const body = h('div', { class: 'stack' }, h('div', { class: 'loader', style: { minHeight: '120px' } }, h('div', { class: 'loader-dot' })));
  const sheet = openSheet('Göndermeye hazırla', body);
  let probs;
  try { probs = await db.rpc('ilk_my_problems', { p_journey: J.id }, { retries: 2 }); } catch (e) { clear(body); body.appendChild(h('p', { class: 'note bad' }, e.message)); return; }
  clear(body);
  if (probs.length) {
    body.append(
      h('div', { class: 'note warn' }, icon('info'), h('span', null, 'Göndermeden önce şunları tamamla:')),
      problemList(probs, sheet),
      h('p', { class: 'small muted' }, 'Tamamladıktan sonra "Dene" ile baştan sona bir kez dene; sürprizin tam o anda aksamaması için en önemli adım bu.'));
    return;
  }
  const n = STOPS.length;
  const suggest = n <= 3 ? 'mini' : 'standart';
  const plans = [
    ['mini', 'Mini', '3 durağa kadar'],
    ['standart', 'Standart', '7 durağa kadar, sesli mesaj, Hikâyemiz sayfası'],
    ['ozel', 'Biz Hazırlayalım', 'Fikir, metin ve kurgu bizden; teklifler için'],
  ];
  const codeIn = h('input', { type: 'text', class: 'input-big mono', placeholder: 'ILK-XXXX-XXXX', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: 20 });
  const fb = h('div', { 'aria-live': 'polite' });
  const act = h('button', { class: 'btn primary block' }, 'Kodu gir ve gönderime hazırla');
  const short = J.id.slice(0, 8).toUpperCase();
  const askText = (plan) => `Merhaba! İlk Durak için ${plan} paket kodu almak istiyorum. Yolculuk no: ${short} (${n} durak)`;
  body.append(
    h('div', { class: 'note ok' }, icon('check'), h('span', null, 'Her şey tamam! Göndermek için bir paket kodu gerekiyor.')),
    h('div', { class: 'stack' }, plans.map(([k, title, desc]) => h('div', { class: `card flat${k === suggest ? ' plan featured' : ''}`, style: { padding: '14px', position: 'relative' } },
      k === suggest ? h('span', { class: 'pill rose badge' }, 'Sana uygun') : null,
      h('div', { class: 'row between' }, h('strong', null, title), h('strong', null, `${CONFIG.PRICES[k].toLocaleString('tr-TR')} TL${k === 'ozel' ? "'den" : ''}`)),
      h('p', { class: 'small muted', style: { margin: '4px 0 0' } }, desc),
      k === 'mini' && n > 3 ? h('p', { class: 'tiny', style: { margin: '4px 0 0', color: 'var(--warn)' } }, `Yolculuğunda ${n} durak var; Mini için en fazla 3 olmalı.`) : null))),
    h('h3', { style: { marginTop: '8px' } }, 'Kodun yok mu?'),
    CONFIG.WHATSAPP
      ? h('a', { class: 'btn wa block', href: whatsappLink(askText(n <= 3 ? 'Mini' : 'Standart'), CONFIG.WHATSAPP), target: '_blank', rel: 'noopener' }, icon('whatsapp'), 'WhatsApp\'tan kod al')
      : h('a', { class: 'btn block', href: `https://instagram.com/${CONFIG.INSTAGRAM}`, target: '_blank', rel: 'noopener' }, 'Instagram\'dan bize yaz'),
    h('p', { class: 'tiny' }, `Mesajda yolculuk numaran (${short}) yazacak; ödemeden sonra kodun hemen gelir.`),
    h('h3', { style: { marginTop: '8px' } }, 'Kodun varsa'),
    codeIn, act, fb);
  act.addEventListener('click', () => busy(act, async () => {
    const code = codeIn.value.trim();
    if (code.length < 6) { codeIn.focus(); fb.replaceChildren(h('p', { class: 'note warn' }, 'Kodu eksiksiz yaz.')); return; }
    try {
      const r = await db.rpc('ilk_activate', { p_journey: J.id, p_code: code });
      if (!r.ok) {
        const msg = {
          bad_code: 'Bu kod geçerli değil. Harfleri kontrol et.',
          used_code: 'Bu kod daha önce kullanılmış.',
          mini_too_many: `Bu bir Mini paket kodu; yolculuğunda ${r.stops} durak var. Durak sayısını 3'e indir ya da Standart kod al.`,
          already_active: 'Bu yolculuk zaten gönderime hazır.',
          incomplete: 'Bazı eksikler var. Paneli kapatıp tekrar aç.',
          not_found: 'Yolculuk bulunamadı. Sayfayı yenile.',
        }[r.error] || 'Kod kabul edilmedi.';
        fb.replaceChildren(h('p', { class: 'note bad' }, msg));
        return;
      }
      await loadJourney(J.id);
      sheet.close();
      renderEditor();
      toast('Hazır! Şimdi bağlantıyı gönderebilirsin.', 'ok', 4000);
      setTimeout(openShare, 300);
    } catch (e) { fb.replaceChildren(h('p', { class: 'note bad' }, e.message)); }
  }));
}

async function openShare() {
  const link = playLink(J);
  const name = J.recipient_name || '';
  const status = h('div', null, h('p', { class: 'tiny' }, 'Durum yükleniyor…'));
  const msg = h('textarea', { rows: 3 });
  msg.value = `${name ? name + ', ' : ''}sana bir sürpriz hazırladım. Hazır olduğunda bu bağlantıya dokun: ${link}`;
  const qrBox = h('div', { class: 'qr-card' });
  const startIn = h('input', { type: 'datetime-local' });
  if (J.starts_at) startIn.value = toLocalInput(J.starts_at);
  const startInfo = h('p', { class: 'tiny' }, J.starts_at ? `Şu an: ${fmtDateTime(J.starts_at)} başlayacak.` : 'Şu an: bağlantı açılır açılmaz başlar.');

  const body = h('div', { class: 'stack' },
    status,
    h('h3', null, 'Bağlantı'),
    h('div', { class: 'link-box mono' }, link),
    h('div', { class: 'row wrap-row' },
      h('button', { class: 'btn small', onclick: async () => { toast((await copyText(link)) ? 'Bağlantı kopyalandı.' : 'Kopyalanamadı; elle seç.', 'ok'); } }, icon('copy', 18), 'Kopyala'),
      navigator.share ? h('button', { class: 'btn small', onclick: () => navigator.share({ title: 'Sana bir sürpriz var', text: msg.value }).catch(() => {}) }, icon('share', 18), 'Paylaş') : null,
      h('a', { class: 'btn small', href: link, target: '_blank', rel: 'noopener' }, 'Aç')),
    h('div', { class: 'note warn' }, icon('info'), h('span', null, 'Bu bağlantıyı açan herkes sürprizi görebilir. Sadece sürprizi yapacağın kişiye gönder. Kendin açıp denersen alıcının ilerlemesi başlar; denemek için "Dene" düğmesini kullan.')),
    h('h3', null, 'WhatsApp\'tan gönder'),
    msg,
    h('a', { class: 'btn wa block', href: '#', onclick: (e) => { e.currentTarget.href = whatsappLink(msg.value); }, target: '_blank', rel: 'noopener' }, icon('whatsapp'), 'WhatsApp\'ta aç'),
    h('h3', null, 'Ya da kart olarak ver'),
    h('p', { class: 'small muted' }, 'QR kodlu kartı yazdırıp hediyenin, çiçeğin ya da bir kitabın arasına koyabilirsin.'),
    qrBox,
    h('h3', null, 'Ne zaman başlasın?'),
    h('p', { class: 'small muted' }, 'İstersen bir saat belirle. Bağlantı daha önce açılırsa geri sayım görünür.'),
    startIn, startInfo,
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: (e) => busy(e.currentTarget, async () => {
        if (!startIn.value) { toast('Önce bir tarih ve saat seç.'); return; }
        const iso = new Date(startIn.value).toISOString();
        await saveStart(iso, startInfo);
      }) }, 'Saati kaydet'),
      h('button', { class: 'btn ghost small', onclick: (e) => busy(e.currentTarget, async () => { startIn.value = ''; await saveStart(null, startInfo); }) }, 'Hemen başlasın')));
  openSheet(J.status === 'completed' ? 'Hikâyeniz' : 'Gönder', body);
  drawQr(qrBox, link, name);
  try {
    const st = await db.rpc('ilk_my_status', { p_journey: J.id });
    const txt = st.status === 'completed' ? `${name} yolculuğu tamamladı.`
      : st.started_at ? `${name} yolculukta: ${st.position}/${st.total} durak açıldı.`
        : 'Alıcı bağlantıyı henüz açmadı.';
    status.replaceChildren(h('div', { class: `note ${st.status === 'completed' ? 'rose' : st.started_at ? 'ok' : ''}` }, icon(st.status === 'completed' ? 'heart' : 'clock'), h('span', { class: 'grow' }, txt), h('button', { class: 'link-btn', onclick: openLive }, 'Canlı takip')));
  } catch { status.replaceChildren(''); }
}

async function saveStart(iso, info) {
  try {
    const r = await db.update('ilk_journeys', `id=eq.${J.id}`, { starts_at: iso });
    if (!r) throw new ApiError('Kaydedilemedi.');
    J.starts_at = r.starts_at;
    info.textContent = J.starts_at ? `Şu an: ${fmtDateTime(J.starts_at)} başlayacak.` : 'Şu an: bağlantı açılır açılmaz başlar.';
    toast('Kaydedildi.', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}
function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function drawQr(box, link, name) {
  if (typeof window.qrcode !== 'function') { box.appendChild(h('p', { class: 'tiny' }, 'QR kod oluşturulamadı.')); return; }
  const qr = window.qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  const n = qr.getModuleCount();
  const W = 600, H = 820, pad = 70, cell = Math.floor((W - pad * 2) / n), qrSize = cell * n, ox = (W - qrSize) / 2, oy = 210;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf6ee'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#a93f58'; g.lineWidth = 3; g.strokeRect(22, 22, W - 44, H - 44);
  g.fillStyle = '#a93f58'; g.textAlign = 'center';
  g.font = '600 26px Georgia, serif'; g.fillText('İLK DURAK', W / 2, 92);
  g.fillStyle = '#2b211e'; g.font = '600 40px Georgia, serif';
  g.fillText(name ? `${name}, bu senin için` : 'Bu senin için', W / 2, 160, W - 100);
  g.fillStyle = '#fff'; g.fillRect(ox - 18, oy - 18, qrSize + 36, qrSize + 36);
  g.fillStyle = '#2b211e';
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) g.fillRect(ox + col * cell, oy + r * cell, cell, cell);
  g.fillStyle = '#5f514b'; g.font = '24px Georgia, serif';
  g.fillText('Telefonunun kamerasıyla okut,', W / 2, oy + qrSize + 70);
  g.fillText('yolculuğun başlasın.', W / 2, oy + qrSize + 104);
  box.appendChild(c);
  const a = h('a', { class: 'btn small', download: `ilk-durak-${(name || 'kart').replace(/[^\p{L}\d]+/gu, '-')}.png`, href: '#' }, icon('qr', 18), 'Kartı indir');
  a.addEventListener('click', () => { a.href = c.toDataURL('image/png'); });
  box.appendChild(h('div', { style: { marginTop: '12px' } }, a));
}

boot().catch((e) => fatal('Bir sorun oluştu', e.message, true));
