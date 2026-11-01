// Ortam tespiti ve hata kaydı
import { CONFIG } from './config.js';

const ua = navigator.userAgent || '';
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = /Android/i.test(ua);

/** Instagram, Facebook, TikTok gibi uygulamaların kendi içindeki tarayıcı: konum ve mikrofon sık sık engellenir */
export function inAppBrowser() {
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'Facebook';
  if (/musical_ly|Bytedance|TikTok/i.test(ua)) return 'TikTok';
  if (/Twitter/i.test(ua)) return 'X';
  if (/LinkedInApp/i.test(ua)) return 'LinkedIn';
  if (/Snapchat/i.test(ua)) return 'Snapchat';
  if (/\bLine\//i.test(ua)) return 'Line';
  return null;
}
export function openInBrowserHint() {
  const app = inAppBrowser();
  if (!app) return '';
  if (isIOS) return `${app} içinden açtın. En iyi deneyim için sağ alttaki ya da üstteki "…" menüsünden "Safari'de aç"ı seç.`;
  return `${app} içinden açtın. En iyi deneyim için sağ üstteki "⋮" menüsünden "Tarayıcıda aç"ı seç.`;
}

// ── Hata kaydı: beklenmeyen hatalar sunucuya yazılır (sayfa başına en fazla 5)
let sent = 0;
export function reportError(page, err, extra = '') {
  if (sent >= 5) return;
  sent++;
  try {
    const body = JSON.stringify({
      page: String(page).slice(0, 40),
      message: String(err?.message || err).slice(0, 2000),
      detail: (String(err?.stack || '') + (extra ? '\n' + extra : '')).slice(0, 6000),
      agent: ua.slice(0, 400),
    });
    fetch(`${CONFIG.SUPABASE_URL}/rest/v1/ilk_client_errors`, {
      method: 'POST', keepalive: true,
      headers: { apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body,
    }).catch(() => {});
  } catch { /* yok */ }
}
export function installErrorReporting(page) {
  window.addEventListener('error', (e) => {
    if (!e.error && /Script error/i.test(e.message || '')) return; // tarayıcı eklentisi gürültüsü
    reportError(page, e.error || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (r && r.network) return; // bağlantı hataları zaten ekranda gösteriliyor
    reportError(page, r);
  });
}

// ── Çevrimdışı uyarısı
export function installOfflineBanner() {
  const bar = document.createElement('div');
  bar.className = 'offline-bar';
  bar.textContent = 'İnternet bağlantısı yok. Bağlanınca kaldığın yerden devam edebilirsin.';
  const sync = () => {
    if (navigator.onLine === false) { if (!bar.isConnected) document.body.appendChild(bar); }
    else bar.remove();
  };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

export function storageAvailable() {
  try { localStorage.setItem('ilk.t', '1'); localStorage.removeItem('ilk.t'); return true; } catch { return false; }
}
