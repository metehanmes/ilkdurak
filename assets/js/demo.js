// Örnek yolculuk: sunucuya bağlanmadan, tanıtım için. Sunucudaki kuralların aynısını taklit eder.
const DATA = {
  template: 'yildonumu',
  sender_name: 'Mert',
  recipient_name: 'Ece',
  intro_message: 'Ece, bugün seni küçük bir yolculuğa çıkarıyorum. Her durakta bizden bir parça seni bekliyor. Hazırsan başlayalım.',
  stops: [
    {
      position: 1, place_label: 'Moda sahilindeki bank', unlock_type: 'question',
      clue: 'Her şey Moda sahilindeki o bankta başladı. Oraya git ve denize karşı otur.',
      question: 'O gün ne içiyorduk?', answers: ['çay'], hint: 'İnce belli bardakta, iki şekerli…',
      reveal_message: 'İlk cümlemi hatırlıyor musun? "Bu çay soğumadan bir yürüyüşe çıkalım mı?" O yürüyüş hâlâ sürüyor.',
      photo_path: 'demo-1.jpg',
    },
    {
      position: 2, place_label: 'İlk film gecemiz', unlock_type: 'code',
      clue: 'Şimdi ilk film gecemize dön. O küçük sinemanın gişesindeki kişiye adını söyle, sana bir kod verecek.',
      code: 'SINEMA', hint: 'Örnek yolculukta kod: SINEMA',
      reveal_message: 'Filmin yarısında uyuyakalmıştın. Ben filmi değil seni izledim.',
      photo_path: 'demo-2.jpg',
    },
    {
      position: 3, place_label: 'Son durak', unlock_type: 'tap',
      clue: 'Son ipucu: ilk kez "seni seviyorum" dediğim yerdeyim. Gel.',
      reveal_message: 'Buraya kadar geldin. Bir adım kaldı.',
      photo_path: 'demo-3.jpg',
    },
  ],
  final: { title: 'Arkana dön', message: 'Bu yolculuğun son durağı sensin. İyi ki varsın, iyi ki biziz.', photo_path: 'demo-4.jpg', audio_path: null },
};

const norm = (t) => String(t || '').replace(/[İIı]/g, 'i').toLocaleLowerCase('tr-TR')
  .replace(/[ç]/g, 'c').replace(/[ğ]/g, 'g').replace(/[ö]/g, 'o').replace(/[ş]/g, 's').replace(/[ü]/g, 'u')
  .replace(/['’`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function demoProvider() {
  let position = 0, attempts = 0;
  const total = DATA.stops.length;
  const pub = (s) => ({ position: s.position, place_label: s.place_label, clue: s.clue, reveal_message: s.reveal_message, photo_path: s.photo_path, audio_path: null, skipped: false });
  const state = () => {
    const done = position >= total;
    const cur = DATA.stops[position];
    return {
      status: done ? 'completed' : 'playing', mode: 'demo', template: DATA.template,
      recipient_name: DATA.recipient_name, sender_name: DATA.sender_name, intro_message: DATA.intro_message,
      total, position, stops: DATA.stops.slice(0, position).map(pub),
      current: done ? null : { position: cur.position, clue: cur.clue, unlock_type: cur.unlock_type, question: cur.question || null, has_hint: !!cur.hint, attempts, can_skip: attempts >= 3 },
      final: done ? DATA.final : null, now: new Date().toISOString(),
    };
  };
  const wait = (v) => new Promise((r) => setTimeout(() => r(v), 350));
  return {
    demo: true, test: false, cacheKey: 'ilk.cache.demo',
    state: () => wait(state()),
    unlock: (p, extra = {}) => {
      if (p !== position + 1) return wait({ result: 'state', state: state() });
      const s = DATA.stops[position];
      let ok = s.unlock_type === 'tap';
      if (s.unlock_type === 'question') ok = s.answers.some((a) => norm(extra.answer).split(' ').includes(norm(a)) || norm(extra.answer) === norm(a));
      if (s.unlock_type === 'code') ok = norm(extra.answer).replace(/ /g, '') === norm(s.code);
      if (ok) { position++; attempts = 0; return wait({ result: 'ok', state: state() }); }
      attempts++;
      return wait({ result: 'wrong', attempts, can_skip: attempts >= 3 });
    },
    skip: (p) => {
      if (p !== position + 1 || attempts < 3) return wait({ result: 'not_yet' });
      const s = DATA.stops[position];
      position++; attempts = 0;
      const st = state();
      st.stops[st.stops.length - 1] = { ...st.stops[st.stops.length - 1], skipped: true, answer: s.answers ? s.answers[0] : s.code };
      return wait({ result: 'ok', state: st });
    },
    hint: (p) => wait({ hint: DATA.stops[p - 1]?.hint || null }),
    reset: () => { position = 0; attempts = 0; return wait(null); },
    mediaUrl: (p) => new URL(`../img/${p}`, import.meta.url).href,
  };
}
