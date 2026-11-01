// Örnek yolculuk ve paylaşım görselleri: gerçek kişi fotoğrafı yok, el yapımı SVG çizimler.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
const OUT = new URL('../web/assets/img/', import.meta.url).pathname;

const scenes = {
  // Moda sahili: deniz, gün batımı, bank ve ince belli çay bardağı
  'demo-1': `
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3b38a"/><stop offset=".55" stop-color="#f7d6b5"/><stop offset="1" stop-color="#fbe9d4"/></linearGradient>
  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f8fa6"/><stop offset="1" stop-color="#3d5b72"/></linearGradient>
  <linearGradient id="tea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c0502b"/><stop offset="1" stop-color="#7b2512"/></linearGradient></defs>
  <rect width="1200" height="900" fill="url(#sky)"/>
  <circle cx="820" cy="430" r="90" fill="#f9e3b4" opacity=".95"/>
  <path d="M0 420 Q 150 395 300 412 T 600 400 T 900 410 T 1200 398 V 480 H0Z" fill="#9b8aa0" opacity=".55"/>
  <rect y="470" width="1200" height="260" fill="url(#sea)"/>
  <g stroke="#f8e2b8" stroke-width="5" stroke-linecap="round" opacity=".7"><path d="M720 520h200"/><path d="M760 560h120"/><path d="M700 600h80"/><path d="M850 610h110"/><path d="M200 540h90"/></g>
  <rect y="700" width="1200" height="200" fill="#d9c3a3"/><rect y="700" width="1200" height="14" fill="#bfa585"/>
  <g fill="#6b4630"><rect x="180" y="610" width="560" height="22" rx="6"/><rect x="180" y="645" width="560" height="22" rx="6"/><rect x="180" y="700" width="560" height="24" rx="6"/>
  <rect x="215" y="720" width="20" height="120"/><rect x="685" y="720" width="20" height="120"/></g>
  <g transform="translate(820 600)"><ellipse cx="60" cy="232" rx="95" ry="18" fill="#a88e72"/><ellipse cx="60" cy="222" rx="80" ry="14" fill="#efe4d3"/>
  <path d="M15 40 Q 10 95 38 125 Q 10 160 22 215 H98 Q110 160 82 125 Q110 95 105 40Z" fill="#ffffff" opacity=".35" stroke="#fff" stroke-width="4"/>
  <path d="M22 70 Q 20 100 40 125 Q 18 160 28 210 H92 Q102 160 80 125 Q100 100 98 70Z" fill="url(#tea)"/>
  <path d="M40 15 q 10 -18 0 -36 M62 10 q 10 -18 0 -36" stroke="#fff" stroke-width="4" fill="none" opacity=".6"/></g>`,
  // Küçük sinema: tabela, perde ışığı, iki bilet
  'demo-2': `
  <rect width="1200" height="900" fill="#2a1c22"/>
  <rect x="140" y="110" width="920" height="300" rx="18" fill="#3c252e" stroke="#e8b04f" stroke-width="10"/>
  <g fill="#f6d27a">${Array.from({ length: 22 }, (_, i) => `<circle cx="${180 + i * 40}" cy="140" r="9"/><circle cx="${180 + i * 40}" cy="380" r="9"/>`).join('')}</g>
  <text x="600" y="295" font-family="Georgia,serif" font-size="128" font-weight="700" fill="#fbe3a1" text-anchor="middle" letter-spacing="14">SİNEMA</text>
  <rect x="210" y="460" width="780" height="300" fill="#4d2f39"/>
  <path d="M210 460 h390 q -60 150 -20 300 H210Z" fill="#8f2f45"/><path d="M990 460 H600 q 60 150 20 300 H990Z" fill="#8f2f45"/>
  <g transform="translate(330 560) rotate(-8)"><rect width="300" height="150" rx="12" fill="#f5e6c8"/><rect x="210" width="4" height="150" fill="#c9ab7a" stroke-dasharray="10 8"/>
  <text x="105" y="70" font-family="Georgia,serif" font-size="34" fill="#8f2f45" text-anchor="middle" font-weight="700">BİLET</text><text x="105" y="110" font-family="Georgia,serif" font-size="24" fill="#6b4c3b" text-anchor="middle">Salon 1 · F7</text></g>
  <g transform="translate(560 590) rotate(7)"><rect width="300" height="150" rx="12" fill="#fbefd8"/><rect x="210" width="4" height="150" fill="#c9ab7a"/>
  <text x="105" y="70" font-family="Georgia,serif" font-size="34" fill="#8f2f45" text-anchor="middle" font-weight="700">BİLET</text><text x="105" y="110" font-family="Georgia,serif" font-size="24" fill="#6b4c3b" text-anchor="middle">Salon 1 · F8</text></g>
  <rect y="800" width="1200" height="100" fill="#1d1418"/>`,
  // Gece sokak: fener ışıkları, ıslak kaldırım, kalp
  'demo-3': `
  <defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2340"/><stop offset="1" stop-color="#3b3156"/></linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="#ffd98a" stop-opacity=".9"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient></defs>
  <rect width="1200" height="900" fill="url(#n)"/>
  <g fill="#fff" opacity=".8">${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 137) % 1200}" cy="${(i * 71) % 300}" r="${1 + (i % 3)}"/>`).join('')}</g>
  <g fill="#242038"><rect x="0" y="330" width="260" height="470"/><rect x="250" y="390" width="200" height="410"/><rect x="760" y="360" width="220" height="440"/><rect x="960" y="300" width="240" height="500"/></g>
  <g fill="#f3c86d" opacity=".85"><rect x="40" y="380" width="40" height="55"/><rect x="140" y="470" width="40" height="55"/><rect x="300" y="450" width="36" height="50"/><rect x="820" y="420" width="40" height="55"/><rect x="1010" y="370" width="40" height="55"/><rect x="1110" y="480" width="40" height="55"/></g>
  <path d="M450 800 L560 420 H640 L750 800Z" fill="#4a3f5e"/>
  ${[0, 1, 2].map((i) => { const x = 470 - i * 0 + (i % 2 ? 300 : 0); return ''; }).join('')}
  <g><circle cx="430" cy="420" r="130" fill="url(#glow)"/><rect x="424" y="430" width="12" height="370" fill="#14111f"/><rect x="408" y="395" width="44" height="40" rx="6" fill="#ffe2a0"/>
  <circle cx="770" cy="420" r="130" fill="url(#glow)"/><rect x="764" y="430" width="12" height="370" fill="#14111f"/><rect x="748" y="395" width="44" height="40" rx="6" fill="#ffe2a0"/></g>
  <rect y="800" width="1200" height="100" fill="#2d2740"/>
  <path d="M600 600 c -40 -50 -110 -10 -70 45 l 70 70 l 70 -70 c 40 -55 -30 -95 -70 -45z" fill="#e0607a"/>`,
  // Son durak: iki fincan, kalp köpüklü kahve, mektup
  'demo-4': `
  <rect width="1200" height="900" fill="#e9d8c2"/>
  <rect y="560" width="1200" height="340" fill="#b88b62"/><rect y="560" width="1200" height="18" fill="#9c714c"/>
  <g transform="translate(250 380)"><ellipse cx="160" cy="300" rx="210" ry="40" fill="#f6eee3"/><path d="M40 90 H280 V210 Q280 290 160 290 Q40 290 40 210Z" fill="#fbf6ee" stroke="#d9c6ad" stroke-width="6"/>
  <path d="M280 130 q 70 0 70 50 q 0 50 -70 50" fill="none" stroke="#fbf6ee" stroke-width="22"/><ellipse cx="160" cy="92" rx="120" ry="26" fill="#7a4a2c"/>
  <path d="M160 106 c -20 -26 -58 -8 -38 20 l 38 32 l 38 -32 c 20 -28 -18 -46 -38 -20z" fill="#f2dcc0" transform="translate(0 -30) scale(1 .5) translate(0 60)"/></g>
  <g transform="translate(640 400)"><ellipse cx="150" cy="282" rx="190" ry="36" fill="#f6eee3"/><path d="M40 90 H260 V200 Q260 272 150 272 Q40 272 40 200Z" fill="#a93f58"/>
  <path d="M260 125 q 62 0 62 46 q 0 46 -62 46" fill="none" stroke="#a93f58" stroke-width="20"/><ellipse cx="150" cy="92" rx="110" ry="24" fill="#6b3d23"/></g>
  <g transform="translate(420 700) rotate(-6)"><rect width="360" height="170" rx="8" fill="#fffaf2"/><path d="M0 0 L180 95 L360 0" fill="none" stroke="#d9c6ad" stroke-width="5"/>
  <circle cx="180" cy="95" r="26" fill="#a93f58"/><path d="M180 104 c -6 -8 -18 -3 -12 6 l 12 10 l 12 -10 c 6 -9 -6 -14 -12 -6z" fill="#fbe9ec"/></g>`,
};

const page = await (await chromium.launch()).newPage();
async function shot(name, svg, w = 1200, hgt = 900, type = 'jpeg') {
  await page.setViewportSize({ width: w, height: hgt });
  await page.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}">${svg}</svg></body></html>`);
  const buf = await page.screenshot({ type, quality: type === 'jpeg' ? 82 : undefined, clip: { x: 0, y: 0, width: w, height: hgt } });
  fs.writeFileSync(OUT + name + (type === 'jpeg' ? '.jpg' : '.png'), buf);
}
for (const [k, v] of Object.entries(scenes)) await shot(k, v);

const heart = (s = 1, fill = '#a93f58') => `<path transform="scale(${s})" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" fill="${fill}"/>`;
const iconSvg = `<rect width="512" height="512" rx="112" fill="#fbf6ee"/><circle cx="256" cy="256" r="178" fill="none" stroke="#a93f58" stroke-width="26"/><g transform="translate(136 140)">${heart(10)}</g>`;
fs.writeFileSync(OUT + 'icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${iconSvg}</svg>`);
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 512 512">${iconSvg.replace('rx="112"', 'rx="0"')}</svg></body></html>`);
fs.writeFileSync(OUT + 'icon-180.png', await page.screenshot({ clip: { x: 0, y: 0, width: 180, height: 180 } }));

// Paylaşım görselleri (1200x630)
const og = (title, sub) => `<rect width="1200" height="630" fill="#fbf6ee"/><rect x="28" y="28" width="1144" height="574" fill="none" stroke="#a93f58" stroke-width="4"/>
  <g transform="translate(560 90)">${heart(3.4)}</g>
  <text x="600" y="300" font-family="Georgia,serif" font-size="78" font-weight="700" fill="#2b211e" text-anchor="middle">${title}</text>
  <text x="600" y="380" font-family="Georgia,serif" font-size="38" fill="#5f514b" text-anchor="middle">${sub}</text>
  <text x="600" y="520" font-family="Georgia,serif" font-size="30" letter-spacing="8" fill="#a93f58" text-anchor="middle">İLK DURAK</text>`;
await shot('og', og('Her durakta bir anı.', 'Son durakta sen.'), 1200, 630);
await shot('og-surpriz', og('Sana bir sürpriz var', 'Hazır olduğunda dokun.'), 1200, 630);
process.exit(0);
