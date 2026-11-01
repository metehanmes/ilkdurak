-- SADECE yerel test sunucusu için: sahte Supabase auth/storage işlemlerini PostgREST üzerinden yapmayı sağlar.
create or replace function public.zz_test_create_user(p_email text, p_password text, p_anon boolean)
returns uuid language sql security definer set search_path = public, auth, pg_temp as $$
  insert into auth.users (email, encrypted_password, is_anonymous) values (p_email, p_password, p_anon) returning id
$$;
create or replace function public.zz_test_check_login(p_email text, p_password text)
returns uuid language sql security definer set search_path = public, auth, pg_temp as $$
  select id from auth.users where email = p_email and encrypted_password = p_password
$$;
create or replace function public.zz_test_user(p_id uuid)
returns jsonb language sql security definer set search_path = public, auth, pg_temp as $$
  select jsonb_build_object('id', id, 'email', email, 'is_anonymous', is_anonymous) from auth.users where id = p_id
$$;
-- Kullanıcının yetkisiyle (RLS uygulanarak) dosya kaydı ekler/siler
create or replace function public.zz_test_storage_insert(p_bucket text, p_name text)
returns boolean language plpgsql security invoker set search_path = public, storage, pg_temp as $$
begin insert into storage.objects (bucket_id, name) values (p_bucket, p_name); return true; end $$;
create or replace function public.zz_test_storage_delete(p_bucket text, p_name text)
returns boolean language plpgsql security invoker set search_path = public, storage, pg_temp as $$
declare n int; begin delete from storage.objects where bucket_id = p_bucket and name = p_name; get diagnostics n = row_count; return n > 0; end $$;
grant execute on function public.zz_test_create_user(text, text, boolean), public.zz_test_check_login(text, text),
  public.zz_test_user(uuid) to anon, authenticated;
grant execute on function public.zz_test_storage_insert(text, text), public.zz_test_storage_delete(text, text) to authenticated;
