-- Canlı takip: alıcı sayfaya en son ne zaman baktı. Konum saklanmaz, sadece zaman.
alter table public.ilk_progress add column if not exists seen_at timestamptz;

create or replace function public.ilk_play_state(p_ref text, p_test boolean default false)
returns jsonb language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
declare j public.ilk_journeys := public.ilk__find(p_ref, p_test); v_mode text := case when p_test then 'test' else 'real' end; r jsonb;
begin
  r := public.ilk__state(j, v_mode);
  if j.id is not null then
    update public.ilk_progress set seen_at = now() where journey_id = j.id and mode = v_mode;
  end if;
  return r;
end $$;

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
    'seen_at', p.seen_at, 'skipped', coalesce(to_jsonb(p.skipped), '[]'::jsonb), 'now', now(),
    'play_token', j.play_token);
end $$;

revoke execute on function public.ilk_play_state(text, boolean) from public;
grant execute on function public.ilk_play_state(text, boolean) to anon, authenticated;
revoke execute on function public.ilk_my_status(uuid) from public, anon;
grant execute on function public.ilk_my_status(uuid) to authenticated;
