// Supabase ile konuşan küçük istemci (kütüphanesiz).
// Oturum, yenileme, zaman aşımı, yeniden deneme ve anlaşılır Türkçe hata mesajları burada.
import { CONFIG } from './config.js';

const SESSION_KEY = 'ilk.session.v1';
let memorySession = null; // localStorage kapalıysa (gizli sekme vb.) bellekte tutulur
let refreshing = null;

export class ApiError extends Error {
  constructor(message, { status = 0, code = '', hint = '', details = '', network = false } = {}) {
    super(message);
    this.status = status; this.code = code; this.hint = hint; this.details = details; this.network = network;
  }
}

function readSession() {
  try { const s = localStorage.getItem(SESSION_KEY); if (s) return JSON.parse(s); } catch { /* yok */ }
  return memorySession;
}
function writeSession(s) {
  memorySession = s;
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* yok */ }
}
export function currentUser() { return readSession()?.user || null; }
export function hasSession() { return !!readSession()?.access_token; }

const nowSec = () => Math.floor(Date.now() / 1000);

async function rawFetch(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    throw new ApiError(navigator.onLine === false ? 'İnternet bağlantın yok gibi görünüyor.' : 'Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.', { network: true, details: String(e) });
  } finally {
    clearTimeout(t);
  }
}

async function parse(res) {
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const d = data && typeof data === 'object' ? data : {};
    const msg = d.message || d.msg || d.error_description || d.error || `Hata (${res.status})`;
    throw new ApiError(friendly(msg, d.hint), { status: res.status, code: d.code || d.error || '', hint: d.hint || '', details: d.details || text });
  }
  return data;
}

// Sunucu hata kodlarını kullanıcıya anlaşılır hale getir
const KNOWN = {
  ILK_MAX_STOPS: 'En fazla 7 durak eklenebilir.',
  ILK_MINI_MAX: 'Mini pakette en fazla 3 durak olabilir.',
  ILK_LOCKED: 'Bu yolculuk tamamlandığı için artık düzenlenemez.',
  ILK_NOT_FOUND: 'Yolculuk bulunamadı.',
  ILK_FORBIDDEN: 'Bu işlem için yetkin yok.',
  'Invalid login credentials': 'E-posta ya da şifre hatalı.',
  'JWT expired': 'Oturum süresi doldu, tekrar deneniyor.',
  'Anonymous sign-ins are disabled': 'Sistem şu an yeni yolculuk başlatmaya kapalı. Lütfen bize WhatsApp\'tan yaz.',
};
function friendly(msg, hint) {
  for (const k of Object.keys(KNOWN)) if (String(msg).includes(k)) return KNOWN[k];
  if (/rate limit|too many/i.test(msg)) return 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.';
  if (/payload too large|exceeded the maximum/i.test(msg)) return 'Dosya çok büyük (en fazla 10 MB).';
  if (/mime type/i.test(msg)) return 'Bu dosya türü desteklenmiyor.';
  if (/row-level security|permission denied/i.test(msg)) return 'Bu işlem için yetkin yok. Sayfayı yenileyip tekrar dene.';
  return hint || msg;
}

async function refresh() {
  const s = readSession();
  if (!s?.refresh_token) return null;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await rawFetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST', headers: { apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: s.refresh_token }),
        }, 15000);
        if (res.status === 400 || res.status === 401) {
          // Başka bir sekme oturumu az önce yenilediyse onu kullan; gerçekten geçersizse oturumu kapat
          const now = readSession();
          if (now?.refresh_token && now.refresh_token !== s.refresh_token) return now;
          writeSession(null); return null;
        }
        const data = await parse(res);
        writeSession(withExpiry(data));
        return readSession();
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
  }
  return refreshing;
}

function withExpiry(d) {
  return { ...d, expires_at: d.expires_at || nowSec() + (d.expires_in || 3600) };
}

async function freshToken() {
  let s = readSession();
  if (!s?.access_token) return null;
  if (s.expires_at && s.expires_at - 60 < nowSec()) s = await refresh();
  return s?.access_token || null;
}

/** Hazırlayan için: oturum yoksa kayıt formu olmadan anonim oturum açar */
export async function ensureAnonymousSession() {
  if (await freshToken()) return readSession().user;
  const res = await rawFetch(`${CONFIG.SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: {} }),
  }, 20000);
  const data = await parse(res);
  if (!data?.access_token) throw new ApiError('Oturum açılamadı. Sayfayı yenileyip tekrar dene.');
  writeSession(withExpiry(data));
  return data.user;
}

export async function signInWithPassword(email, password) {
  const res = await rawFetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }, 20000);
  const data = await parse(res);
  writeSession(withExpiry(data));
  return data.user;
}

export function signOut() { writeSession(null); }

/** Genel istek: oturum varsa ekler, 401'de bir kez yenileyip tekrar dener */
async function request(path, { method = 'GET', body, headers = {}, timeout = 20000, retries = 0, auth = true } = {}) {
  const url = `${CONFIG.SUPABASE_URL}${path}`;
  for (let attempt = 0; ; attempt++) {
    const h = { apikey: CONFIG.SUPABASE_KEY, ...headers };
    const tok = auth ? await freshToken() : null;
    if (tok) h.Authorization = `Bearer ${tok}`;
    if (body !== undefined && !(body instanceof Blob) && !h['Content-Type']) h['Content-Type'] = 'application/json';
    try {
      const res = await rawFetch(url, { method, headers: h, body: body === undefined ? undefined : (body instanceof Blob ? body : JSON.stringify(body)) }, timeout);
      if (res.status === 401 && tok && attempt === 0) { await refresh(); continue; }
      if (res.status >= 500 && attempt < retries) { await sleep(600 * (attempt + 1)); continue; }
      return await parse(res);
    } catch (e) {
      if (e instanceof ApiError && e.network && attempt < retries) { await sleep(800 * (attempt + 1)); continue; }
      throw e;
    }
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const db = {
  rpc: (fn, args = {}, opts = {}) => request(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args, ...opts }),
  select: (table, query, opts = {}) => request(`/rest/v1/${table}?${query}`, { ...opts }),
  insert: async (table, row) => (await request(`/rest/v1/${table}`, { method: 'POST', body: row, headers: { Prefer: 'return=representation' } }))[0],
  update: async (table, query, patch) => (await request(`/rest/v1/${table}?${query}`, { method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' } }))[0],
  remove: (table, query) => request(`/rest/v1/${table}?${query}`, { method: 'DELETE' }),
};

export const storage = {
  publicUrl(p) {
    if (!p) return '';
    return `${CONFIG.SUPABASE_URL}/storage/v1/object/public/${CONFIG.BUCKET}/${p.split('/').map(encodeURIComponent).join('/')}`;
  },
  /** İlerleme göstergeli yükleme (yavaş mobil internette kullanıcı beklediğini bilsin) */
  async upload(p, blob, contentType, onProgress) {
    const tok = await freshToken();
    if (!tok) throw new ApiError('Oturum bulunamadı. Sayfayı yenile.');
    const url = `${CONFIG.SUPABASE_URL}/storage/v1/object/${CONFIG.BUCKET}/${p.split('/').map(encodeURIComponent).join('/')}`;
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', url);
      x.timeout = 180000;
      x.setRequestHeader('apikey', CONFIG.SUPABASE_KEY);
      x.setRequestHeader('Authorization', `Bearer ${tok}`);
      x.setRequestHeader('Content-Type', contentType);
      x.setRequestHeader('x-upsert', 'false');
      x.setRequestHeader('cache-control', '31536000');
      x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onload = () => {
        if (x.status >= 200 && x.status < 300) return resolve(p);
        let d = {}; try { d = JSON.parse(x.responseText); } catch { /* yok */ }
        reject(new ApiError(friendly(d.message || d.error || `Yükleme başarısız (${x.status})`), { status: x.status }));
      };
      x.onerror = () => reject(new ApiError('Dosya yüklenemedi. İnternet bağlantını kontrol et.', { network: true }));
      x.ontimeout = () => reject(new ApiError('Yükleme çok uzun sürdü. Daha güçlü bir bağlantıyla tekrar dene.', { network: true }));
      x.send(blob);
    });
  },
  async remove(paths) {
    const list = paths.filter(Boolean);
    if (!list.length) return;
    try { await request(`/storage/v1/object/${CONFIG.BUCKET}`, { method: 'DELETE', body: { prefixes: list } }); } catch { /* sessizce geç */ }
  },
};
