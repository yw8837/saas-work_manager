-- Deployment contract probe and safe backfill for projects that already had
-- Auth users before the application migrations were applied.

insert into public.profiles (id, display_name)
select
  users.id,
  left(
    coalesce(
      nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''),
      '일감체크 사용자'
    ),
    80
  )
from auth.users as users
on conflict (id) do nothing;

insert into public.notification_preferences (owner_id)
select profiles.id
from public.profiles as profiles
on conflict (owner_id) do nothing;

create or replace function public.get_ilgamcheck_runtime_contract()
returns text
language sql
stable
set search_path = ''
as $$
  select '202608160003'::text;
$$;

revoke all on function public.get_ilgamcheck_runtime_contract() from public;
grant execute on function public.get_ilgamcheck_runtime_contract() to anon, authenticated;
