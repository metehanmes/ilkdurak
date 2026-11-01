-- İlk Durak — veritabanı kuralları testi (yerel, Supabase taklidi üzerinde)
\set ON_ERROR_STOP 1
\set QUIET 1

-- Kullanıcılar
reset role;
delete from auth.users;
insert into auth.users (id, email, is_anonymous) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', null, true),
  ('bbbbbbbb-0000-0000-0000-00000000000b', null, true),
  ('cccccccc-0000-0000-0000-00000000000c', null, true),
  ('dddddddd-0000-0000-0000-00000000000d', 'admin@test', false);
insert into public.ilk_admins values ('dddddddd-0000-0000-0000-00000000000d') on conflict do nothing;

-- 1) Türkçe sadeleştirme ve cevap eşleştirme
do $$ begin
  assert public.ilk_norm('İSTANBUL') = 'istanbul', 'İ büyük harf';
  assert public.ilk_norm('ISPARTA') = 'isparta', 'I harfi';
  assert public.ilk_norm('  Kadıköy''de!! ') = 'kadikoyde', 'kesme ve noktalama';
  assert public.ilk_norm('ÇAY  ŞEKER') = 'cay seker', 'boşluk';
  assert public.ilk_answer_ok('çay', array['cay']), 'birebir';
  assert public.ilk_answer_ok('CAY', array['cay']), 'büyük harf';
  assert public.ilk_answer_ok('türk kahvesi', array['turk kahvesi']), 'iki kelime';
  assert public.ilk_answer_ok('turkkahvesi', array['turk kahvesi']), 'bitişik';
  assert public.ilk_answer_ok('türk kahvsi', array['turk kahvesi']), 'tek harf hata';
  assert public.ilk_answer_ok('o gün çay içiyordum', array['cay']), 'cümle içinde';
  assert not public.ilk_answer_ok('kahve', array['cay']), 'yanlış cevap';
  assert not public.ilk_answer_ok('', array['cay']), 'boş cevap';
  assert not public.ilk_answer_ok('ca', array['cay']), 'kısa yanlış';
  assert public.ilk_answer_ok('Moda', array['moda sahili', 'moda']), 'birden çok doğru cevap';
  assert abs(public.ilk_distance_m(40.9876, 29.0290, 40.9876, 29.0302) - 101) < 3, 'mesafe ~100m';
end $$;

-- 2) Hazırlayan A yolculuk oluşturur
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated","is_anonymous":true}', false);

insert into public.ilk_journeys (template, sender_name, recipient_name, intro_message, final_title, final_message)
values ('yildonumu', 'Mete', 'Elif', 'Bugün sana bir hikâye anlatacağım.', 'Arkana dön', 'Seni seviyorum.');

do $$
declare j uuid;
begin
  select id into j from public.ilk_journeys limit 1;
  perform set_config('t.j', j::text, false);
  insert into public.ilk_stops (journey_id, position, place_label, clue, unlock_type, question, answers, hint, reveal_message, photo_path)
    values (j, 1, 'İlk kafe', 'İlk kahvemizi içtiğimiz yere git.', 'question', 'O gün ne içiyordun?', array['Çay', ' '], 'Sıcak ve demli', 'GIZLI_MESAJ_1', j || '/p1.jpg');
  insert into public.ilk_stops (journey_id, position, place_label, clue, unlock_type, lat, lng, radius_m, reveal_message)
    values (j, 2, 'Sahil', 'Bana ilk seni seviyorum dediğin yer.', 'location', 40.98200, 29.02300, 80, 'GIZLI_MESAJ_2');
  insert into public.ilk_stops (journey_id, position, clue, unlock_type, code, reveal_message)
    values (j, 3, 'Garsona adını söyle.', 'code', 'ab-12 c', 'GIZLI_MESAJ_3');
  insert into public.ilk_stops (journey_id, position, clue, unlock_type, reveal_message)
    values (j, 4, 'Masaya otur.', 'tap', 'GIZLI_MESAJ_4');
end $$;

do $$
declare n int; a text[]; c text;
begin
  select count(*) into n from public.ilk_stops;
  assert n = 4, 'A kendi duraklarını görür';
  select answers_norm into a from public.ilk_stops where position = 1;
  assert a = array['cay'], 'cevap sadeleştirildi, boş cevap atıldı: ' || a::text;
  select code_norm into c from public.ilk_stops where position = 3;
  assert c = 'ab12c', 'kod sadeleştirildi: ' || c;
end $$;

-- A durumu değiştiremez (sütun yetkisi yok)
do $$ begin
  begin
    update public.ilk_journeys set status = 'active';
    assert false, 'status güncellenmemeliydi';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ilk_stops set answers_norm = '{x}';
    assert false, 'answers_norm güncellenmemeliydi';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Eksik kontrolü: hepsi tamam olmalı
do $$ declare p jsonb; begin
  p := public.ilk_my_problems(current_setting('t.j')::uuid);
  assert jsonb_array_length(p) = 0, 'eksik olmamalı: ' || p::text;
end $$;

-- 3) B, A'nın yolculuğunu göremez/değiştiremez
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', false);
do $$ declare n int; begin
  select count(*) into n from public.ilk_journeys; assert n = 0, 'B görmemeli';
  select count(*) into n from public.ilk_stops; assert n = 0, 'B durak görmemeli';
  update public.ilk_journeys set recipient_name = 'hack'; get diagnostics n = row_count; assert n = 0, 'B güncelleyememeli';
  assert (public.ilk_my_problems(current_setting('t.j')::uuid) -> 0 ->> 'code') = 'not_found', 'B eksik listesi alamaz';
  assert (public.ilk_activate(current_setting('t.j')::uuid, 'x') ->> 'error') = 'not_found', 'B aktive edemez';
  assert (public.ilk_play_state(current_setting('t.j'), true) ->> 'status') = 'not_found', 'B deneme yapamaz';
  begin
    insert into public.ilk_stops (journey_id, position, clue) values (current_setting('t.j')::uuid, 5, 'x');
    assert false, 'B durak ekleyememeli';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 4) Anonim (alıcı) tablolara hiç erişemez
set role anon;
do $$ begin
  begin perform 1 from public.ilk_journeys; assert false, 'anon tablo okuyamamalı';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.ilk_stops; assert false, 'anon durak okuyamamalı';
  exception when insufficient_privilege then null; end;
  begin perform public.ilk_activate(current_setting('t.j')::uuid, 'x'); assert false, 'anon aktive edemez';
  exception when insufficient_privilege then null; end;
end $$;

-- Taslak yolculuk gerçek bağlantıyla açılmaz
do $$ declare tok text; begin
  reset role;
  select play_token into tok from public.ilk_journeys where id = current_setting('t.j')::uuid;
  perform set_config('t.tok', tok, false);
end $$;
set role anon;
select set_config('request.jwt.claims', '', false);
do $$ begin
  assert (public.ilk_play_state(current_setting('t.tok')) ->> 'status') = 'not_found', 'taslak açılmamalı';
end $$;

-- 5) Yönetici kod üretir; normal kullanıcı üretemez
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', false);
do $$ begin
  begin perform public.ilk_admin_create_codes('standart', 1, ''); assert false, 'B kod üretememeli';
  exception when raise_exception then null; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-00000000000d","role":"authenticated"}', false);
select set_config('t.code_std', (select public.ilk_admin_create_codes('standart', 1, 'test müşteri')), false);
select set_config('t.code_mini', (select public.ilk_admin_create_codes('mini', 1, '')), false);
do $$ declare o jsonb; begin
  assert current_setting('t.code_std') ~ '^ILK-[A-Z2-9]{4}-[A-Z2-9]{4}$', 'kod biçimi: ' || current_setting('t.code_std');
  o := public.ilk_admin_overview();
  assert jsonb_array_length(o -> 'codes') >= 2, 'kodlar listelenir';
  assert jsonb_array_length(o -> 'journeys') >= 1, 'yolculuklar listelenir';
end $$;

-- 6) A deneme modu: gerçek ilerlemeyi etkilemez
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', false);
do $$ declare r jsonb; j text := current_setting('t.j'); begin
  r := public.ilk_play_state(j, true);
  assert r ->> 'status' = 'playing', 'deneme oynanır: ' || r::text;
  assert (r -> 'current' ->> 'position')::int = 1, 'ilk durak';
  r := public.ilk_play_unlock(j, true, 1, 'çay');
  assert r ->> 'result' = 'ok', 'deneme doğru cevap: ' || r::text;
  perform public.ilk_reset_test(j::uuid);
  r := public.ilk_play_state(j, true);
  assert (r ->> 'position')::int = 0, 'deneme sıfırlandı';
end $$;

-- 7) Aktivasyon: mini kod 4 durakla olmaz, yanlış kod olmaz, standart olur, kod iki kez kullanılmaz
do $$ declare r jsonb; j uuid := current_setting('t.j')::uuid; begin
  r := public.ilk_activate(j, 'ILK-YANLIS-KOD'); assert r ->> 'error' = 'bad_code', r::text;
  r := public.ilk_activate(j, current_setting('t.code_mini')); assert r ->> 'error' = 'mini_too_many', r::text;
  r := public.ilk_activate(j, lower(replace(current_setting('t.code_std'), '-', ' ')));
  assert (r ->> 'ok')::boolean, 'standart kod küçük harf/boşlukla da çalışır: ' || r::text;
  r := public.ilk_activate(j, current_setting('t.code_std')); assert r ->> 'error' = 'already_active', r::text;
end $$;

-- Başka bir yolculukta kullanılmış kod reddedilir
insert into public.ilk_journeys (recipient_name, final_message) values ('Ayşe', 'Son');
do $$ declare r jsonb; j2 uuid; begin
  select id into j2 from public.ilk_journeys where recipient_name = 'Ayşe';
  insert into public.ilk_stops (journey_id, position, clue, unlock_type, reveal_message) values (j2, 1, 'x', 'tap', 'y');
  r := public.ilk_activate(j2, current_setting('t.code_std')); assert r ->> 'error' = 'used_code', r::text;
  r := public.ilk_activate(j2, current_setting('t.code_mini')); assert (r ->> 'ok')::boolean, 'mini kod 1 durakla: ' || r::text;
  insert into public.ilk_stops (journey_id, position, clue, unlock_type, reveal_message) values (j2, 2, 'x', 'tap', 'y');
  insert into public.ilk_stops (journey_id, position, clue, unlock_type, reveal_message) values (j2, 3, 'x', 'tap', 'y');
  begin
    insert into public.ilk_stops (journey_id, position, clue, unlock_type, reveal_message) values (j2, 4, 'x', 'tap', 'y');
    assert false, 'mini pakette 4. durak eklenmemeli';
  exception when raise_exception then
    assert sqlerrm = 'ILK_MINI_MAX', sqlerrm;
  end;
end $$;

-- 8) Alıcı (anon) gerçek oyun
set role anon;
select set_config('request.jwt.claims', '', false);
do $$
declare r jsonb; t text := current_setting('t.tok'); txt text;
begin
  r := public.ilk_play_state(t);
  assert r ->> 'status' = 'playing', r::text;
  assert r ->> 'recipient_name' = 'Elif';
  txt := r::text;
  assert txt not like '%GIZLI_MESAJ%', 'açılmamış içerik sızmamalı';
  assert txt not like '%cay%' and txt not like '%Çay%', 'cevap sızmamalı';
  assert txt not like '%40.982%' and txt not like '%29.023%', 'koordinat sızmamalı';
  assert txt not like '%ab-12%' and txt not like '%ab12c%', 'kod sızmamalı';
  assert txt not like '%Sıcak ve demli%', 'ipucu istenmeden sızmamalı';
  assert r -> 'current' ->> 'question' = 'O gün ne içiyordun?';
  assert (r -> 'current' ->> 'has_hint')::boolean;

  -- yanlış durak numarası: durum döner
  r := public.ilk_play_unlock(t, false, 2, 'x'); assert r ->> 'result' = 'state', r::text;

  -- ipucu
  r := public.ilk_play_hint(t, false, 1); assert r ->> 'hint' = 'Sıcak ve demli', r::text;
  r := public.ilk_play_hint(t, false, 2); assert r ->> 'hint' is null, 'ileri durağın ipucu verilmez';

  -- yanlış cevaplar, 3'ten sonra geç
  r := public.ilk_play_unlock(t, false, 1, 'kahve'); assert r ->> 'result' = 'wrong' and (r ->> 'can_skip')::boolean = false, r::text;
  r := public.ilk_play_skip(t, false, 1); assert r ->> 'result' = 'not_yet', r::text;
  r := public.ilk_play_unlock(t, false, 1, 'su'); r := public.ilk_play_unlock(t, false, 1, 'ayran');
  assert (r ->> 'attempts')::int = 3 and (r ->> 'can_skip')::boolean, r::text;
  r := public.ilk_play_skip(t, false, 1);
  assert r ->> 'result' = 'ok', r::text;
  assert r -> 'state' -> 'stops' -> 0 ->> 'answer' = 'Çay', 'geçince cevap gösterilir';
  assert (r -> 'state' -> 'stops' -> 0 ->> 'skipped')::boolean;
  assert r -> 'state' -> 'stops' -> 0 ->> 'reveal_message' = 'GIZLI_MESAJ_1', 'açılan içerik gelir';
  assert r::text not like '%GIZLI_MESAJ_2%', '2. durak hâlâ gizli';

  -- konum: uzak, sonra yakın (doğruluk payıyla)
  r := public.ilk_play_unlock(t, false, 2, null, null, null, null);
  assert r ->> 'result' = 'need_location' and (r ->> 'attempts')::int = 1 and not (r ->> 'can_skip')::boolean, r::text;
  r := public.ilk_play_unlock(t, false, 2, null, 40.9900, 29.0230, 10);
  assert r ->> 'result' = 'far' and (r ->> 'distance_m')::int between 880 and 900, r::text;
  r := public.ilk_play_unlock(t, false, 2, null, 40.9827, 29.0230, 40);   -- ~78m, sınırda
  assert r ->> 'result' = 'ok', 'yakında açılmalı: ' || r::text;

  -- kod: biçim farkına hoşgörü
  r := public.ilk_play_unlock(t, false, 3, 'AB12 C'); assert r ->> 'result' = 'ok', r::text;

  -- dokunarak aç ve bitir
  r := public.ilk_play_unlock(t, false, 4); assert r ->> 'result' = 'ok', r::text;
  assert r -> 'state' ->> 'status' = 'completed', r::text;
  assert r -> 'state' -> 'final' ->> 'message' = 'Seni seviyorum.';
  assert jsonb_array_length(r -> 'state' -> 'stops') = 4;

  -- bitince de aynı bağlantı Hikâyemiz'i gösterir
  r := public.ilk_play_state(t); assert r ->> 'status' = 'completed';
end $$;

-- Sahibi ilerlemeyi görür, başkası göremez
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', false);
do $$ declare r jsonb; begin
  r := public.ilk_my_status(current_setting('t.j')::uuid);
  assert r ->> 'status' = 'completed' and (r ->> 'position')::int = 4 and (r ->> 'total')::int = 4, r::text;
end $$;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', false);
do $$ begin
  assert public.ilk_my_status(current_setting('t.j')::uuid) ->> 'status' = 'not_found', 'B ilerleme göremez';
end $$;

-- Yolculuk tamamlandı olarak işaretlendi; artık düzenlenemez
reset role;
do $$ declare st text; begin
  select status into st from public.ilk_journeys where id = current_setting('t.j')::uuid;
  assert st = 'completed', st;
end $$;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', false);
do $$ declare n int; begin
  update public.ilk_journeys set final_message = 'değişti' where id = current_setting('t.j')::uuid;
  get diagnostics n = row_count; assert n = 0, 'tamamlanan yolculuk değişmemeli';
end $$;

-- 9) Başlangıç saati kilidi ve kaba kuvvet koruması
insert into public.ilk_journeys (recipient_name, final_message) values ('Zeynep', 'Son');
do $$ declare j uuid; r jsonb; tok text; begin
  select id, play_token into j, tok from public.ilk_journeys where recipient_name = 'Zeynep';
  insert into public.ilk_stops (journey_id, position, clue, unlock_type, code, reveal_message) values (j, 1, 'x', 'code', 'KOD9', 'y');
  perform set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-00000000000d","role":"authenticated"}', false);
  perform set_config('t.c3', (select public.ilk_admin_create_codes('standart', 1, '')), false);
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', false);
  r := public.ilk_activate(j, current_setting('t.c3')); assert (r ->> 'ok')::boolean, r::text;
  update public.ilk_journeys set starts_at = now() + interval '2 hours' where id = j;
  r := public.ilk_play_state(tok); assert r ->> 'status' = 'not_started', r::text;
  assert r::text not like '%intro%', 'başlamadan giriş mesajı gösterilmez';
  r := public.ilk_play_unlock(tok, false, 1, 'KOD9'); assert r -> 'state' ->> 'status' = 'not_started', r::text;
  update public.ilk_journeys set starts_at = now() - interval '1 minute' where id = j;
  for i in 1 .. 20 loop r := public.ilk_play_unlock(tok, false, 1, 'yanlis' || i); end loop;
  r := public.ilk_play_unlock(tok, false, 1, 'KOD9');
  assert r ->> 'result' = 'slow' and (r ->> 'wait_seconds')::int > 0, 'kaba kuvvet engellenmeli: ' || r::text;
end $$;

-- 9b) Konum izni hiç verilmezse iki denemeden sonra "Buradayım" ile geçilebilir
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', false);
insert into public.ilk_journeys (recipient_name, final_message) values ('Konumsuz', 'Son');
do $$ declare j uuid; tok text; r jsonb; begin
  select id, play_token into j, tok from public.ilk_journeys where recipient_name = 'Konumsuz';
  insert into public.ilk_stops (journey_id, position, clue, unlock_type, lat, lng, reveal_message) values (j, 1, 'x', 'location', 41, 29, 'y');
  perform set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-00000000000d","role":"authenticated"}', false);
  perform set_config('t.c4', (select public.ilk_admin_create_codes('standart', 1, '')), false);
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', false);
  r := public.ilk_activate(j, current_setting('t.c4')); assert (r ->> 'ok')::boolean, r::text;
  r := public.ilk_play_unlock(tok, false, 1); assert not (r ->> 'can_skip')::boolean, r::text;
  r := public.ilk_play_unlock(tok, false, 1); assert (r ->> 'can_skip')::boolean, 'ikinci konum hatasında geçilebilmeli: ' || r::text;
  r := public.ilk_play_skip(tok, false, 1); assert r -> 'state' ->> 'status' = 'completed', r::text;
end $$;

-- 10) Düzenleme bağlantısıyla başka cihazdan sahiplenme
do $$ declare j uuid; sec text; begin
  select id, claim_secret into j, sec from public.ilk_journeys where recipient_name = 'Ayşe';
  perform set_config('t.j2', j::text, false); perform set_config('t.sec', sec, false);
end $$;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-00000000000c","role":"authenticated"}', false);
do $$ declare r jsonb; n int; begin
  r := public.ilk_claim(current_setting('t.j2')::uuid, 'yanlis'); assert r ->> 'error' = 'bad_link', r::text;
  r := public.ilk_claim(current_setting('t.j2')::uuid, current_setting('t.sec')); assert (r ->> 'ok')::boolean, r::text;
  select count(*) into n from public.ilk_journeys; assert n = 1, 'C artık görür';
end $$;

-- 11) Dosya yükleme kuralları
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-00000000000c","role":"authenticated"}', false);
do $$ begin
  insert into storage.objects (bucket_id, name) values ('ilk-media', current_setting('t.j2') || '/foto.jpg');
  begin
    insert into storage.objects (bucket_id, name) values ('ilk-media', current_setting('t.j') || '/foto.jpg');
    assert false, 'başkasının klasörüne yüklenmemeli';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('ilk-media', 'rastgele/foto.jpg');
    assert false, 'yolculuk dışı klasöre yüklenmemeli';
  exception when insufficient_privilege then null; end;
end $$;
set role anon;
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('ilk-media', current_setting('t.j2') || '/x.jpg');
    assert false, 'anon yükleyememeli';
  exception when insufficient_privilege then null; end;
end $$;

-- 12) Durak silme sırayı kaydırır, sıra değiştirme çalışır, 7 durak sınırı
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', false);
insert into public.ilk_journeys (recipient_name, final_message) values ('Deniz', 'Son');
do $$ declare j uuid; ids uuid[]; p int[]; begin
  select id into j from public.ilk_journeys where recipient_name = 'Deniz';
  for i in 1 .. 7 loop
    insert into public.ilk_stops (journey_id, position, clue, unlock_type, reveal_message) values (j, i, 'durak' || i, 'tap', 'm');
  end loop;
  begin
    insert into public.ilk_stops (journey_id, position, clue) values (j, 7, 'fazla');
    assert false, '8. durak eklenmemeli';
  exception when raise_exception then assert sqlerrm = 'ILK_MAX_STOPS', sqlerrm; end;
  perform public.ilk_delete_stop((select id from public.ilk_stops where journey_id = j and position = 2));
  select array_agg(position order by position) into p from public.ilk_stops where journey_id = j;
  assert p = array[1,2,3,4,5,6], 'kaydırma: ' || p::text;
  select array_agg(id order by position desc) into ids from public.ilk_stops where journey_id = j;
  perform public.ilk_reorder(j, ids);
  assert (select clue from public.ilk_stops where journey_id = j and position = 1) = 'durak7', 'ters sıralama';
end $$;

-- 13) Hata kaydı herkes yazabilir ama kimse okuyamaz
set role anon;
insert into public.ilk_client_errors (page, message) values ('test', 'deneme');
do $$ begin
  begin perform 1 from public.ilk_client_errors; assert false, 'hata kaydı okunamamalı';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
\echo 'TÜM VERİTABANI TESTLERİ GEÇTİ'
