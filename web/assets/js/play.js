// Sürprizi alan kişinin ekranı (s.html). Gerçek oyun, deneme modu ve örnek yolculuk aynı ekranı kullanır.
import { CONFIG } from './config.js';
import { db, storage, hasSession, ApiError } from './sb.js';
import { h, $, clear, icon, toast, fmtDateTime, fmtCountdown, fmtDistance, vibrate, busy, fromName } from './ui.js';
import { installErrorReporting, installOfflineBanner, inAppBrowser, openInBrowserHint, isIOS, isAndroid } from './env.js';
import { audioPlayer } from './media.js';
import { getPosition } from './map.js';
import { demoProvider } from './demo.js';

installErrorReporting('play');
installOfflineBanner();

const app = $('#app');
const params = new URLSearchParams(location.search);
const testId = params.get('deneme');
const token = decodeURIComponent((location.hash || '').replace(/^#\/?/, '')).trim();

// ── Veri sağlayıcıları
function remoteProvider(ref, test) {
  const call = (fn, args) => db.rpc(fn, { p_ref: ref, p_test: test, ...args }, { retries: 2, auth: test });
  return {
    test,
    state: () => call('ilk_play_state', {}),
    unlock: (position, extra = {}) => call('ilk_play_unlock', {
      p_position: position, p_answer: extra.answer ?? null, p_lat: extra.lat ?? null, p_lng: extra.lng ?? null, p_accuracy: extra.accuracy ?? null,
    }),
    skip: (position) => call('ilk_play_skip', { p_position: position }),
    hint: (position) => call('ilk_play_hint', { p_position: position }),
    reset: () => db.rpc('ilk_reset_test', { p_journey: ref }),
    mediaUrl: (p) => storage.publicUrl(p),
    cacheKey: `ilk.cache.${test ? 't' : 'r'}.${ref}`,
  };
}

let P; // aktif sağlayıcı
let S = null; // son durum
let serverOffset = 0; // sunucu saati - cihaz saati
let lastDistance = null;
const introKey = () => `ilk.intro.${P.cacheKey}`;

function remember(state) {
  try { localStorage.setItem(P.cacheKey, JSON.stringify(state)); } catch { /* yok */ }
}
function recall() {
  try { return JSON.parse(localStorage.getItem(P.cacheKey) || 'null'); } catch { return null; }
}
function setState(st) {
  S = st;
  if (st && st.now) serverOffset = new Date(st.now).getTime() - Date.now();
  if (st && (st.status === 'playing' || st.status === 'completed')) remember(st);
}

// ── Başlat
async function boot() {
  if (testId) {
    if (!hasSession()) return screenMessage('Deneme modu', 'Deneme modunu hazırlama sayfasından açmalısın. Aynı tarayıcıda "Dene" düğmesine bas.', { home: false, editor: true });
    P = remoteProvider(testId, true);
  } else if (token === 'ornek' || token === 'demo') {
    P = demoProvider();
  } else if (!token || token.length < 10) {
    return screenMessage('Bağlantı eksik', 'Açtığın bağlantı eksik görünüyor. Sana gönderilen mesajdaki bağlantının tamamına dokunduğundan emin ol.');
  } else {
    P = remoteProvider(token, false);
  }
  await load();
}

async function load() {
  renderLoader();
  try {
    const st = await P.state();
    setState(st);
    route();
  } catch (e) {
    const cached = !P.test && recall();
    if (cached && e instanceof ApiError && e.network) {
      setState({ ...cached });
      toast('Bağlantı zayıf, son kaydedilen hâli gösteriliyor.', 'bad', 4500);
      route();
    } else {
      screenError(e, load);
    }
  }
}

function route() {
  document.title = S.recipient_name ? `${S.recipient_name}, sana bir sürpriz var` : `${CONFIG.BRAND}`;
  switch (S.status) {
    case 'not_found': return screenMessage('Bu bağlantı açılamadı', 'Bağlantı yanlış kopyalanmış ya da sürpriz henüz hazır değil. Sürprizi hazırlayan kişiye haber verebilirsin.');
    case 'disabled': return screenMessage('Bu yolculuk kapatıldı', 'Bu sürpriz artık görüntülenemiyor.');
    case 'not_started': return screenNotStarted();
    case 'completed': return screenFinal(false);
    case 'playing':
      if (S.position === 0 && !sessionFlag(introKey())) return screenIntro();
      return screenStop();
    default: return screenMessage('Bir şeyler ters gitti', 'Sayfayı yenileyip tekrar dene.');
  }
}
function sessionFlag(k, set) {
  try { if (set) localStorage.setItem(k, '1'); return localStorage.getItem(k) === '1'; } catch { return !!set; }
}

// ── Ortak parçalar
function frame(children, { dark = false } = {}) {
  document.body.classList.toggle('final-screen', dark);
  clear(app);
  if (P && P.test) {
    app.appendChild(h('div', { class: 'test-bar' },
      h('span', null, 'Deneme modu · sadece sen görüyorsun'),
      h('span', { class: 'row' },
        h('button', { onclick: async (e) => { await busy(e.currentTarget, async () => { await P.reset(); try { localStorage.removeItem(introKey()); } catch {} await load(); }); } }, 'Baştan başlat'),
        h('button', { onclick: () => { location.href = `hazirla.html#${testId}`; } }, 'Düzenlemeye dön'))));
  }
  if (P && P.demo) {
    app.appendChild(h('div', { class: 'test-bar' },
      h('span', null, 'Örnek yolculuk · gerçek bir sürprizin nasıl göründüğünü dene'),
      h('button', { onclick: () => { location.href = 'index.html'; } }, 'Ana sayfa')));
  }
  const main = h('main', { class: 'play' }, children);
  app.appendChild(main);
  window.scrollTo(0, 0);
  return main;
}
function renderLoader() {
  clear(app);
  app.appendChild(h('div', { class: 'loader' }, h('div', { class: 'loader-dot', role: 'progressbar', 'aria-label': 'Yükleniyor' })));
}
function dots(total, pos) {
  return h('div', { class: 'dots', 'aria-hidden': 'true' }, Array.from({ length: total }, (_, i) =>
    h('span', { class: i < pos ? 'done' : i === pos ? 'cur' : '' })));
}
function photo(path, alt) {
  if (!path) return null;
  const img = h('img', { src: P.mediaUrl(path), alt: alt || 'Anı fotoğrafı', loading: 'eager', decoding: 'async' });
  const box = h('figure', { class: 'polaroid', style: { margin: '6px auto 16px' } }, img);
  img.addEventListener('error', () => {
    if (img.dataset.retry) { box.replaceChildren(h('p', { class: 'small muted center', style: { padding: '30px 10px' } }, 'Fotoğraf yüklenemedi. İnternet bağlantını kontrol et.')); return; }
    img.dataset.retry = '1';
    setTimeout(() => { img.src = P.mediaUrl(path) + (P.mediaUrl(path).includes('?') ? '&' : '?') + 'r=1'; }, 1500);
  });
  return box;
}
function memoryBlock(stop) {
  return [
    photo(stop.photo_path, stop.place_label),
    stop.reveal_message ? h('p', { class: 'memory-text' }, stop.reveal_message) : null,
    stop.audio_path ? h('div', { style: { margin: '14px 0' } }, audioPlayer(P.mediaUrl(stop.audio_path)).el) : null,
  ];
}

// ── Ekranlar
function screenMessage(title, text, { home = true, editor = false } = {}) {
  frame([
    h('div', { class: 'envelope' },
      h('div', { class: 'seal' }, icon('heart', 40)),
      h('h1', { class: 'hello' }, title),
      h('p', { class: 'muted', style: { maxWidth: '380px' } }, text),
      editor ? h('a', { class: 'btn primary', href: 'hazirla.html' }, 'Hazırlama sayfasına git') : null,
      home ? h('a', { class: 'btn ghost', href: 'index.html' }, `${CONFIG.BRAND} nedir?`) : null),
  ]);
}

function screenError(e, retry) {
  frame([
    h('div', { class: 'envelope' },
      h('div', { class: 'seal' }, icon('info', 40)),
      h('h1', { class: 'hello' }, 'Bağlanamadık'),
      h('p', { class: 'muted', style: { maxWidth: '380px' } }, e?.message || 'Bir sorun oluştu.'),
      h('button', { class: 'btn primary', onclick: retry }, 'Tekrar dene')),
  ]);
}

function screenNotStarted() {
  const target = new Date(S.starts_at).getTime();
  const cd = h('p', { class: 'hello', style: { fontSize: '30px' } }, '');
  const main = frame([
    h('div', { class: 'envelope' },
      h('div', { class: 'seal' }, icon('lock', 40)),
      h('p', { class: 'from' }, S.sender_name ? `${S.sender_name} sana bir şey hazırladı` : 'Sana bir şey hazırlandı'),
      h('h1', { class: 'hello' }, `${S.recipient_name || ''}, biraz sabır…`),
      h('p', { class: 'muted' }, `Sürprizin ${fmtDateTime(S.starts_at)} başlıyor.`),
      cd,
      h('p', { class: 'tiny' }, 'Bu sayfayı açık bırakabilir ya da o saatte bağlantıya tekrar dokunabilirsin.')),
  ]);
  const tick = () => {
    if (!main.isConnected) return clearInterval(iv);
    const left = target - (Date.now() + serverOffset);
    cd.textContent = fmtCountdown(left);
    if (left <= 0) { clearInterval(iv); load(); }
  };
  const iv = setInterval(tick, 1000);
  tick();
}

function screenIntro() {
  frame([
    h('div', { class: 'envelope reveal' },
      h('div', { class: 'seal' }, icon('heart', 40)),
      S.sender_name ? h('p', { class: 'from' }, `${fromName(S.sender_name)} sana`) : null,
      h('h1', { class: 'hello' }, `${S.recipient_name}, sana bir şey hazırladım.`),
      S.intro_message ? h('p', { class: 'intro-text' }, S.intro_message) : null,
      h('p', { class: 'tiny' }, `${S.total} durak seni bekliyor. Telefonun şarjlı, internetin açık olsun.`),
      h('button', { class: 'btn primary', style: { minWidth: '220px' }, onclick: () => { sessionFlag(introKey(), true); screenStop(); } }, 'Yolculuğa başla', icon('arrow'))),
  ]);
}

function screenStop() {
  const c = S.current;
  if (!c) return screenFinal(false);
  lastDistance = null;
  const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const extras = h('div', { class: 'row wrap-row', style: { marginTop: '12px', gap: '6px' } });
  const card = h('div', { class: 'clue-card reveal' }, h('p', { class: 'clue-text' }, c.clue));
  const action = h('div', { class: 'action' });
  const prev = S.position > 0 ? h('button', { class: 'link-btn', style: { marginTop: '18px' }, onclick: () => screenStory(true) }, 'Açtığın anılara bak') : null;

  frame([
    h('div', { class: 'play-head' },
      h('span', { class: 'play-step' }, `Durak ${c.position} / ${S.total}`),
      S.sender_name ? h('span', { class: 'tiny' }, `${S.sender_name} hazırladı`) : null),
    dots(S.total, S.position),
    card, action, feedback, extras, prev,
  ]);

  const setFeedback = (text, kind = '') => { feedback.replaceChildren(text ? h('div', { class: `note ${kind}` }, text) : ''); };
  const showSkip = (can) => {
    extras.querySelector('[data-skip]')?.remove();
    if (!can) return;
    const label = c.unlock_type === 'question' ? 'Bilemedim, cevabı göster' : c.unlock_type === 'code' ? 'Kodu bulamadım, devam et' : 'Buradayım, devam et';
    extras.appendChild(h('button', { class: 'btn outline small', 'data-skip': '1', onclick: (e) => busy(e.currentTarget, doSkip) }, label));
  };
  const handle = async (res) => {
    if (!res) return;
    if (res.result === 'ok') { vibrate([20, 40, 30]); return screenReveal(res.state); }
    if (res.result === 'state') { setState(res.state); return route(); }
    if (res.result === 'slow') { setFeedback(`Çok fazla deneme oldu. ${Math.ceil(res.wait_seconds / 60)} dakika sonra tekrar dene.`, 'warn'); return; }
    if (res.result === 'wrong') {
      vibrate(80);
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      setFeedback(res.attempts >= 3 ? 'Olmadı. İstersen ipucu al ya da devam et.' : 'Olmadı, bir daha dene.', 'warn');
      showSkip(res.can_skip);
      return;
    }
    if (res.result === 'far') {
      const d = res.distance_m;
      let heat = null;
      if (lastDistance != null) {
        if (d < lastDistance - 15) heat = h('span', { class: `heat ${d < 150 ? 'hot' : 'warm'}` }, 'Isınıyorsun! ');
        else if (d > lastDistance + 15) heat = h('span', { class: 'heat cold' }, 'Soğuyorsun. ');
      }
      lastDistance = d;
      setFeedback(h('span', null, heat, `Henüz değil, yaklaşık ${fmtDistance(d)} var.`), 'warn');
      showSkip(res.can_skip);
      return;
    }
    if (res.result === 'need_location') { showSkip(res.can_skip); return; }
    if (res.result === 'not_yet') { setFeedback('Biraz daha dene, sonra devam edebilirsin.', 'warn'); }
  };
  const doSkip = async () => {
    try { await handle(await P.skip(c.position)); } catch (e) { setFeedback(e.message, 'bad'); }
  };

  if (c.unlock_type === 'question' || c.unlock_type === 'code') {
    const input = h('input', {
      type: 'text', class: 'input-big', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
      enterkeyhint: 'send', maxlength: 120,
      placeholder: c.unlock_type === 'code' ? 'Kodu yaz' : 'Cevabın', 'aria-label': c.unlock_type === 'code' ? 'Kod' : 'Cevap',
    });
    const btn = h('button', { class: 'btn primary block', style: { marginTop: '10px' } }, c.unlock_type === 'code' ? 'Kodu gir' : 'Cevapla');
    const submit = () => busy(btn, async () => {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      try { await handle(await P.unlock(c.position, { answer: v })); }
      catch (e) { setFeedback(e.message, 'bad'); }
      if (input.isConnected) { input.select(); }
    });
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    action.append(
      c.unlock_type === 'question' ? h('p', { style: { fontWeight: '700', fontSize: '17px', margin: '0 0 10px' } }, c.question) : h('p', { class: 'muted', style: { margin: '0 0 10px' } }, 'Oraya vardığında bulacağın kodu yaz.'),
      input, btn);
  } else if (c.unlock_type === 'tap') {
    action.append(h('button', { class: 'btn primary block', onclick: (e) => busy(e.currentTarget, async () => {
      try { await handle(await P.unlock(c.position)); } catch (err) { setFeedback(err.message, 'bad'); }
    }) }, icon('check'), 'Vardım'));
  } else if (c.unlock_type === 'location') {
    const app0 = inAppBrowser();
    if (app0) action.append(h('div', { class: 'note warn', style: { marginBottom: '10px' } }, icon('info'), h('span', null, openInBrowserHint())));
    action.append(
      h('p', { class: 'muted', style: { margin: '0 0 10px' } }, 'Oraya vardığında aşağıdaki düğmeye bas, konumunu kontrol edelim. Konumun kimseye gösterilmez ve kaydedilmez.'),
      h('button', { class: 'btn primary block', onclick: (e) => busy(e.currentTarget, async () => {
        setFeedback('Konumun alınıyor…');
        let pos;
        try {
          pos = await getPosition();
        } catch (err) {
          setFeedback(locationHelp(err.kind || err.message), 'warn');
          try { await handle(await P.unlock(c.position, {})); } catch { /* yok */ }
          return;
        }
        if (pos.accuracy > 150) setFeedback(`Konumun net değil (±${Math.round(pos.accuracy)} m). Açık bir alana çıkıp tekrar dene.`, 'warn');
        try { await handle(await P.unlock(c.position, pos)); } catch (err) { setFeedback(err.message, 'bad'); }
      }) }, icon('locate'), 'Vardım, konumumu kontrol et'));
  }

  if (c.has_hint) {
    extras.appendChild(h('button', { class: 'btn ghost small', onclick: (e) => busy(e.currentTarget, async () => {
      try {
        const r = await P.hint(c.position);
        if (r.hint) { e.target.closest('button')?.remove(); card.appendChild(h('p', { class: 'note rose', style: { marginTop: '14px' } }, icon('sparkle'), h('span', null, r.hint))); }
      } catch (err) { setFeedback(err.message, 'bad'); }
    }) }, icon('sparkle'), 'İpucu al'));
  }
  showSkip(c.can_skip);
}

function locationHelp(kind) {
  if (kind === 'denied') {
    if (isIOS) return 'Konum izni kapalı. iPhone\'da Ayarlar → Gizlilik ve Güvenlik → Konum Servisleri → Safari Web Siteleri → "Kullanırken" seçeneğini aç, sonra tekrar dene. Olmazsa birkaç denemeden sonra "Buradayım" ile devam edebilirsin.';
    if (isAndroid) return 'Konum izni kapalı. Adres çubuğundaki kilit simgesine dokun → İzinler → Konum\'u aç, sonra tekrar dene. Olmazsa birkaç denemeden sonra "Buradayım" ile devam edebilirsin.';
    return 'Konum izni verilmedi. Tarayıcı ayarlarından bu site için konuma izin ver ya da birkaç denemeden sonra "Buradayım" ile devam et.';
  }
  if (kind === 'timeout') return 'Konum zamanında alınamadı. Açık bir alana çıkıp tekrar dene.';
  return 'Konum alınamadı. Telefonunda konum servisinin açık olduğundan emin ol ve tekrar dene.';
}

function screenReveal(newState) {
  setState(newState);
  const opened = newState.stops[newState.stops.length - 1];
  const isLast = newState.status === 'completed';
  frame([
    h('div', { class: 'play-head' },
      h('span', { class: 'play-step' }, `Durak ${opened.position} açıldı`),
      h('span', { class: 'pill ok' }, icon('check', 16), 'Buldun')),
    dots(newState.total, newState.position),
    h('div', { class: 'reveal' },
      opened.place_label ? h('h2', { style: { textAlign: 'center' } }, opened.place_label) : null,
      opened.skipped && opened.answer ? h('p', { class: 'note', style: { marginBottom: '14px' } }, icon('info'), h('span', null, `Doğru cevap: ${opened.answer}`)) : null,
      memoryBlock(opened),
      h('button', { class: 'btn primary block', style: { marginTop: '18px' }, onclick: () => (isLast ? screenFinal(true) : screenStop()) },
        isLast ? 'Son sürprize geç' : 'Sonraki ipucu', icon('arrow'))),
  ]);
}

function screenFinal(fresh) {
  const f = S.final || {};
  frame([
    h('div', { class: 'reveal', style: { animationDuration: fresh ? '1.2s' : '.5s' } },
      h('p', { class: 'play-step center', style: { color: '#e9a9b8' } }, 'Son durak'),
      h('h1', { class: 'final-title' }, f.title || 'Sürpriz!'),
      photo(f.photo_path, 'Son sürpriz'),
      f.message ? h('p', { class: 'memory-text' }, f.message) : null,
      f.audio_path ? h('div', { style: { margin: '16px 0' } }, audioPlayer(P.mediaUrl(f.audio_path), 'Son mesajı dinle').el) : null,
      h('div', { class: 'stack', style: { marginTop: '26px', textAlign: 'center' } },
        h('button', { class: 'btn primary block', onclick: () => screenStory(false) }, 'Hikâyemizi gör'),
        P.test ? h('a', { class: 'btn ghost block', href: `hazirla.html#${testId}` }, 'Düzenlemeye dön') : null)),
  ], { dark: true });
}

function screenStory(partial) {
  const stops = S.stops || [];
  frame([
    h('div', { class: 'play-head' },
      h('button', { class: 'icon-btn', 'aria-label': 'Geri', onclick: () => (partial ? screenStop() : screenFinal(false)) }, icon('back')),
      h('span', { class: 'play-step' }, 'Hikâyemiz'), h('span')),
    h('h1', { class: 'center', style: { fontSize: '30px', margin: '6px 0 4px' } }, S.recipient_name ? `${S.recipient_name} için` : 'Hikâyemiz'),
    S.sender_name ? h('p', { class: 'from center' }, `${fromName(S.sender_name)}, sevgiyle`) : null,
    h('ol', { class: 'story', style: { marginTop: '22px' } },
      stops.map((s) => h('li', null,
        h('span', { class: 'stop-num' }, String(s.position)),
        s.place_label ? h('h3', null, s.place_label) : null,
        h('p', { class: 'small muted', style: { fontStyle: 'italic' } }, s.clue),
        memoryBlock(s)))),
    !partial && S.final ? h('div', { class: 'card', style: { textAlign: 'center' } },
      h('p', { class: 'play-step' }, 'Son durak'),
      h('h2', null, S.final.title || 'Sürpriz!'),
      S.final.message ? h('p', { class: 'memory-text' }, S.final.message) : null) : null,
    partial ? h('button', { class: 'btn primary block', style: { marginTop: '10px' }, onclick: () => screenStop() }, 'Yolculuğa devam et') : null,
    !partial && !P.test ? h('div', { class: 'card flat', style: { marginTop: '24px', textAlign: 'center' } },
      h('p', { class: 'small muted' }, 'Bu bağlantı senin. İstediğin zaman açıp anılarına geri dönebilirsin.'),
      h('a', { class: 'link-btn', href: 'index.html' }, `Sen de birine ${CONFIG.BRAND} hazırla`)) : null,
  ]);
}

boot().catch((e) => screenError(e, () => location.reload()));
