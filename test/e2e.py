"""İlk Durak uçtan uca test: telefon boyutunda, yerel sunucuya karşı.
Çalıştır: python3 test/e2e.py   (önce test/run_db.sh --no-tests && test/start_env.sh)
"""
import io, json, os, re, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

WEB = 'http://127.0.0.1:8080'
API = 'http://127.0.0.1:54321'
SHOTS = os.environ.get('SHOTS', '/tmp/ilk-shots')
os.makedirs(SHOTS, exist_ok=True)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTO = os.path.join(ROOT, 'web/assets/img/demo-1.jpg')
PHOTO2 = os.path.join(ROOT, 'web/assets/img/demo-4.jpg')
MODA = (40.98330, 29.02510)

def tile_png():
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (256, 256), (236, 230, 216)); d = ImageDraw.Draw(im)
    for i in range(0, 256, 64): d.line([(i, 0), (i, 256)], fill=(210, 200, 185)); d.line([(0, i), (256, i)], fill=(210, 200, 185))
    d.rectangle([90, 0, 110, 256], fill=(255, 255, 255))
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()
TILE = tile_png()

errors = []
step_no = [0]
def step(name):
    step_no[0] += 1
    print(f'  {step_no[0]:02d}. {name}', flush=True)

def shot(page, name, full=False):
    page.wait_for_timeout(1400)  # açılış animasyonları bitsin
    page.screenshot(path=f'{SHOTS}/{name}.png', full_page=full)

def watch(page, label):
    page.on('pageerror', lambda e: errors.append(f'[{label}] pageerror: {e}'))
    page.on('console', lambda m: m.type == 'error' and not re.search(r'Failed to load resource|ERR_FAILED|ERR_ABORTED|net::', m.text) and errors.append(f'[{label}] console: {m.text}'))

def new_ctx(browser, *, geo=None, perms=('geolocation', 'microphone'), tiles='ok'):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                              locale='tr-TR', timezone_id='Europe/Istanbul', permissions=list(perms),
                              geolocation={'latitude': geo[0], 'longitude': geo[1], 'accuracy': 15} if geo else None)
    if tiles == 'ok':
        ctx.route(re.compile(r'https://tile\.openstreetmap\.org/.*'), lambda r: r.fulfill(status=200, content_type='image/png', body=TILE))
    elif tiles == 'fail':
        ctx.route(re.compile(r'https://tile\.openstreetmap\.org/.*'), lambda r: r.abort())
    ctx.route(re.compile(r'https://nominatim\.openstreetmap\.org/.*'), lambda r: r.fulfill(status=200, content_type='application/json',
              body=json.dumps([{'lat': str(MODA[0]), 'lon': str(MODA[1]), 'display_name': 'Moda Sahili, Caferağa, Kadıköy, İstanbul'}])))
    return ctx

def close_sheet(page):
    page.locator('.sheet-wrap .sheet-head [aria-label="Kapat"]').last.click()
    page.wait_for_timeout(350)

def toast_has(page, text):
    expect(page.locator('.toast', has_text=text).last).to_be_visible(timeout=8000)

def open_letter(pg, hello, frm=None):
    """Mühürlü zarfı açar, daktilo yazısını dokunarak hızlandırır."""
    pg.locator('.wax').click(force=True)
    expect(pg.locator('h1.hello')).to_be_visible(timeout=10000)
    for _ in range(30):
        if pg.locator('button', has_text='Yolculuğa başla').is_visible(): break
        pg.locator('main.play').click(position={'x': 8, 'y': 8}); pg.wait_for_timeout(250)
    expect(pg.locator('h1.hello')).to_contain_text(hello)
    if frm: expect(pg.locator('.from')).to_have_text(frm)

def psql(sql):
    return subprocess.check_output(['su', 'postgres', '-c', f'psql -h /tmp -p 5433 -d ilkdurak -tAc "{sql}"']).decode().strip()

def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}, method='POST')
    return json.loads(urllib.request.urlopen(req).read() or b'null')


with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])

    # ───────── 1. Tanıtım sayfası ve örnek yolculuk
    ctx = new_ctx(browser)
    p = ctx.new_page(); watch(p, 'landing')
    step('Tanıtım sayfası açılıyor')
    p.goto(f'{WEB}/index.html'); p.wait_for_load_state('networkidle')
    expect(p.locator('h1')).to_contain_text('Her durakta bir anı')
    shot(p, '01-landing'); shot(p, '01-landing-full', True)
    assert p.evaluate('document.documentElement.scrollWidth') <= 390, 'yatay kaydırma var'

    step('Örnek yolculuk baştan sona')
    p.click('text=Örneği dene')
    expect(p.locator('.env-name')).to_have_text('Ece')
    shot(p, '02a-demo-envelope')
    open_letter(p, 'Ece, sana bir şey hazırladım', "Mert'ten sana")
    shot(p, '02-demo-intro')
    p.click('text=Yolculuğa başla')
    p.fill('input.input-big', 'kahve'); p.click('text=Cevapla')
    expect(p.locator('.feedback')).to_contain_text('Olmadı')
    p.fill('input.input-big', 'ÇAY'); p.click('text=Cevapla')
    expect(p.locator('.play-step')).to_contain_text('Durak 1 açıldı')
    p.wait_for_function("document.querySelector('.polaroid img')?.naturalWidth > 0")
    shot(p, '03-demo-reveal')
    p.click('text=Sonraki ipucu')
    p.click('text=İpucu al'); expect(p.locator('.clue-card .note')).to_contain_text('SINEMA')
    p.fill('input.input-big', 'sinema'); p.click('text=Kodu gir')
    p.click('text=Sonraki ipucu')
    p.click('text=Vardım')
    p.click('text=Son sürprize geç')
    expect(p.locator('h1.final-title')).to_have_text('Arkana dön', timeout=15000)
    shot(p, '04-demo-final')
    p.click('text=Hikâyemizi gör'); expect(p.locator('.story li')).to_have_count(3)
    ctx.close()

    # ───────── 2. Hazırlayan: yeni yolculuk
    cctx = new_ctx(browser, geo=MODA)
    c = cctx.new_page(); watch(c, 'creator')
    step('Hazırlama sayfası: hesap açmadan başlıyor')
    c.goto(f'{WEB}/hazirla.html?api={API}')
    expect(c.locator('h1')).to_have_text('Nasıl bir sürpriz?')
    shot(c, '05-create-start')
    c.click('text=Hazırlamaya başla')
    toast_has(c, 'kime hazırladığını')
    c.fill('input[autocomplete="given-name"]', 'Mete')
    c.get_by_label('Sürprizi kime hazırlıyorsun?', exact=True).fill('Elif')
    c.click('text=Hazırlamaya başla')
    step('Hoş geldin paneli + düzenleme bağlantısı')
    expect(c.locator('.sheet-title')).to_have_text('Hoş geldin!')
    expect(c.locator('.sheet-body')).to_contain_text("Elif'e hazırlayacağın")
    edit_link = c.locator('.sheet-body .link-box').inner_text()
    assert '#duzenle=' in edit_link, edit_link
    shot(c, '06-welcome')
    close_sheet(c)
    expect(c.locator('.stop-item')).to_have_count(3)
    journey_id = c.evaluate('location.hash.slice(1)')
    shot(c, '07-editor-template', True)

    step('Durak 1 (soru): cevaplar, mesaj, fotoğraf, ses kaydı')
    c.locator('.stop-tools').nth(0).locator('text=Düzenle').click()
    sheet = c.locator('.sheet-wrap').last
    ans = sheet.locator('input[placeholder="Doğru cevap"]')
    ans.fill('çay'); ans.press('Enter'); ans.fill('demli çay'); ans.press('Enter')
    expect(sheet.locator('.chip')).to_have_count(2)
    sheet.get_by_label('Yardım ipucu (isteğe bağlı)', exact=True).fill('İnce belli bardakta')
    sheet.get_by_label('Mesajın', exact=True).fill('O gün iki çay içtik, sonra saatlerce yürüdük.')
    sheet.locator('input[type=file][accept="image/*"]').set_input_files(PHOTO)
    expect(sheet.locator('.thumb img')).to_be_visible(timeout=15000)
    sheet.locator('button.rec').click(); c.wait_for_timeout(2300); sheet.locator('button.rec').click()
    expect(sheet.locator('.audio-player')).to_be_visible(timeout=15000)
    shot(c, '08-stop1-sheet')
    sheet.get_by_role('button', name='Kaydet', exact=True).click()
    toast_has(c, 'Durak kaydedildi')
    expect(c.locator('.stop-item').nth(0).locator('.pill.ok')).to_be_visible()

    step('Durak 2 (konum): harita açılıyor, arama, haritaya dokunma')
    c.locator('.stop-tools').nth(1).locator('text=Düzenle').click()
    sheet = c.locator('.sheet-wrap').last
    expect(sheet.locator('.seg button.on')).to_contain_text('Konuma gelince')
    c.wait_for_selector('.leaflet-tile-loaded', timeout=15000)
    c.wait_for_timeout(500)
    # haritanın gerçekten tam boyutta çizildiğini kontrol et (gri/yarım harita hatası)
    box = sheet.locator('.map-canvas').bounding_box()
    assert box['height'] >= 250 and box['width'] >= 300, box
    tiles_visible = c.evaluate("""() => { const m = document.querySelector('.map-canvas').getBoundingClientRect();
        return [...document.querySelectorAll('.leaflet-tile-loaded')].filter(t => { const r = t.getBoundingClientRect();
          return r.right > m.left && r.left < m.right && r.bottom > m.top && r.top < m.bottom; }).length; }""")
    assert tiles_visible >= 4, f'harita karoları görünmüyor: {tiles_visible}'
    sheet.locator('input[type=search]').fill('Moda sahili')
    sheet.locator('button', has_text='Ara').click()
    sheet.locator('.search-results button', has_text='Moda Sahili').click()
    expect(sheet.locator('text=Seçilen nokta: 40.98330, 29.02510')).to_be_visible()
    expect(sheet.locator('.pin-icon')).to_have_count(1)
    # haritaya dokun: iğne yer değiştirir
    mb = sheet.locator('.map-canvas').bounding_box()
    c.mouse.click(mb['x'] + mb['width'] / 2 + 30, mb['y'] + mb['height'] / 2 + 20)
    expect(sheet.locator('text=Seçilen nokta: 40.98330, 29.02510')).to_have_count(0)
    # koordinat yapıştır: tam noktaya geri koy
    sheet.locator('input[placeholder^="Koordinat"]').fill(f'https://www.google.com/maps/place/Moda/@{MODA[0]},{MODA[1]},17z')
    sheet.locator('input[placeholder^="Koordinat"]').dispatch_event('change')
    expect(sheet.locator('text=Seçilen nokta: 40.98330, 29.02510')).to_be_visible()
    sheet.get_by_label('Mesajın', exact=True).fill('Burada ilk kez el ele tutuştuk.')
    sheet.locator('.map-canvas').scroll_into_view_if_needed(); c.wait_for_timeout(1500)
    sheet.locator('.map-box').screenshot(path=f'{SHOTS}/09-map-closeup.png')
    shot(c, '09-stop2-map')
    sheet.get_by_role('button', name='Kaydet', exact=True).click(); toast_has(c, 'Durak kaydedildi')

    step('Durak 3 (dokun) mesaj; Durak 4 (kod) ekle, sırala')
    c.locator('.stop-tools').nth(2).locator('text=Düzenle').click()
    sheet = c.locator('.sheet-wrap').last
    sheet.get_by_label('Mesajın', exact=True).fill('Az kaldı.')
    sheet.get_by_role('button', name='Kaydet', exact=True).click(); toast_has(c, 'Durak kaydedildi')
    c.click('text=Durak ekle')
    sheet = c.locator('.sheet-wrap').last
    sheet.get_by_label('Yerin adı', exact=True).fill('Sinema')
    sheet.get_by_label('İpucu', exact=True).fill('Gişedeki kişiye adını söyle.')
    sheet.locator('.seg button', has_text='Gizli kod').click()
    sheet.get_by_label('Gizli kod', exact=True).fill('İlk Öpücük')
    sheet.get_by_label('Mesajın', exact=True).fill('Film yarıda kaldı, biz kalmadık.')
    sheet.get_by_role('button', name='Kaydet', exact=True).click(); toast_has(c, 'Durak kaydedildi')
    expect(c.locator('.stop-item')).to_have_count(4)
    # 4. durağı 3. sıraya taşı
    c.locator('.stop-tools').nth(3).locator('[aria-label="Yukarı taşı"]').click()
    expect(c.locator('.stop-place').nth(2)).to_have_text('Sinema')

    step('Son sürpriz: fotoğraf; otomatik kayıt')
    c.get_by_label('Son mesaj', exact=True).fill('Bu yolculuğun son durağı sensin. Arkana dön.')
    c.locator('section', has_text='Son sürpriz').locator('input[type=file][accept="image/*"]').set_input_files(PHOTO2)
    expect(c.locator('section', has_text='Son sürpriz').locator('.thumb img')).to_be_visible(timeout=15000)
    expect(c.locator('.save-state')).to_contain_text('Kaydedildi', timeout=8000)
    shot(c, '10-editor-ready', True)

    step('Kaydedilmeden kapatılan panel: veri değişmez')
    c.locator('.stop-tools').nth(0).locator('text=Düzenle').click()
    sheet = c.locator('.sheet-wrap').last
    sheet.locator('.thumb .x').click()
    sheet.get_by_role('button', name='Vazgeç', exact=True).click(); c.wait_for_timeout(400)
    assert psql(f"select photo_path is not null from ilk_stops where journey_id='{journey_id}' and position=1") == 't'
    path1 = psql(f"select photo_path from ilk_stops where journey_id='{journey_id}' and position=1")
    assert urllib.request.urlopen(f'{API}/storage/v1/object/public/ilk-media/{path1}').status == 200, 'fotoğraf silinmiş!'

    step('Gönder: kod yok, eksik yok, paketler')
    c.locator('[data-send]').click()
    sheet = c.locator('.sheet-wrap').last
    expect(sheet).to_contain_text('Her şey tamam')
    expect(sheet.locator('.plan.featured')).to_contain_text('Standart')
    shot(c, '11-activate')
    sheet.locator('input.input-big').fill('ILK-AAAA-BBBB'); sheet.locator('text=Kodu gir ve gönderime hazırla').click()
    expect(sheet.locator('.note.bad')).to_contain_text('geçerli değil')
    close_sheet(c)

    # ───────── 3. Deneme modu
    step('Deneme modu: hazırlayan alıcı gibi oynuyor')
    c.click('text=Dene')
    c.wait_for_url('**/s.html?deneme=*')
    expect(c.locator('.test-bar')).to_contain_text('Deneme modu')
    open_letter(c, 'Elif, sana bir şey hazırladım', "Mete'den sana")
    c.click('text=Yolculuğa başla')
    c.fill('input.input-big', 'demli cay'); c.click('text=Cevapla')
    expect(c.locator('.play-step')).to_contain_text('Durak 1 açıldı')
    c.wait_for_function("document.querySelector('.polaroid img')?.naturalWidth > 0")
    expect(c.locator('.audio-player')).to_be_visible()
    shot(c, '12-test-reveal1')
    c.click('text=Sonraki ipucu')
    cctx.set_geolocation({'latitude': 41.0, 'longitude': 29.03, 'accuracy': 15})
    c.click('text=Vardım, konumumu kontrol et')
    expect(c.locator('.feedback')).to_contain_text('Henüz değil', timeout=10000)
    cctx.set_geolocation({'latitude': MODA[0] + 0.0003, 'longitude': MODA[1], 'accuracy': 15})
    c.click('text=Vardım, konumumu kontrol et')
    expect(c.locator('.play-step')).to_contain_text('Durak 2 açıldı', timeout=10000)
    c.click('text=Sonraki ipucu')
    c.fill('input.input-big', 'ilkopucuk'); c.click('text=Kodu gir')
    expect(c.locator('.play-step')).to_contain_text('Durak 3 açıldı')
    c.click('text=Sonraki ipucu'); c.click('text=Vardım'); c.click('text=Son sürprize geç')
    expect(c.locator('h1.final-title')).to_have_text('Arkana dön', timeout=15000)
    step('Deneme bitti: gerçek yolculuk hâlâ taslak, ilerleme ayrı')
    assert psql(f"select status from ilk_journeys where id='{journey_id}'") == 'draft'
    assert psql(f"select count(*) from ilk_progress where journey_id='{journey_id}' and mode='real'") == '0'
    c.locator('a', has_text='Düzenlemeye dön').click()
    expect(c.locator('.stop-item')).to_have_count(4)

    # ───────── 4. Yönetim: kod üret
    step('Yönetim: giriş ve kod üretme')
    post(f'{API}/auth/v1/signup', {'email': 'admin@test.local', 'password': 'test-sifre-1'})
    psql("insert into ilk_admins(user_id) select id from auth.users where email='admin@test.local' on conflict do nothing")
    actx = new_ctx(browser); a = actx.new_page(); watch(a, 'admin')
    a.goto(f'{WEB}/yonetim.html?api={API}')
    a.fill('input[type=email]', 'admin@test.local'); a.fill('input[type=password]', 'yanlis')
    a.get_by_role('button', name='Giriş yap').click(); expect(a.locator('.note.bad')).to_contain_text('hatalı')
    a.fill('input[type=password]', 'test-sifre-1'); a.get_by_role('button', name='Giriş yap').click()
    expect(a.locator('h2', has_text='Yolculuklar')).to_be_visible()
    a.locator('select').select_option('mini'); a.locator('input[type=number]').fill('1'); a.click('text=Kod üret')
    mini_code = a.locator('.note.ok strong.mono').first.inner_text()
    a.locator('select').select_option('standart'); a.click('text=Kod üret')
    expect(a.locator('.note.ok')).to_contain_text('Standart')
    std_code = a.locator('.note.ok strong.mono').first.inner_text()
    assert re.fullmatch(r'ILK-[A-Z2-9]{4}-[A-Z2-9]{4}', std_code), std_code
    shot(a, '13-admin', True)

    # ───────── 5. Etkinleştir ve paylaş
    step('Mini kod 4 duraklı yolculukta reddediliyor; Standart kabul')
    c.locator('[data-send]').click()
    sheet = c.locator('.sheet-wrap').last
    sheet.locator('input.input-big').fill(mini_code.lower()); sheet.locator('text=Kodu gir ve gönderime hazırla').click()
    expect(sheet.locator('.note.bad')).to_contain_text('Mini paket kodu')
    sheet.locator('input.input-big').fill(' ' + std_code.lower().replace('-', ' ') + ' ')
    sheet.locator('text=Kodu gir ve gönderime hazırla').click()
    expect(c.locator('.sheet-title').last).to_have_text('Gönder', timeout=10000)
    sheet = c.locator('.sheet-wrap').last
    play_link = sheet.locator('.link-box').inner_text()
    assert re.search(r'/s\.html#[A-Za-z0-9]{20,}$', play_link), play_link
    expect(sheet.locator('.qr-card canvas')).to_be_visible()
    expect(sheet).to_contain_text('henüz açmadı')
    shot(c, '14-share', True)
    close_sheet(c)
    expect(c.locator('.pill', has_text='Gönderildi')).to_be_visible()

    # ───────── 6. Alıcı (konum izni yok)
    step('Alıcı: hiç giriş yapmadan bağlantıyı açıyor (konum izni kapalı)')
    rctx = new_ctx(browser, perms=())
    r = rctx.new_page(); watch(r, 'recipient')
    token = play_link.split('#')[1]
    r.goto(f'{WEB}/s.html?api={API}#{token}')
    expect(r.locator('.env-name')).to_have_text('Elif')
    shot(r, '15a-recipient-envelope')
    open_letter(r, 'Elif, sana bir şey hazırladım')
    shot(r, '15-recipient-intro')
    r.click('text=Yolculuğa başla')
    for w in ['kahve', 'su', 'ayran']:
        r.fill('input.input-big', w); r.click('text=Cevapla'); r.wait_for_timeout(250)
    expect(r.locator('[data-skip]')).to_have_text('Bilemedim, cevabı göster')
    r.click('[data-skip]')
    expect(r.locator('.reveal .note')).to_contain_text('Doğru cevap: çay')
    r.click('text=Sonraki ipucu')
    step('Alıcı: konum izni yok → 2 denemeden sonra "Buradayım"')
    r.click('text=Vardım, konumumu kontrol et')
    expect(r.locator('.feedback')).to_contain_text('Konum izni', timeout=10000)
    r.click('text=Vardım, konumumu kontrol et'); r.wait_for_timeout(600)
    expect(r.locator('[data-skip]')).to_have_text('Buradayım, devam et')
    shot(r, '16-recipient-location-denied')
    r.click('[data-skip]')
    expect(r.locator('.play-step')).to_contain_text('Durak 2 açıldı')
    step('Alıcı: sayfayı yenileyince kaldığı yerden devam')
    r.reload()
    expect(r.locator('.play-step')).to_contain_text('Durak 3 / 4')
    step('Hazırlayan durumu görüyor')
    c.locator('[data-send]').click()
    expect(c.locator('.sheet-wrap').last).to_contain_text('2/4 durak açıldı')
    close_sheet(c)
    r.fill('input.input-big', 'ILK-OPUCUK'); r.click('text=Kodu gir')
    r.click('text=Sonraki ipucu')
    step('Canlı takip: son durağa gelince hazırlayana uyarı')
    c.locator('[data-live]').click()
    expect(c.locator('.live-alert')).to_contain_text('Son durağa geldi', timeout=12000)
    expect(c.locator('.live-head')).to_contain_text('şu an ekrana bakıyor')
    expect(c.locator('.live-list li.cur')).to_contain_text('Son durak')
    shot(c, '17a-live-tracking')
    r.click('text=Vardım'); r.click('text=Son sürprize geç')
    expect(c.locator('.live-alert.done')).to_contain_text('son sürprizi gördü', timeout=15000)
    close_sheet(c)
    expect(r.locator('h1.final-title')).to_have_text('Arkana dön', timeout=15000)
    r.wait_for_function("document.querySelector('.polaroid img')?.naturalWidth > 0")
    shot(r, '17-recipient-final')
    r.click('text=Hikâyemizi gör')
    expect(r.locator('.story li')).to_have_count(4)
    shot(r, '18-recipient-story', True)
    step('Alıcı tamamladıktan sonra bağlantı hikâyeyi göstermeye devam ediyor')
    r.reload(); expect(r.locator('h1.final-title')).to_have_text('Arkana dön')
    assert psql(f"select status from ilk_journeys where id='{journey_id}'") == 'completed'
    rctx.close()

    step('Hazırlayan: tamamlandı, düzenleme kilitli')
    c.reload()
    expect(c.locator('.pill', has_text='Tamamlandı')).to_be_visible()
    expect(c.locator('text=Durak ekle')).to_be_disabled()

    # ───────── 7. Düzenleme bağlantısı başka telefonda
    step('Düzenleme bağlantısı başka cihazda açılıyor')
    dctx = new_ctx(browser); d = dctx.new_page(); watch(d, 'device2')
    d.goto(edit_link.replace(WEB + '/hazirla.html', f'{WEB}/hazirla.html?api={API}'))
    toast_has(d, 'bu cihaza bağlandı')
    expect(d.locator('h1')).to_contain_text('Elif için')
    dctx.close()
    step('İlk cihaz: yolculuk taşındığını söylüyor; bağlantıyla geri alıyor')
    c.reload()
    toast_has(c, 'başka bir cihaza taşınmış')
    c.goto(edit_link.replace(WEB + '/hazirla.html', f'{WEB}/hazirla.html?api={API}'))
    toast_has(c, 'bu cihaza bağlandı')
    expect(c.locator('h1')).to_contain_text('Elif için')

    # ───────── 8. Harita arızaları
    step('Harita karoları yüklenemezse: uyarı çıkıyor, iğne yine konuyor')
    fctx = new_ctx(browser, geo=MODA, tiles='fail'); f = fctx.new_page(); watch(f, 'tilefail')
    f.goto(f'{WEB}/hazirla.html?api={API}#yeni')
    f.locator('.tpl', has_text='Doğum Günü').click()
    f.get_by_label('Sürprizi kime hazırlıyorsun?', exact=True).fill('Kemal')
    f.click('text=Hazırlamaya başla'); close_sheet(f)
    f.locator('.stop-tools').nth(1).locator('text=Düzenle').click()
    s2 = f.locator('.sheet-wrap').last
    expect(s2.locator('.map-status')).to_contain_text('yüklenemedi', timeout=15000)
    s2.get_by_role('button', name='Şu an buradayım').click()
    expect(s2.locator('text=Seçilen nokta: 40.98330, 29.02510')).to_be_visible()
    shot(f, '19-map-tiles-failed')
    close_sheet(f)
    fctx.close()

    step('Harita kütüphanesi hiç yüklenemezse: konum yine seçilebiliyor')
    gctx = new_ctx(browser, geo=MODA); g = gctx.new_page(); watch(g, 'leafletfail')
    gctx.route(re.compile(r'.*/leaflet\.js$'), lambda rt: rt.abort())
    g.goto(f'{WEB}/hazirla.html?api={API}#yeni')
    g.locator('.tpl', has_text='Doğum Günü').click()
    g.get_by_label('Sürprizi kime hazırlıyorsun?', exact=True).fill('Ayşe')
    g.click('text=Hazırlamaya başla'); close_sheet(g)
    g.locator('.stop-tools').nth(1).locator('text=Düzenle').click()
    s3 = g.locator('.sheet-wrap').last
    expect(s3.locator('.map-status')).to_contain_text('Harita şu an yüklenemedi', timeout=15000)
    s3.locator('input[placeholder^="Koordinat"]').fill('40,98330 29,02510'); s3.locator('input[placeholder^="Koordinat"]').dispatch_event('change')
    expect(s3.locator('text=Seçilen nokta: 40.98330, 29.02510')).to_be_visible()
    s3.get_by_label('Mesajın', exact=True).fill('x')
    s3.get_by_role('button', name='Kaydet', exact=True).click(); toast_has(g, 'Durak kaydedildi')
    gctx.close()

    step('Sunucu bir an hata verirse: yeniden deneme ile devam')
    post(f'{API}/__faults', {'failRest': 1})
    c.reload(); expect(c.locator('h1')).to_contain_text('Elif için', timeout=15000)
    post(f'{API}/__faults', {'failRest': 0})

    step('Bilinmeyen / eksik bağlantılar')
    x = cctx.new_page(); watch(x, 'badlink')
    x.goto(f'{WEB}/s.html?api={API}#abcdefghijklmnopqrstuv')
    expect(x.locator('h1.hello')).to_have_text('Bu bağlantı açılamadı')
    x.goto(f'{WEB}/s.html'); x.reload()
    expect(x.locator('h1.hello')).to_have_text('Bağlantı eksik')

    browser.close()

print()
if errors:
    print('KONSOL HATALARI:'); [print('  ', e) for e in errors]; sys.exit(1)
print('UÇTAN UCA TESTLER GEÇTİ ✓  ekran görüntüleri:', SHOTS)
