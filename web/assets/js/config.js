// İlk Durak — ayarlar. Yayına alırken sadece bu dosya değişir.
export const CONFIG = {
  SUPABASE_URL: 'https://volgbwkpsvcomjsmihoq.supabase.co',
  SUPABASE_KEY: 'sb_publishable_WgiR8YW1JUxqDTKQxiWcNA_neKydFHJ',
  BUCKET: 'ilk-media',
  // Siparişler için WhatsApp numarası, ülke koduyla ve boşluksuz (ör. 905321234567). Boşsa düğme gizlenir.
  WHATSAPP: '',
  INSTAGRAM: 'ilkdurak',
  BRAND: 'İlk Durak',
  // Harita görüntüsü (OpenStreetMap). Kullanım artarsa ücretli/anahtarlı bir sağlayıcıya geçilir.
  TILE_URL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  TILE_ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  // Yer arama (OpenStreetMap Nominatim). Sadece "Ara"ya basınca, saniyede en fazla 1 istek.
  SEARCH_URL: 'https://nominatim.openstreetmap.org/search',
  PRICES: { mini: 349, standart: 599, ozel: 1999 },
};

// Yerel testte farklı sunucuya bağlanmak için: sayfa adresine ?api=http://127.0.0.1:54321 eklenir (sadece localhost'ta çalışır)
try {
  const u = new URL(location.href);
  const api = u.searchParams.get('api') || sessionStorage.getItem('ilk.api');
  if (api && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    CONFIG.SUPABASE_URL = api;
    sessionStorage.setItem('ilk.api', api);
  }
} catch { /* yok say */ }
