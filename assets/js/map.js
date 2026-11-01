// Harita (Leaflet + OpenStreetMap). Harita yüklenemese bile konum seçimi çalışmaya devam eder.
import { CONFIG } from './config.js';
import { h } from './ui.js';

const ISTANBUL = [41.0082, 28.9784];
let leafletPromise = null;

export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const base = new URL('../vendor/leaflet/', import.meta.url).href;
    if (!document.querySelector('link[data-leaflet]')) {
      document.head.appendChild(h('link', { rel: 'stylesheet', href: base + 'leaflet.css', 'data-leaflet': '1' }));
    }
    const s = document.createElement('script');
    s.src = base + 'leaflet.js';
    s.onload = () => (window.L ? resolve(window.L) : reject(new Error('Harita yüklenemedi')));
    s.onerror = () => { leafletPromise = null; reject(new Error('Harita yüklenemedi')); };
    document.head.appendChild(s);
  });
  return leafletPromise;
}

/**
 * Konum seçici. Haritaya dokununca ya da iğneyi sürükleyince onChange({lat,lng}) çağrılır.
 * Döndürdüğü nesne: set(lat,lng,zoom?), setRadius(m), refresh(), destroy()
 */
export async function createPicker(container, { lat, lng, radius = 80, others = [], onChange }) {
  container.classList.add('map-box');
  const status = h('div', { class: 'map-status', hidden: true });
  container.appendChild(status);
  let L;
  try { L = await loadLeaflet(); } catch {
    status.hidden = false;
    status.textContent = 'Harita şu an yüklenemedi. Aşağıdaki "Şu an buradayım" ya da koordinat yapıştırma ile konumu yine de seçebilirsin.';
    container.classList.add('map-failed');
    return { set() {}, setRadius() {}, refresh() {}, destroy() {}, failed: true };
  }

  const el = h('div', { class: 'map-canvas' });
  container.insertBefore(el, status);
  const hasPoint = lat != null && lng != null;
  const start = hasPoint ? [lat, lng] : (others.length ? [others[0].lat, others[0].lng] : ISTANBUL);
  const map = L.map(el, { zoomControl: true, attributionControl: true, tap: true }).setView(start, hasPoint ? 16 : (others.length ? 14 : 11));
  map.attributionControl.setPrefix(false);

  let tileErrors = 0, tileOk = 0;
  const tiles = L.tileLayer(CONFIG.TILE_URL, { maxZoom: 19, attribution: CONFIG.TILE_ATTRIBUTION, crossOrigin: false });
  tiles.on('tileerror', () => {
    tileErrors++;
    if (tileErrors >= 4 && tileOk === 0) {
      status.hidden = false;
      status.textContent = 'Harita görüntüsü yüklenemedi (internet yavaş olabilir). İğneyi yine de koyabilir ya da "Şu an buradayım"ı kullanabilirsin.';
    }
  });
  tiles.on('tileload', () => { tileOk++; if (!status.hidden && tileOk > 2) status.hidden = true; });
  tiles.addTo(map);

  // Diğer duraklar (soluk noktalar)
  for (const o of others) {
    L.circleMarker([o.lat, o.lng], { radius: 6, color: '#8a7a70', weight: 1, fillColor: '#c9b8a8', fillOpacity: 0.8 })
      .addTo(map).bindTooltip(o.label || 'Diğer durak');
  }

  // İkon resim dosyasına bağlı değil (yol sorunları yaşanmasın)
  const pinIcon = L.divIcon({ className: 'pin-icon', html: '<span></span>', iconSize: [34, 44], iconAnchor: [17, 42] });
  let marker = null, circle = null, r = radius;
  const place = (la, ln, fire = true) => {
    if (!marker) {
      marker = L.marker([la, ln], { icon: pinIcon, draggable: true, autoPan: true }).addTo(map);
      marker.on('dragend', () => { const p = marker.getLatLng(); circle.setLatLng(p); onChange && onChange({ lat: p.lat, lng: p.lng }); });
      circle = L.circle([la, ln], { radius: r, color: '#b8475f', weight: 1.5, fillColor: '#b8475f', fillOpacity: 0.12 }).addTo(map);
    } else {
      marker.setLatLng([la, ln]); circle.setLatLng([la, ln]);
    }
    if (fire && onChange) onChange({ lat: la, lng: ln });
  };
  if (hasPoint) place(lat, lng, false);
  map.on('click', (e) => place(e.latlng.lat, e.latlng.lng));

  // Panel açılırken boyut değişince haritanın gri/yarım kalmaması için
  const refresh = () => { try { map.invalidateSize(); } catch { /* yok */ } };
  const ro = 'ResizeObserver' in window ? new ResizeObserver(refresh) : null;
  if (ro) ro.observe(el);
  setTimeout(refresh, 50); setTimeout(refresh, 300); setTimeout(refresh, 800);

  return {
    map,
    set(la, ln, zoom = 17) { place(la, ln, false); map.setView([la, ln], Math.max(map.getZoom(), zoom)); },
    setRadius(m) { r = m; if (circle) circle.setRadius(m); },
    refresh,
    destroy() { if (ro) ro.disconnect(); map.remove(); },
  };
}

/** "41.0123, 29.0456", Google Haritalar ve Apple Haritalar bağlantılarından koordinat çıkarır */
export function parseCoords(text) {
  if (!text) return null;
  const t = String(text).trim();
  const pats = [
    /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,              // google .../@41.01,29.02,17z
    /[?&](?:q|query|ll|sll|daddr|destination)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i, // ?q=41.01,29.02
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,            // google place verisi
    /^\s*(-?\d{1,2}[.,]\d+)\s*[,;\s]\s*(-?\d{1,3}[.,]\d+)\s*$/, // düz "41.01, 29.02" ya da "41,01 29,02"
  ];
  for (const p of pats) {
    const m = t.match(p);
    if (m) {
      const la = parseFloat(m[1].replace(',', '.')), ln = parseFloat(m[2].replace(',', '.'));
      if (Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0)) return { lat: la, lng: ln };
    }
  }
  return null;
}

let lastSearch = 0;
/** Yer arama (sadece kullanıcı "Ara"ya basınca; Türkiye öncelikli) */
export async function searchPlaces(q) {
  const wait = 1100 - (Date.now() - lastSearch);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearch = Date.now();
  const u = new URL(CONFIG.SEARCH_URL);
  u.searchParams.set('q', q);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', '6');
  u.searchParams.set('countrycodes', 'tr');
  u.searchParams.set('accept-language', 'tr');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(u.href, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('Arama şu an yapılamıyor.');
    const list = await r.json();
    return list.map((x) => ({ lat: parseFloat(x.lat), lng: parseFloat(x.lon), name: x.display_name }));
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Arama çok uzun sürdü, tekrar dene.' : 'Arama şu an yapılamıyor. Haritada iğneyi elle koyabilirsin.');
  } finally { clearTimeout(t); }
}

/** Telefonun konumunu al; Türkçe ve anlaşılır hata mesajlarıyla */
export function getPosition({ timeout = 20000, maximumAge = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Bu tarayıcı konum desteklemiyor.'));
    if (!window.isSecureContext) return reject(new Error('Konum için sitenin güvenli (https) açılması gerekiyor.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => {
        const msg = e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable';
        const err = new Error(msg); err.kind = msg; reject(err);
      },
      { enableHighAccuracy: true, timeout, maximumAge });
  });
}
