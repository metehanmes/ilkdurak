// Yönetim ekranı (yonetim.html): paket kodu üretme, yolculukları ve hataları görme.
import { CONFIG } from './config.js';
import { db, signInWithPassword, signOut, currentUser } from './sb.js';
import { h, $, clear, icon, toast, copyText, whatsappLink, fmtShort, busy, confirmBox } from './ui.js';

const app = $('#app');
const PLAN = { mini: 'Mini', standart: 'Standart', ozel: 'Özel' };
const STATUS = { draft: 'Taslak', active: 'Gönderildi', completed: 'Tamamlandı', disabled: 'Kapatıldı' };
const base = () => location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');

async function boot() {
  const u = currentUser();
  if (u && !u.is_anonymous) {
    try { if (await db.rpc('ilk_is_admin', {})) return dashboard(); } catch { /* giriş tekrar */ }
  }
  login();
}

function login(msg) {
  clear(app);
  const email = h('input', { type: 'email', autocomplete: 'username', placeholder: 'E-posta' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Şifre' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Giriş yap');
  const fb = h('div', { 'aria-live': 'polite' }, msg ? h('p', { class: 'note bad' }, msg) : null);
  const form = h('form', { class: 'card stack', style: { maxWidth: '420px', margin: '40px auto' } },
    h('h1', { style: { fontSize: '28px' } }, 'Yönetim'),
    h('p', { class: 'small muted' }, 'Bu tarayıcıda hazırlanmış bir yolculuk varsa, giriş yapınca o oturum kapanır. Yönetimi ayrı bir tarayıcıda ya da gizli sekmede kullan.'),
    email, pass, btn, fb);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(btn, async () => {
      try {
        await signInWithPassword(email.value.trim(), pass.value);
        pass.value = '';
        if (!(await db.rpc('ilk_is_admin', {}))) { signOut(); fb.replaceChildren(h('p', { class: 'note bad' }, 'Bu hesabın yönetim yetkisi yok.')); return; }
        dashboard();
      } catch (err) { fb.replaceChildren(h('p', { class: 'note bad' }, err.message)); }
    });
  });
  app.appendChild(h('main', { class: 'wrap' }, form));
  email.focus();
}

async function dashboard() {
  clear(app);
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Yükleniyor…'));
  app.append(
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: 'index.html' }, h('span', { class: 'brand-mark' }, icon('heart')), `${CONFIG.BRAND} · Yönetim`),
      h('button', { class: 'btn ghost small', onclick: () => { signOut(); login(); } }, 'Çıkış')),
    h('main', { class: 'wrap', style: { maxWidth: '1100px' } }, codeMaker(), body));
  await refresh(body);
}

function codeMaker() {
  const plan = h('select', null, Object.entries(PLAN).map(([k, v]) => h('option', { value: k, selected: k === 'standart' || null }, `${v} (${CONFIG.PRICES[k]} TL)`)));
  const count = h('input', { type: 'number', min: 1, max: 50, value: 1, style: { maxWidth: '90px' } });
  const note = h('input', { type: 'text', maxlength: 200, placeholder: 'Not (ör. müşteri adı, ödeme şekli)' });
  const out = h('div');
  const btn = h('button', { class: 'btn primary' }, icon('plus'), 'Kod üret');
  btn.addEventListener('click', () => busy(btn, async () => {
    try {
      const codes = await db.rpc('ilk_admin_create_codes', { p_plan: plan.value, p_count: Number(count.value) || 1, p_note: note.value.trim() });
      const list = codes.map((c) => (typeof c === 'string' ? c : Object.values(c)[0]));
      clear(out);
      out.appendChild(h('div', { class: 'note ok', style: { marginTop: '12px', display: 'block' } },
        h('p', { style: { margin: '0 0 8px' } }, `${list.length} ${PLAN[plan.value]} kodu üretildi:`),
        list.map((c) => {
          const msg = `İlk Durak ${PLAN[plan.value]} paket kodun: ${c}\nYolculuğunda "Gönder"e bas ve bu kodu yaz. Güzel bir sürpriz olsun!`;
          return h('div', { class: 'row wrap-row', style: { margin: '6px 0' } },
            h('strong', { class: 'mono', style: { fontSize: '18px' } }, c),
            h('button', { class: 'btn small', onclick: async () => toast((await copyText(c)) ? 'Kopyalandı' : 'Kopyalanamadı') }, icon('copy', 16), 'Kopyala'),
            h('button', { class: 'btn small', onclick: async () => toast((await copyText(msg)) ? 'Mesaj kopyalandı' : 'Kopyalanamadı') }, 'Mesajı kopyala'),
            h('a', { class: 'btn wa small', href: whatsappLink(msg), target: '_blank', rel: 'noopener' }, icon('whatsapp', 16), 'WhatsApp'));
        })));
      note.value = '';
      refresh(app.querySelector('main > .stack'));
    } catch (e) { toast(e.message, 'bad', 5000); }
  }));
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, icon('key'), 'Paket kodu üret'),
    h('p', { class: 'small muted' }, 'Ödeme geldikten sonra kodu üret ve müşteriye gönder. Her kod bir kez kullanılır.'),
    h('div', { class: 'row wrap-row' }, plan, count, note, btn), out);
}

async function refresh(body) {
  let d;
  try { d = await db.rpc('ilk_admin_overview', {}); } catch (e) { body.replaceChildren(h('p', { class: 'note bad' }, e.message)); return; }
  const j = d.journeys || [], c = d.codes || [], e = d.errors || [];
  const stat = (n, t) => h('div', { class: 'card flat', style: { padding: '14px', textAlign: 'center' } }, h('div', { style: { fontSize: '28px', fontFamily: 'var(--serif)', fontWeight: 700 } }, String(n)), h('div', { class: 'tiny' }, t));
  body.replaceChildren(
    h('div', { class: 'grid3', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' } },
      stat(j.length, 'yolculuk'), stat(j.filter((x) => x.status === 'active').length, 'gönderildi'),
      stat(j.filter((x) => x.status === 'completed').length, 'tamamlandı'), stat(c.filter((x) => !x.used_at).length, 'kullanılmamış kod')),
    h('h2', null, 'Yolculuklar'),
    table(['Oluşturma', 'Kimden → Kime', 'Şablon', 'Durak', 'Durum', 'İlerleme', ''], j.map((x) => [
      fmtShort(x.created_at), `${x.sender_name || '—'} → ${x.recipient_name || '—'}`, x.template, x.stops,
      `${STATUS[x.status] || x.status}${x.plan ? ' · ' + PLAN[x.plan] : ''}`,
      x.completed_at ? 'bitti' : x.real_position != null ? `${x.real_position}/${x.stops}` : '—',
      h('span', { class: 'row', style: { gap: '6px' } },
        h('span', { class: 'mono tiny', title: x.id }, x.id.slice(0, 8).toUpperCase()),
        x.status === 'active' ? h('button', { class: 'btn small', onclick: () => setStatus(x, 'disabled', body) }, 'Kapat') : null,
        x.status === 'disabled' ? h('button', { class: 'btn small', onclick: () => setStatus(x, 'active', body) }, 'Aç') : null,
        x.status !== 'draft' ? h('button', { class: 'btn small', onclick: async () => toast((await copyText(`${base()}s.html#${x.play_token}`)) ? 'Alıcı bağlantısı kopyalandı (açarsan ilerleme başlar!)' : 'Kopyalanamadı', 'info', 5000) }, 'Bağlantı') : null),
    ])),
    h('h2', null, 'Kodlar'),
    table(['Kod', 'Paket', 'Not', 'Üretildi', 'Kullanıldı'], c.map((x) => [
      h('span', { class: 'mono' }, x.code), PLAN[x.plan], x.note || '', fmtShort(x.created_at),
      x.used_at ? `${fmtShort(x.used_at)} · ${String(x.used_journey || '').slice(0, 8).toUpperCase()}` : 'hayır'])),
    h('h2', null, 'Son hatalar'),
    e.length ? table(['Zaman', 'Sayfa', 'Mesaj', 'Tarayıcı'], e.map((x) => [fmtShort(x.created_at), x.page, x.message, h('span', { class: 'tiny' }, (x.agent || '').slice(0, 90))])) : h('p', { class: 'muted' }, 'Hata kaydı yok.'));
}

async function setStatus(x, status, body) {
  const q = status === 'disabled' ? 'Bu yolculuk kapatılsın mı? Alıcı bağlantıyı açtığında "kapatıldı" mesajı görür.' : 'Yolculuk yeniden açılsın mı?';
  if (!(await confirmBox(q, { ok: status === 'disabled' ? 'Kapat' : 'Aç', danger: status === 'disabled' }))) return;
  try { await db.rpc('ilk_admin_set_status', { p_journey: x.id, p_status: status }); toast('Güncellendi.', 'ok'); refresh(body); } catch (e) { toast(e.message, 'bad'); }
}

function table(heads, rows) {
  if (!rows.length) return h('p', { class: 'muted' }, 'Kayıt yok.');
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, heads.map((t) => h('th', null, t)))),
    h('tbody', null, rows.map((r) => h('tr', null, r.map((v) => h('td', null, v ?? '')))))));
}

boot();
