// Tanıtım ve bilgi sayfaları: fiyatları ve iletişim bağlantılarını ayarlardan doldurur.
import { CONFIG } from './config.js';

document.querySelectorAll('[data-price]').forEach((el) => {
  const v = CONFIG.PRICES[el.dataset.price];
  if (v) el.textContent = v.toLocaleString('tr-TR');
});
document.querySelectorAll('[data-wa]').forEach((el) => {
  if (!CONFIG.WHATSAPP) return;
  el.href = `https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent('Merhaba, İlk Durak hakkında bilgi almak istiyorum.')}`;
  el.target = '_blank'; el.rel = 'noopener'; el.hidden = false;
});
document.querySelectorAll('[data-ig]').forEach((el) => {
  el.href = `https://instagram.com/${CONFIG.INSTAGRAM}`;
  el.target = '_blank'; el.rel = 'noopener';
});
