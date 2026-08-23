-- Solo라는 내부/화면 명칭을 Basic으로 승격한다.
-- 007이 적용된 기존 프로젝트의 구독 기간과 베타 권한은 바꾸지 않는다.

-- 기존 check에는 basic이 없으므로 전환 중에는 두 이름을 함께 허용한다.
alter table public.plan_limits drop constraint if exists plan_limits_plan_check;
alter table public.plan_limits
  add constraint plan_limits_plan_check
  check (plan in ('free', 'solo', 'basic', 'pro'));

-- subscriptions.plan의 FK가 새 플랜 행을 먼저 보도록 만든다.
insert into public.plan_limits (plan, active_jobs, total_jobs, packages, options)
values ('basic', 5, null, null, null)
on conflict (plan) do update
set active_jobs = excluded.active_jobs,
    total_jobs = excluded.total_jobs,
    packages = excluded.packages,
    options = excluded.options;

update public.subscriptions
set plan = 'basic'
where plan = 'solo';

delete from public.plan_limits
where plan = 'solo';

-- 전환이 끝난 뒤에는 retired 식별자를 다시 저장하지 못하게 한다.
alter table public.plan_limits drop constraint if exists plan_limits_plan_check;
alter table public.plan_limits
  add constraint plan_limits_plan_check
  check (plan in ('free', 'basic', 'pro'));

-- Basic 한도가 적용되지 않은 DB에는 새 앱이 붙지 않게 계약도 함께 올린다.
create or replace function public.get_ilgamcheck_runtime_contract()
returns text
language sql
stable
set search_path = ''
as $$
  select '202608230008'::text;
$$;

revoke all on function public.get_ilgamcheck_runtime_contract() from public;
grant execute on function public.get_ilgamcheck_runtime_contract() to anon, authenticated, service_role;

create or replace function public.get_ilgamcheck_service_role_contract()
returns text
language sql
stable
set search_path = ''
as $$
  select '202608230008'::text;
$$;

revoke all on function public.get_ilgamcheck_service_role_contract() from public, anon, authenticated;
grant execute on function public.get_ilgamcheck_service_role_contract() to service_role;
