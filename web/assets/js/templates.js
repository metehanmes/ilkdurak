// Hazır şablonlar: hazırlayana yol gösteren örnek metinler. {ad} yerine alıcının adı yazılır.
export const TEMPLATES = {
  yildonumu: {
    title: 'Yıl Dönümü',
    tagline: 'İlk buluşmanızdan bugüne, anılarınızın geçtiği yerler',
    intro: '{ad}, bugün seni küçük bir yolculuğa çıkarıyorum. Her durakta bizden bir parça seni bekliyor. Hazırsan başlayalım.',
    final_title: 'Arkana dön',
    final_message: 'Bu yolculuğun son durağı sensin. İyi ki varsın, iyi ki biziz. Nice yıllara.',
    stops: [
      { place_label: 'İlk buluştuğumuz yer', clue: 'Her şey burada başladı. İlk kez yüz yüze geldiğimiz o yere git.', unlock_type: 'question', question: 'O gün ne içmiştik?', hint: '' },
      { place_label: 'Bizim yerimiz', clue: 'Şimdi "bizim yer" dediğimiz, birlikte en çok vakit geçirdiğimiz yere doğru yola çık.', unlock_type: 'location' },
      { place_label: 'Son durak', clue: 'Son ipucu: seni en çok güldürdüğüm yeri hatırla ve oraya gel.', unlock_type: 'tap' },
    ],
  },
  teklif: {
    title: 'Evlilik Teklifi',
    tagline: 'Hikâyenizin duraklarından geçip büyük soruya',
    intro: '{ad}, bugün sıradan bir gün değil. Birlikte yazdığımız hikâyenin duraklarında seni gezdireceğim. Hazır mısın?',
    final_title: 'Arkana dön',
    final_message: 'Bu hikâyenin geri kalanını da seninle yazmak istiyorum.',
    stops: [
      { place_label: 'Tanıştığımız yer', clue: 'Hikâyemizin ilk sayfasına git: tanıştığımız yere.', unlock_type: 'question', question: 'Bana söylediğin ilk cümle neydi?', hint: '' },
      { place_label: 'Unutamadığımız an', clue: 'Şimdi ikimizin de hiç unutmadığı o güne dön. Oradaki kişiye adını söyle, sana bir kod verecek.', unlock_type: 'code' },
      { place_label: 'Büyük an', clue: 'Son durak. Gözlerini kapat, derin bir nefes al ve gel.', unlock_type: 'tap' },
    ],
  },
  dogumgunu: {
    title: 'Doğum Günü',
    tagline: 'Hediyeye giden ipuçlu bir gün',
    intro: 'İyi ki doğdun {ad}! Bugün sana bir hediye var ama önce onu bulman lazım. İpuçlarını takip et.',
    final_title: 'İyi ki doğdun!',
    final_message: 'Hediyen tam önünde. Yeni yaşın sana en güzel sürprizleri getirsin.',
    stops: [
      { place_label: 'En sevdiğin kafe', clue: 'Önce enerji: en sevdiğin kahveyi içtiğin yere git.', unlock_type: 'question', question: 'Orada hep ne sipariş edersin?', hint: '' },
      { place_label: 'Güldüğümüz yer', clue: 'Birlikte gülmekten karnımızın ağrıdığı o yeri hatırlıyor musun? Oraya git.', unlock_type: 'location' },
      { place_label: 'Hediyenin yanı', clue: 'Son ipucu: hediyen evde, en çok vakit geçirdiğin köşede saklı.', unlock_type: 'tap' },
    ],
  },
  serbest: {
    title: 'Boş Başla',
    tagline: 'Kendi hikâyeni sıfırdan kur',
    intro: '{ad}, sana bir yolculuk hazırladım. Hazırsan başlayalım.',
    final_title: 'Sürpriz!',
    final_message: '',
    stops: [],
  },
};

export const UNLOCK_TYPES = {
  question: { label: 'Soru sorsun', short: 'Soru', icon: 'question', help: 'Oraya varınca sadece ikinizin bileceği bir soruyu cevaplasın. Kapalı mekânda da sorunsuz çalışır.' },
  location: { label: 'Konuma gelince', short: 'Konum', icon: 'pin', help: 'Telefonu o noktaya yaklaşınca açılır. Açık alanlar için en iyisi; kapalı mekânda konum şaşabilir, o yüzden 2 denemeden sonra "Buradayım" düğmesi çıkar.' },
  code: { label: 'Gizli kod', short: 'Kod', icon: 'key', help: 'Oraya bir kâğıda yazdığın ya da garsona/arkadaşına emanet ettiğin kodu girsin.' },
  tap: { label: 'Sadece dokunsun', short: 'Dokun', icon: 'hand', help: '"Vardım" düğmesine basınca açılır. Kontrol yok; sana güvenen biri için.' },
};

export function fill(text, name) {
  return String(text || '').replaceAll('{ad}', name || 'canım');
}
