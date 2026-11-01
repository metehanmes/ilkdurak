-- İlk Durak — veritabanı
-- Supabase SQL Editor'de bir kez çalıştırılır. Tekrar çalıştırmak güvenlidir (idempotent).
-- Tüm nesneler "ilk_" önekiyle, aynı projedeki başka tablolarla çakışmaz.
--
-- Güvenlik modeli
--  * Hazırlayan: Supabase "anonim giriş" ile oturum açar (kayıt formu yok). Kendi yolculuklarını görür ve düzenler.
--    Başka cihazdan devam etmek için "düzenleme bağlantısı" (claim_secret) ile yolculuğu sahiplenir.
--  * Alıcı: hiç giriş yapmaz. Sadece play_token ile çağrılan güvenli fonksiyonları kullanır.
--    Henüz açılmamış durağın içeriği, cevabı, kodu ve koordinatı sunucudan hiçbir şekilde dönmez.
--  * Yönetici: e-posta+şifreli kullanıcı + ilk_admins tablosunda kaydı olan kişi.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- ───────────────────────── yardımcılar ─────────────────────────

-- Tahmin edilemeyen kısa anahtar (karışan harfler yok: 0/O, 1/l/I)
create or replace function public.ilk_token(n int)
returns text language sql volatile
set search_path = public, extensions, pg_temp
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', (get_byte(b, i) % 56) + 1, 1), '')
  from (select extensions.gen_random_bytes(n) as b) s, generate_series(0, n - 1) as i
$$;

-- Türkçe cevap karşılaştırması için sadeleştirme:
-- büyük/küçük harf, İ/ı/I, ç ğ ö ş ü, şapkalı harfler, kesme işareti ve noktalama farkı yok sayılır.
create or replace function public.ilk_norm(t text)
returns text language sql immutable
set search_path = pg_catalog
as $$
  select btrim(regexp_replace(
           regexp_replace(
             lower(translate(coalesce(t, ''), 'İIıÇçĞğÖöŞşÜüÂâÎîÛûÊê’''`´', 'iiiccggoossuuaaiiuuee')),
             '[^a-z0-9]+', ' ', 'g'),
           '\s+', ' ', 'g'))
$$;

-- Cevap doğru mu? Küçük yazım hatalarına ve cümle içinde geçen cevaba hoşgörülü.
create or replace function public.ilk_answer_ok(p_input text, p_answers text[])
returns boolean language plpgsql immutable
set search_path = public, extensions, pg_temp
as $$
declare
  n text := left(public.ilk_norm(p_input), 200);
  a text;
begin
  if n = '' or p_answers is null then return false; end if;
  foreach a in array p_answers loop
    continue when a is null or a = '';
    if n = a then return true; end if;
    if replace(n, ' ', '') = replace(a, ' ', '') then return true; end if;
    if char_length(a) >= 4 and extensions.levenshtein(n, a) <= (case when char_length(a) >= 9 then 2 else 1 end) then
      return true;
    end if;
    if char_length(a) >= 3 and (' ' || n || ' ') like ('% ' || a || ' %') then return true; end if;
  end loop;
  return false;
end $$;

-- İki nokta arası mesafe (metre)
create or replace function public.ilk_distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable
set search_path = pg_catalog
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- ───────────────────────── tablolar ─────────────────────────

create table if not exists public.ilk_journeys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  play_token text not null unique default public.ilk_token(22),
  claim_secret text not null default public.ilk_token(24),
  template text not null default 'serbest' check (template in ('yildonumu', 'teklif', 'dogumgunu', 'serbest')),
  sender_name text not null default '' check (char_length(sender_name) <= 40),
  recipient_name text not null default '' check (char_length(recipient_name) <= 40),
  intro_message text not null default '' check (char_length(intro_message) <= 800),
  final_title text not null default '' check (char_length(final_title) <= 80),
  final_message text not null default '' check (char_length(final_message) <= 1200),
  final_photo_path text check (char_length(final_photo_path) <= 200),
  final_audio_path text check (char_length(final_audio_path) <= 200),
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'disabled')),
  plan text check (plan in ('mini', 'standart', 'ozel')),
  starts_at timestamptz,
  activated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ilk_journeys_owner_idx on public.ilk_journeys (owner_id);

create table if not exists public.ilk_stops (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.ilk_journeys (id) on delete cascade,
  position smallint not null check (position between 1 and 7),
  place_label text not null default '' check (char_length(place_label) <= 60),
  clue text not null default '' check (char_length(clue) <= 600),
  unlock_type text not null default 'question' check (unlock_type in ('question', 'location', 'code', 'tap')),
  question text not null default '' check (char_length(question) <= 300),
  answers text[] not null default '{}' check (cardinality(answers) <= 5),
  answers_norm text[] not null default '{}',
  hint text not null default '' check (char_length(hint) <= 300),
  code text not null default '' check (char_length(code) <= 40),
  code_norm text not null default '',
  lat float8 check (lat between -90 and 90),
  lng float8 check (lng between -180 and 180),
  radius_m int not null default 80 check (radius_m between 30 and 500),
  reveal_message text not null default '' check (char_length(reveal_message) <= 1200),
  photo_path text check (char_length(photo_path) <= 200),
  audio_path text check (char_length(audio_path) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ilk_stops_position_uniq unique (journey_id, position) deferrable initially deferred
);
create index if not exists ilk_stops_journey_idx on public.ilk_stops (journey_id);

create table if not exists public.ilk_progress (
  journey_id uuid not null references public.ilk_journeys (id) on delete cascade,
  mode text not null check (mode in ('real', 'test')),
  position int not null default 0,          -- açılmış durak sayısı
  stop_attempts int not null default 0,     -- şu anki duraktaki yanlış deneme
  stop_first_try_at timestamptz,
  window_start timestamptz,
  window_wrong int not null default 0,
  skipped int[] not null default '{}',
  started_at timestamptz,
  finished_at timestamptz,
  primary key (journey_id, mode)
);

create table if not exists public.ilk_codes (
  code text primary key,
  plan text not null check (plan in ('mini', 'standart', 'ozel')),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  used_journey uuid references public.ilk_journeys (id) on delete set null,
  used_at timestamptz
);

create table if not exists public.ilk_admins (
  user_id uuid primary key
);

create table if not exists public.ilk_client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  page text check (char_length(page) <= 40),
  message text check (char_length(message) <= 2000),
  detail text check (char_length(detail) <= 6000),
  agent text check (char_length(agent) <= 400)
);

-- ───────────────────────── tetikleyiciler ─────────────────────────

create or replace function public.ilk_touch()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists ilk_journeys_touch on public.ilk_journeys;
create trigger ilk_journeys_touch before update on public.ilk_journeys
  for each row execute function public.ilk_touch();

create or replace function public.ilk_stops_prepare()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.answers := coalesce(array(
    select left(btrim(x), 80) from unnest(coalesce(new.answers, '{}')) as x where btrim(x) <> '' limit 5), '{}');
  new.answers_norm := coalesce(array(
    select public.ilk_norm(x) from unnest(new.answers) as x where public.ilk_norm(x) <> ''), '{}');
  new.code := btrim(coalesce(new.code, ''));
  new.code_norm := replace(public.ilk_norm(new.code), ' ', '');
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists ilk_stops_prepare on public.ilk_stops;
create trigger ilk_stops_prepare before insert or update on public.ilk_stops
  for each row execute function public.ilk_stops_prepare();

-- Durak sayısı sınırı ve bitmiş yolculuğa ekleme yasağı
create or replace function public.ilk_stops_limit()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare j public.ilk_journeys; n int;
begin
  select * into j from public.ilk_journeys where id = new.journey_id;
  if j.status in ('completed', 'disabled') then
    raise exception 'ILK_LOCKED' using hint = 'Bu yolculuk artık düzenlenemez.';
  end if;
  select count(*) into n from public.ilk_stops where journey_id = new.journey_id;
  if n >= 7 then raise exception 'ILK_MAX_STOPS' using hint = 'En fazla 7 durak eklenebilir.'; end if;
  if j.plan = 'mini' and n >= 3 then
    raise exception 'ILK_MINI_MAX' using hint = 'Mini pakette en fazla 3 durak olabilir.';
  end if;
  return new;
end $$;

drop trigger if exists ilk_stops_limit on public.ilk_stops;
create trigger ilk_stops_limit before insert on public.ilk_stops
  for each row execute function public.ilk_stops_limit();

-- ───────────────────────── erişim kuralları ─────────────────────────

alter table public.ilk_journeys enable row level security;
alter table public.ilk_stops enable row level security;
alter table public.ilk_progress enable row level security;
alter table public.ilk_codes enable row level security;
alter table public.ilk_admins enable row level security;
alter table public.ilk_client_errors enable row level security;

-- Varsayılan geniş yetkileri kaldır, sadece gereken sütunları aç
revoke all on public.ilk_journeys, public.ilk_stops, public.ilk_progress, public.ilk_codes,
  public.ilk_admins, public.ilk_client_errors from anon, authenticated;

grant select, delete on public.ilk_journeys to authenticated;
grant insert (template, sender_name, recipient_name, intro_message, final_title, final_message) on public.ilk_journeys to authenticated;
grant update (template, sender_name, recipient_name, intro_message, final_title, final_message,
  final_photo_path, final_audio_path, starts_at) on public.ilk_journeys to authenticated;

grant select, delete on public.ilk_stops to authenticated;
grant insert (journey_id, position, place_label, clue, unlock_type, question, answers, hint, code, lat, lng, radius_m,
  reveal_message, photo_path, audio_path) on public.ilk_stops to authenticated;
grant update (position, place_label, clue, unlock_type, question, answers, hint, code, lat, lng, radius_m,
  reveal_message, photo_path, audio_path) on public.ilk_stops to authenticated;

grant insert (page, message, detail, agent) on public.ilk_client_errors to anon, authenticated;

drop policy if exists ilk_journeys_select on public.ilk_journeys;
create policy ilk_journeys_select on public.ilk_journeys for select to authenticated
  using (owner_id = auth.uid());
drop policy if exists ilk_journeys_insert on public.ilk_journeys;
create policy ilk_journeys_insert on public.ilk_journeys for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists ilk_journeys_update on public.ilk_journeys;
create policy ilk_journeys_update on public.ilk_journeys for update to authenticated
  using (owner_id = auth.uid() and status in ('draft', 'active'))
  with check (owner_id = auth.uid());
drop policy if exists ilk_journeys_delete on public.ilk_journeys;
create policy ilk_journeys_delete on public.ilk_journeys for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists ilk_stops_select on public.ilk_stops;
create policy ilk_stops_select on public.ilk_stops for select to authenticated
  using (exists (select 1 from public.ilk_journeys j where j.id = journey_id and j.owner_id = auth.uid()));
drop policy if exists ilk_stops_insert on public.ilk_stops;
create policy ilk_stops_insert on public.ilk_stops for insert to authenticated
  with check (exists (select 1 from public.ilk_journeys j
                      where j.id = journey_id and j.owner_id = auth.uid() and j.status in ('draft', 'active')));
drop policy if exists ilk_stops_update on public.ilk_stops;
create policy ilk_stops_update on public.ilk_stops for update to authenticated
  using (exists (select 1 from public.ilk_journeys j
                 where j.id = journey_id and j.owner_id = auth.uid() and j.status in ('draft', 'active')));
drop policy if exists ilk_stops_delete on public.ilk_stops;
create policy ilk_stops_delete on public.ilk_stops for delete to authenticated
  using (exists (select 1 from public.ilk_journeys j
                 where j.id = journey_id and j.owner_id = auth.uid() and j.status in ('draft', 'active')));

drop policy if exists ilk_client_errors_insert on public.ilk_client_errors;
create policy ilk_client_errors_insert on public.ilk_client_errors for insert to anon, authenticated
  with check (true);

-- ───────────────────────── hazırlayan fonksiyonları ─────────────────────────

-- Yolculukta eksik ne var? Hem ekranda uyarı hem aktivasyon kontrolü için.
create or replace function public.ilk_problems(p_journey uuid)
returns jsonb language plpgsql stable
security definer
set search_path = public, pg_temp
as $$
declare j public.ilk_journeys; s public.ilk_stops; out jsonb := '[]'::jsonb; n int := 0;
begin
  select * into j from public.ilk_journeys where id = p_journey;
  if not found then return '[{"code":"not_found"}]'::jsonb; end if;
  if btrim(j.recipient_name) = '' then out := out || '[{"code":"recipient_name"}]'::jsonb; end if;
  for s in select * from public.ilk_stops where journey_id = p_journey order by position loop
    n := n + 1;
    if btrim(s.clue) = '' then out := out || jsonb_build_array(jsonb_build_object('code', 'clue', 'position', s.position)); end if;
    if s.unlock_type = 'question' and (btrim(s.question) = '' or cardinality(s.answers_norm) = 0) then
      out := out || jsonb_build_array(jsonb_build_object('code', 'question', 'position', s.position));
    elsif s.unlock_type = 'location' and (s.lat is null or s.lng is null) then
      out := out || jsonb_build_array(jsonb_build_object('code', 'location', 'position', s.position));
    elsif s.unlock_type = 'code' and s.code_norm = '' then
      out := out || jsonb_build_array(jsonb_build_object('code', 'code', 'position', s.position));
    end if;
    if btrim(s.reveal_message) = '' and s.photo_path is null and s.audio_path is null then
      out := out || jsonb_build_array(jsonb_build_object('code', 'reveal', 'position', s.position));
    end if;
  end loop;
  if n = 0 then out := out || '[{"code":"no_stops"}]'::jsonb; end if;
  if btrim(j.final_message) = '' and j.final_photo_path is null and j.final_audio_path is null then
    out := out || '[{"code":"final"}]'::jsonb;
  end if;
  return out;
end $$;

create or replace function public.ilk_my_problems(p_journey uuid)
returns jsonb language plpgsql stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.ilk_journeys where id = p_journey and owner_id = auth.uid()) then
    return '[{"code":"not_found"}]'::jsonb;
  end if;
  return public.ilk_problems(p_journey);
end $$;

-- Aktivasyon kodu ile yolculuğu gönderilebilir hale getirir
create or replace function public.ilk_activate(p_journey uuid, p_code text)
returns jsonb language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
declare j public.ilk_journeys; c public.ilk_codes; n int; probs jsonb; norm text;
begin
  select * into j from public.ilk_journeys where id = p_journey and owner_id = auth.uid() for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if j.status <> 'draft' then return jsonb_build_object('ok', false, 'error', 'already_active'); end if;
  norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  select * into c from public.ilk_codes where upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')) = norm for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  if c.used_journey is not null or c.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'used_code');
  end if;
  select count(*) into n from public.ilk_stops where journey_id = p_journey;
  if c.plan = 'mini' and n > 3 then return jsonb_build_object('ok', false, 'error', 'mini_too_many', 'stops', n); end if;
  probs := public.ilk_problems(p_journey);
  if jsonb_array_length(probs) > 0 then return jsonb_build_object('ok', false, 'error', 'incomplete', 'problems', probs); end if;
  update public.ilk_codes set used_journey = p_journey, used_at = now() where code = c.code;
  update public.ilk_journeys set status = 'active', plan = c.plan, activated_at = now() where id = p_journey;
  delete from public.ilk_progress where journey_id = p_journey and mode = 'real';
  return jsonb_build_object('ok', true, 'plan', c.plan, 'play_token', j.play_token);
end $$;

-- Başka cihazdan düzenlemeye devam: düzenleme bağlantısındaki gizli anahtarla sahiplen
create or replace function public.ilk_claim(p_journey uuid, p_secret text)
returns jsonb language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  update public.ilk_journeys set owner_id = auth.uid()
   where id = p_journey and claim_secret = p_secret and status <> 'disabled';
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_link'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ilk_reset_test(p_journey uuid)
returns void language sql volatile
security definer
set search_path = public, pg_temp
as $$
  delete from public.ilk_progress p
   using public.ilk_journeys j
   where p.journey_id = j.id and j.id = p_journey and j.owner_id = auth.uid() and p.mode = 'test'
$$;

-- Durakların sırasını tek seferde değiştir (ör. [id3, id1, id2])
create or replace function public.ilk_reorder(p_journey uuid, p_ids uuid[])
returns void language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
declare i int;
begin
  if not exists (select 1 from public.ilk_journeys
                  where id = p_journey and owner_id = auth.uid() and status in ('draft', 'active')) then
    raise exception 'ILK_NOT_FOUND';
  end if;
  if (select count(*) from public.ilk_stops where journey_id = p_journey) <> cardinality(p_ids) then
    raise exception 'ILK_REORDER_MISMATCH';
  end if;
  for i in 1 .. cardinality(p_ids) loop
    update public.ilk_stops set position = i where id = p_ids[i] and journey_id = p_journey;
    if not found then raise exception 'ILK_REORDER_MISMATCH'; end if;
  end loop;
end $$;

-- Bir durak silinince arkadakileri kaydır (boşluk kalmasın)
create or replace function public.ilk_delete_stop(p_stop uuid)
returns void language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
declare s public.ilk_stops;
begin
  select st.* into s from public.ilk_stops st join public.ilk_journeys j on j.id = st.journey_id
   where st.id = p_stop and j.owner_id = auth.uid() and j.status in ('draft', 'active');
  if not found then raise exception 'ILK_NOT_FOUND'; end if;
  delete from public.ilk_stops where id = p_stop;
  update public.ilk_stops set position = position - 1 where journey_id = s.journey_id and position > s.position;
end $$;

-- Sahibi için gerçek ilerleme (alıcının oyununa dokunmadan)
create or replace function public.ilk_my_status(p_journey uuid)
returns jsonb language plpgsql stable
security definer
set search_path = public, pg_temp
as $$
declare j public.ilk_journeys; p public.ilk_progress; total int;
begin
  select * into j from public.ilk_journeys where id = p_journey and owner_id = auth.uid();
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into p from public.ilk_progress where journey_id = j.id and mode = 'real';
  select count(*) into total from public.ilk_stops where journey_id = j.id;
  return jsonb_build_object('status', j.status, 'plan', j.plan, 'activated_at', j.activated_at,
    'starts_at', j.starts_at, 'completed_at', j.completed_at, 'total', total,
    'position', coalesce(p.position, 0), 'started_at', p.started_at, 'finished_at', p.finished_at,
    'play_token', j.play_token);
end $$;

-- ───────────────────────── alıcı (oyun) fonksiyonları ─────────────────────────

-- p_ref: gerçek oyunda play_token; deneme modunda yolculuk id'si (sadece sahibi çağırabilir)
create or replace function public.ilk__find(p_ref text, p_test boolean)
returns public.ilk_journeys language plpgsql stable
security definer
set search_path = public, pg_temp
as $$
declare j public.ilk_journeys;
begin
  if p_test then
    begin
      select * into j from public.ilk_journeys where id = p_ref::uuid and owner_id = auth.uid() and status <> 'disabled';
    exception when invalid_text_representation then return null;
    end;
  else
    select * into j from public.ilk_journeys where play_token = p_ref;
  end if;
  return j;
end $$;

create or replace function public.ilk__progress(p_journey uuid, p_mode text)
returns public.ilk_progress language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
declare p public.ilk_progress;
begin
  insert into public.ilk_progress (journey_id, mode) values (p_journey, p_mode)
  on conflict (journey_id, mode) do nothing;
  select * into p from public.ilk_progress where journey_id = p_journey and mode = p_mode for update;
  return p;
end $$;

create or replace function public.ilk__can_skip(s public.ilk_stops, p public.ilk_progress)
returns boolean language sql stable
set search_path = public, pg_temp
as $$
  select case
    when s.unlock_type = 'tap' then false
    when s.unlock_type = 'location' then p.stop_attempts >= 2
         or (p.stop_first_try_at is not null and p.stop_first_try_at < now() - interval '90 seconds')
    else p.stop_attempts >= 3
  end
$$;

create or replace function public.ilk__state(j public.ilk_journeys, p_mode text)
returns jsonb language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
declare
  p public.ilk_progress;
  total int;
  cur public.ilk_stops;
  done jsonb;
  st text;
begin
  if j.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if j.status = 'disabled' then return jsonb_build_object('status', 'disabled'); end if;
  if p_mode = 'real' and j.status = 'draft' then return jsonb_build_object('status', 'not_found'); end if;

  if p_mode = 'real' and j.starts_at is not null and j.starts_at > now() then
    return jsonb_build_object('status', 'not_started', 'recipient_name', j.recipient_name,
      'sender_name', j.sender_name, 'starts_at', j.starts_at, 'now', now(), 'template', j.template);
  end if;

  p := public.ilk__progress(j.id, p_mode);
  if p.started_at is null then
    update public.ilk_progress set started_at = now() where journey_id = j.id and mode = p_mode;
  end if;

  select count(*) into total from public.ilk_stops where journey_id = j.id;
  if p.position > total then p.position := total; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'position', s.position, 'place_label', s.place_label, 'clue', s.clue,
           'reveal_message', s.reveal_message, 'photo_path', s.photo_path, 'audio_path', s.audio_path,
           'skipped', s.position = any(p.skipped),
           'answer', case when s.position = any(p.skipped) and s.unlock_type = 'question' then s.answers[1]
                          when s.position = any(p.skipped) and s.unlock_type = 'code' then s.code end)
           order by s.position), '[]'::jsonb)
    into done
    from public.ilk_stops s where s.journey_id = j.id and s.position <= p.position;

  st := case when total > 0 and p.position >= total then 'completed' else 'playing' end;

  if st = 'playing' then
    select * into cur from public.ilk_stops where journey_id = j.id and position = p.position + 1;
  end if;

  return jsonb_build_object(
    'status', st,
    'mode', p_mode,
    'template', j.template,
    'recipient_name', j.recipient_name,
    'sender_name', j.sender_name,
    'intro_message', j.intro_message,
    'total', total,
    'position', p.position,
    'stops', done,
    'current', case when st = 'playing' and cur.id is not null then jsonb_build_object(
        'position', cur.position,
        'clue', cur.clue,
        'unlock_type', cur.unlock_type,
        'question', case when cur.unlock_type = 'question' then cur.question end,
        'has_hint', btrim(cur.hint) <> '',
        'radius_m', case when cur.unlock_type = 'location' then cur.radius_m end,
        'attempts', p.stop_attempts,
        'can_skip', public.ilk__can_skip(cur, p),
        'first_try_at', p.stop_first_try_at) end,
    'final', case when st = 'completed' then jsonb_build_object(
        'title', j.final_title, 'message', j.final_message,
        'photo_path', j.final_photo_path, 'audio_path', j.final_audio_path) end,
    'now', now());
end $$;

create or replace function public.ilk_play_state(p_ref text, p_test boolean default false)
returns jsonb language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
begin
  return public.ilk__state(public.ilk__find(p_ref, p_test), case when p_test then 'test' else 'real' end);
end $$;

create or replace function public.ilk__advance(j public.ilk_journeys, p_mode text, p_skipped boolean)
returns void language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
declare total int; newpos int;
begin
  update public.ilk_progress
     set position = position + 1,
         stop_attempts = 0,
         stop_first_try_at = null,
         skipped = case when p_skipped then skipped || (position + 1) else skipped end
   where journey_id = j.id and mode = p_mode
   returning position into newpos;
  select count(*) into total from public.ilk_stops where journey_id = j.id;
  if newpos >= total then
    update public.ilk_progress set finished_at = coalesce(finished_at, now()) where journey_id = j.id and mode = p_mode;
    if p_mode = 'real' and j.status = 'active' then
      update public.ilk_journeys set status = 'completed', completed_at = now() where id = j.id;
    end if;
  end if;
end $$;

-- Durağı açma denemesi
create or replace function public.ilk_play_unlock(
  p_ref text, p_test boolean, p_position int,
  p_answer text default null, p_lat float8 default null, p_lng float8 default null, p_accuracy float8 default null)
returns jsonb language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
declare
  j public.ilk_journeys := public.ilk__find(p_ref, p_test);
  v_mode text := case when p_test then 'test' else 'real' end;
  p public.ilk_progress;
  s public.ilk_stops;
  ok boolean := false;
  dist float8;
  slack float8;
  base jsonb;
begin
  base := public.ilk__state(j, v_mode);
  if base ->> 'status' <> 'playing' then return jsonb_build_object('result', 'state', 'state', base); end if;
  p := public.ilk__progress(j.id, v_mode);
  if p_position is distinct from p.position + 1 then
    return jsonb_build_object('result', 'state', 'state', base);
  end if;

  -- Kaba kuvvet koruması: 10 dakikada 20 yanlış
  if p.window_start is not null and p.window_start > now() - interval '10 minutes' and p.window_wrong >= 20 then
    return jsonb_build_object('result', 'slow',
      'wait_seconds', ceil(extract(epoch from (p.window_start + interval '10 minutes' - now()))));
  end if;

  select * into s from public.ilk_stops where journey_id = j.id and position = p_position;

  if s.unlock_type = 'tap' then
    ok := true;
  elsif s.unlock_type = 'question' then
    ok := public.ilk_answer_ok(p_answer, s.answers_norm);
  elsif s.unlock_type = 'code' then
    ok := s.code_norm <> '' and replace(public.ilk_norm(p_answer), ' ', '') = s.code_norm;
  elsif s.unlock_type = 'location' then
    if p_lat is null or p_lng is null or s.lat is null then
      -- Konum alınamadı (izin yok, GPS kapalı): deneme sayılır ki alıcı "Buradayım" ile devam edebilsin
      update public.ilk_progress
         set stop_attempts = stop_attempts + 1, stop_first_try_at = coalesce(stop_first_try_at, now())
       where journey_id = j.id and mode = v_mode
       returning * into p;
      return jsonb_build_object('result', 'need_location', 'attempts', p.stop_attempts, 'can_skip', public.ilk__can_skip(s, p));
    end if;
    dist := public.ilk_distance_m(p_lat, p_lng, s.lat, s.lng);
    slack := least(greatest(coalesce(p_accuracy, 0), 0), 60);
    ok := dist <= s.radius_m + slack;
  end if;

  if ok then
    perform public.ilk__advance(j, v_mode, false);
    return jsonb_build_object('result', 'ok', 'state', public.ilk__state(public.ilk__find(p_ref, p_test), v_mode));
  end if;

  update public.ilk_progress
     set stop_attempts = stop_attempts + 1,
         stop_first_try_at = coalesce(stop_first_try_at, now()),
         window_start = case when window_start is null or window_start < now() - interval '10 minutes' then now() else window_start end,
         window_wrong = case when window_start is null or window_start < now() - interval '10 minutes' then 1 else window_wrong + 1 end
   where journey_id = j.id and mode = v_mode
   returning * into p;

  return jsonb_build_object(
    'result', case when s.unlock_type = 'location' then 'far' else 'wrong' end,
    'distance_m', case when dist is not null then round(dist) end,
    'attempts', p.stop_attempts,
    'can_skip', public.ilk__can_skip(s, p));
end $$;

-- Takılınca devam: belirli denemeden sonra izin verilir; soru/kodda doğru cevap gösterilir
create or replace function public.ilk_play_skip(p_ref text, p_test boolean, p_position int)
returns jsonb language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
declare
  j public.ilk_journeys := public.ilk__find(p_ref, p_test);
  v_mode text := case when p_test then 'test' else 'real' end;
  p public.ilk_progress; s public.ilk_stops; base jsonb;
begin
  base := public.ilk__state(j, v_mode);
  if base ->> 'status' <> 'playing' then return jsonb_build_object('result', 'state', 'state', base); end if;
  p := public.ilk__progress(j.id, v_mode);
  if p_position is distinct from p.position + 1 then return jsonb_build_object('result', 'state', 'state', base); end if;
  select * into s from public.ilk_stops where journey_id = j.id and position = p_position;
  if not public.ilk__can_skip(s, p) then return jsonb_build_object('result', 'not_yet'); end if;
  perform public.ilk__advance(j, v_mode, true);
  return jsonb_build_object('result', 'ok', 'state', public.ilk__state(public.ilk__find(p_ref, p_test), v_mode));
end $$;

create or replace function public.ilk_play_hint(p_ref text, p_test boolean, p_position int)
returns jsonb language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
declare j public.ilk_journeys := public.ilk__find(p_ref, p_test);
        v_mode text := case when p_test then 'test' else 'real' end;
        p public.ilk_progress; h text;
begin
  if j.id is null or j.status = 'disabled' or (v_mode = 'real' and j.status = 'draft') then
    return jsonb_build_object('hint', null);
  end if;
  p := public.ilk__progress(j.id, v_mode);
  if p_position is distinct from p.position + 1 then return jsonb_build_object('hint', null); end if;
  select hint into h from public.ilk_stops where journey_id = j.id and position = p_position;
  return jsonb_build_object('hint', nullif(btrim(h), ''));
end $$;

-- ───────────────────────── yönetici fonksiyonları ─────────────────────────

create or replace function public.ilk_is_admin()
returns boolean language sql stable
security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.ilk_admins where user_id = auth.uid()) $$;

create or replace function public.ilk_admin_create_codes(p_plan text, p_count int, p_note text default '')
returns setof text language plpgsql volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare i int; c text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea;
begin
  if not public.ilk_is_admin() then raise exception 'ILK_FORBIDDEN'; end if;
  if p_plan not in ('mini', 'standart', 'ozel') then raise exception 'ILK_BAD_PLAN'; end if;
  for i in 1 .. least(greatest(coalesce(p_count, 1), 1), 50) loop
    loop
      b := extensions.gen_random_bytes(8);
      c := 'ILK-' ||
           substr(alphabet, get_byte(b, 0) % 32 + 1, 1) || substr(alphabet, get_byte(b, 1) % 32 + 1, 1) ||
           substr(alphabet, get_byte(b, 2) % 32 + 1, 1) || substr(alphabet, get_byte(b, 3) % 32 + 1, 1) || '-' ||
           substr(alphabet, get_byte(b, 4) % 32 + 1, 1) || substr(alphabet, get_byte(b, 5) % 32 + 1, 1) ||
           substr(alphabet, get_byte(b, 6) % 32 + 1, 1) || substr(alphabet, get_byte(b, 7) % 32 + 1, 1);
      exit when not exists (select 1 from public.ilk_codes where code = c);
    end loop;
    insert into public.ilk_codes (code, plan, note) values (c, p_plan, left(coalesce(p_note, ''), 200));
    return next c;
  end loop;
end $$;

create or replace function public.ilk_admin_overview()
returns jsonb language plpgsql stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.ilk_is_admin() then raise exception 'ILK_FORBIDDEN'; end if;
  return jsonb_build_object(
    'codes', (select coalesce(jsonb_agg(c order by c.created_at desc), '[]'::jsonb) from (
               select code, plan, note, created_at, used_at, used_journey from public.ilk_codes
               order by created_at desc limit 300) c),
    'journeys', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
               select j.id, j.status, j.plan, j.template, j.sender_name, j.recipient_name, j.created_at,
                      j.activated_at, j.completed_at, j.starts_at, j.play_token,
                      (select count(*) from public.ilk_stops s where s.journey_id = j.id) as stops,
                      (select position from public.ilk_progress p where p.journey_id = j.id and p.mode = 'real') as real_position
                 from public.ilk_journeys j order by j.created_at desc limit 300) x),
    'errors', (select coalesce(jsonb_agg(e order by e.created_at desc), '[]'::jsonb) from (
               select created_at, page, message, agent from public.ilk_client_errors
               order by created_at desc limit 50) e));
end $$;

create or replace function public.ilk_admin_set_status(p_journey uuid, p_status text)
returns void language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.ilk_is_admin() then raise exception 'ILK_FORBIDDEN'; end if;
  if p_status not in ('disabled', 'active') then raise exception 'ILK_BAD_STATUS'; end if;
  update public.ilk_journeys set status = p_status where id = p_journey;
end $$;

-- ───────────────────────── fonksiyon yetkileri ─────────────────────────

-- Sadece ilk_ fonksiyonlarına dokunulur; projedeki diğer fonksiyonlar etkilenmez.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'ilk\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

grant execute on function public.ilk_norm(text), public.ilk_answer_ok(text, text[]),
  public.ilk_distance_m(float8, float8, float8, float8) to anon, authenticated;
grant execute on function public.ilk_play_state(text, boolean), public.ilk_play_unlock(text, boolean, int, text, float8, float8, float8),
  public.ilk_play_skip(text, boolean, int), public.ilk_play_hint(text, boolean, int) to anon, authenticated;
grant execute on function public.ilk_my_problems(uuid), public.ilk_my_status(uuid), public.ilk_activate(uuid, text), public.ilk_claim(uuid, text),
  public.ilk_reset_test(uuid), public.ilk_reorder(uuid, uuid[]), public.ilk_delete_stop(uuid),
  public.ilk_is_admin(), public.ilk_admin_create_codes(text, int, text), public.ilk_admin_overview(),
  public.ilk_admin_set_status(uuid, text) to authenticated;
-- tablo tetikleyicileri kendi yetkileriyle çalışır; varsayılan değerler için:
grant execute on function public.ilk_token(int) to authenticated;
