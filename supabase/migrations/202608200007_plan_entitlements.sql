-- 서버측 플랜 한도 검증.
--
-- 지금까지 무료 한도는 브라우저에만 있었다. hosted 모드에서도 서버는 클라이언트가 준
-- JSON을 그대로 저장할 뿐이라, 개발자도구로 jobsCreatedTotal을 0으로 바꾸면 그대로 통과했다.
-- 결제를 열면 이건 곧 매출 누수다.
--
-- 원칙: 엔타이틀먼트를 작업공간 JSON에서 읽지 않는다.
-- 사용자가 고칠 수 있는 문서를 권한의 근거로 삼으면, 그 문서를 고치는 사람이 자기 권한도 고친다.
-- 권한의 근거는 service_role만 쓸 수 있는 별도 테이블이고,
-- 누적 일감 수는 클라이언트 숫자가 아니라 서버가 직접 센 원장이다.

-- ---------------------------------------------------------------------------
-- 1. 플랜 한도 (DB가 스스로 아는 값)
-- ---------------------------------------------------------------------------
-- 앱의 src/lib/domain/entitlements.ts와 값이 어긋나면 화면에서는 되는데 저장이 거부되는
-- 최악의 경험이 나온다. 두 곳을 대조하는 테스트를 앱에 둔다.
create table if not exists public.plan_limits (
  plan text primary key check (plan in ('free', 'solo', 'pro')),
  -- null = 무제한. 앱의 Infinity에 대응한다.
  active_jobs integer,
  total_jobs integer,
  packages integer,
  options integer
);

insert into public.plan_limits (plan, active_jobs, total_jobs, packages, options)
values
  ('free', 2, 10, 5, 10),
  ('solo', 5, null, null, null),
  ('pro', null, null, null, null)
on conflict (plan) do update
set active_jobs = excluded.active_jobs,
    total_jobs = excluded.total_jobs,
    packages = excluded.packages,
    options = excluded.options;

alter table public.plan_limits enable row level security;

-- 한도는 공개 정보다. 읽기만 허용하고 쓰기는 service_role 전용으로 남긴다.
drop policy if exists plan_limits_select on public.plan_limits;
create policy plan_limits_select on public.plan_limits
  for select to authenticated, anon using (true);
revoke insert, update, delete on public.plan_limits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. 구독 (권한의 유일한 근거)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  plan text not null default 'free' references public.plan_limits(plan),
  status text not null default 'active',
  -- 체험·베타도 여기서 관리한다. 클라이언트가 보낸 날짜는 믿지 않는다.
  trial_ends_at timestamptz,
  beta_ends_at timestamptz,
  current_period_end timestamptz,
  -- 빌링키 원문은 저장하지 않는다. PG가 준 참조값만 둔다.
  pg_customer_key text,
  pg_billing_key_ref text,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- 사용자는 자기 구독을 읽기만 한다. 쓰기는 서명 검증을 통과한 웹훅이 service_role로만 한다.
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select using (owner_id = auth.uid());
revoke insert, update, delete on public.subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. 일감 생성 원장 (누적 수를 서버가 센다)
-- ---------------------------------------------------------------------------
-- 삭제해도 행을 지우지 않는다. 누적 수 = count(*).
-- 이러면 클라이언트가 카운터를 조작해도 소용없고, 여러 기기 병합 문제도 사라진다.
create table if not exists public.workspace_job_ledger (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_key text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, job_key)
);

alter table public.workspace_job_ledger enable row level security;

drop policy if exists workspace_job_ledger_select_own on public.workspace_job_ledger;
create policy workspace_job_ledger_select_own on public.workspace_job_ledger
  for select using (owner_id = auth.uid());
revoke insert, update, delete on public.workspace_job_ledger from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. 현재 유효 플랜
-- ---------------------------------------------------------------------------
-- 유료 기간이 살아 있으면 그 플랜, 아니면 체험·베타가 살아 있는 동안 pro, 그 외 free.
-- security definer라 RLS를 우회한다. 남의 id를 넣어 구독 상태를 캐내지 못하도록
-- 호출 권한을 주지 않고, 정의자 체인 안에서만 쓴다.
create or replace function public.current_plan(p_owner uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
               when sub.plan <> 'free' and coalesce(sub.current_period_end, 'infinity'::timestamptz) > now()
                 then sub.plan
               when coalesce(sub.trial_ends_at, '-infinity'::timestamptz) > now()
                 or coalesce(sub.beta_ends_at, '-infinity'::timestamptz) > now()
                 then 'pro'
               else 'free'
             end
      from public.subscriptions as sub
      where sub.owner_id = p_owner
    ),
    'free'
  );
$$;

revoke all on function public.current_plan(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. 저장 전 한도 검사
-- ---------------------------------------------------------------------------
-- 누적 수는 원장에서 읽고, 이번 저장으로 새로 생기는 일감까지 더해서 본다.
-- p_state의 jobsCreatedTotal은 쳐다보지 않는다.
create or replace function public.assert_workspace_within_plan(p_owner uuid, p_state jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan text := public.current_plan(p_owner);
  v_limits public.plan_limits%rowtype;
  v_active integer;
  v_packages integer;
  v_options integer;
  v_total integer;
begin
  select * into v_limits from public.plan_limits where plan = v_plan;
  -- 한도 행이 없으면 조용히 통과시키지 않는다. 그러면 마이그레이션이 반쯤 적용된 DB에서
  -- 아무 경고 없이 검증이 통째로 꺼진 채 운영된다.
  if not found then
    raise exception using errcode = '42501', message = 'plan_limits_missing';
  end if;

  if v_limits.active_jobs is not null then
    select count(*)::integer into v_active
    from jsonb_array_elements(p_state -> 'jobs') as job
    where job ->> 'status' = 'active';

    if v_active > v_limits.active_jobs then
      raise exception using errcode = '42501', message = 'plan_active_jobs_exceeded';
    end if;
  end if;

  if v_limits.total_jobs is not null then
    -- 누적 = 원장 행 수
    --      + 지금까지 기록된 재사용(은퇴한 id를 새 일감에 다시 붙인 횟수)
    --      + 이번 저장에서 처음 등장하는 id
    --      + 이번 저장에서 은퇴 상태로 다시 등장하는 id
    -- 마지막 항이 없으면 id를 돌려 쓰는 것만으로 한도가 무한히 열린다.
    select
      (select count(*)::integer from public.workspace_job_ledger as ledger
        where ledger.owner_id = p_owner)
      + coalesce((select recreations.count from public.workspace_job_recreations as recreations
        where recreations.owner_id = p_owner), 0)
      + (select count(*)::integer
         from jsonb_array_elements(p_state -> 'jobs') as job
         where coalesce(job ->> 'id', '') <> ''
           and not exists (
             select 1 from public.workspace_job_ledger as ledger
             where ledger.owner_id = p_owner and ledger.job_key = job ->> 'id'))
      + (select count(*)::integer
         from jsonb_array_elements(p_state -> 'jobs') as job
         where exists (
           select 1 from public.workspace_job_ledger as ledger
           where ledger.owner_id = p_owner
             and ledger.job_key = job ->> 'id'
             and ledger.retired_at is not null))
    into v_total;

    if v_total > v_limits.total_jobs then
      raise exception using errcode = '42501', message = 'plan_total_jobs_exceeded';
    end if;
  end if;

  if v_limits.packages is not null then
    select count(*)::integer into v_packages
    from jsonb_array_elements(p_state -> 'packages') as item
    where item ->> 'archivedAt' is null;

    if v_packages > v_limits.packages then
      raise exception using errcode = '42501', message = 'plan_packages_exceeded';
    end if;
  end if;

  if v_limits.options is not null then
    select count(*)::integer into v_options
    from jsonb_array_elements(p_state -> 'options') as item
    where item ->> 'archivedAt' is null;

    if v_options > v_limits.options then
      raise exception using errcode = '42501', message = 'plan_options_exceeded';
    end if;
  end if;
end;
$$;

revoke all on function public.assert_workspace_within_plan(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. 원장 기록
-- ---------------------------------------------------------------------------
create or replace function public.record_workspace_jobs(p_owner uuid, p_state jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.workspace_job_ledger (owner_id, job_key)
  select p_owner, job ->> 'id'
  from jsonb_array_elements(p_state -> 'jobs') as job
  where coalesce(job ->> 'id', '') <> ''
  on conflict (owner_id, job_key) do nothing;
$$;

revoke all on function public.record_workspace_jobs(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. 저장 경로에 연결
-- ---------------------------------------------------------------------------
-- 202608150002의 원본을 고치지 않고, 같은 이름으로 다시 정의해 한도 검사만 끼워 넣는다.
create or replace function public.save_workspace_document(
  p_state jsonb,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns table(document_version bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_hash text;
  v_existing public.workspace_save_requests%rowtype;
  v_document public.workspace_documents%rowtype;
  v_now timestamptz := clock_timestamp();
  v_next_version bigint;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency_key_required';
  end if;

  perform public.validate_workspace_state(p_state);
  v_hash := encode(extensions.digest(p_state::text, 'sha256'), 'hex');

  perform 1
  from public.profiles as profile
  where profile.id = v_owner
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'profile_not_found';
  end if;

  select request.* into v_existing
  from public.workspace_save_requests as request
  where request.owner_id = v_owner and request.idempotency_key = p_idempotency_key;

  if found then
    -- 0002와 같은 코드·메시지를 유지한다. 재정의가 계약을 바꾸면 안 된다.
    if v_existing.request_hash <> v_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return query select v_existing.result_version, v_existing.created_at;
    return;
  end if;

  -- 프로필 잠금 뒤에 본다. 동시 저장이 한도를 나눠 넘기지 못한다.
  perform public.assert_workspace_within_plan(v_owner, p_state);

  select document.* into v_document
  from public.workspace_documents as document
  where document.owner_id = v_owner
  for update;

  if not found then
    if coalesce(p_expected_version, 0) <> 0 then
      raise exception using errcode = '40001', message = 'workspace_conflict';
    end if;
    v_next_version := 1;
    insert into public.workspace_documents (owner_id, state, document_version, created_at, updated_at)
    values (v_owner, p_state, v_next_version, v_now, v_now);
  else
    if p_expected_version is distinct from v_document.document_version then
      raise exception using errcode = '40001', message = 'workspace_conflict';
    end if;
    v_next_version := v_document.document_version + 1;
    update public.workspace_documents as document
    set state = p_state, document_version = v_next_version, updated_at = v_now
    where document.owner_id = v_owner;
  end if;

  -- 저장에 성공한 일감만 원장에 남긴다. 지워도 행은 남아 누적 수가 되돌아가지 않는다.
  perform public.record_workspace_jobs(v_owner, p_state);

  insert into public.workspace_save_requests (
    owner_id, idempotency_key, request_hash, result_version, created_at
  ) values (
    v_owner, p_idempotency_key, v_hash, v_next_version, v_now
  );

  return query select v_next_version, v_now;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. 초대 코드 (클라이언트 번들에서 서버로)
-- ---------------------------------------------------------------------------
create table if not exists public.invite_codes (
  code text primary key,
  grant_days integer not null default 30 check (grant_days between 1 and 365),
  max_redemptions integer not null default 1 check (max_redemptions >= 1),
  redeemed_count integer not null default 0,
  expires_at timestamptz
);

-- 베타 모집용 코드. 코드 자체는 비밀이 아니고(초대장에 적어 보낸다),
-- 한 사람이 한 번만 쓴다는 것과 기간 30일이 서버에서 강제된다는 게 핵심이다.
-- 유료 전환 뒤에는 max_redemptions를 0으로 내리거나 expires_at을 지나게 해서 닫는다.
insert into public.invite_codes (code, grant_days, max_redemptions, expires_at)
values
  ('KMONG2026', 30, 500, null),
  ('SOOMGO2026', 30, 500, null),
  ('BETA2026', 30, 500, null)
on conflict (code) do nothing;

create table if not exists public.invite_redemptions (
  code text not null references public.invite_codes(code) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  -- 같은 사람이 같은 코드를 두 번 쓰지 못한다.
  primary key (code, owner_id)
);

alter table public.invite_codes enable row level security;
alter table public.invite_redemptions enable row level security;

-- 코드 목록 자체는 비공개다. 조회 정책을 두지 않아 아무도 읽지 못한다.
revoke all on public.invite_codes from anon, authenticated;

drop policy if exists invite_redemptions_select_own on public.invite_redemptions;
create policy invite_redemptions_select_own on public.invite_redemptions
  for select using (owner_id = auth.uid());
revoke insert, update, delete on public.invite_redemptions from anon, authenticated;

-- 코드 입력 시도 기록. 짧은 코드를 초당 수십 번 찔러보는 걸 막는다.
-- 다른 공개 RPC(submit_workspace_revision_request)와 같은 방식으로 맞춘다.
create table if not exists public.invite_attempts (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  succeeded boolean not null default false
);

create index if not exists invite_attempts_owner_time
  on public.invite_attempts (owner_id, attempted_at desc);

alter table public.invite_attempts enable row level security;
revoke all on public.invite_attempts from anon, authenticated;

-- 반환 타입이 바뀌면 create or replace가 거부한다. 재적용이 가능하도록 먼저 지운다.
drop function if exists public.redeem_invite_code(text);

-- 사용자 입력 오류는 예외로 던지지 않고 상태로 돌려준다.
-- 예외를 던지면 같은 트랜잭션의 시도 기록까지 롤백돼 횟수 제한이 아예 작동하지 않는다.
-- 인증 문제만 예외다 — 그건 애초에 기록할 사용자가 없다.
create or replace function public.redeem_invite_code(p_code text)
returns table(status text, ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_code public.invite_codes%rowtype;
  v_ends_at timestamptz;
  v_recent integer;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  -- 같은 사용자 행을 잠가 동시 시도가 한도를 나눠 넘기지 못하게 한다.
  perform 1 from public.profiles as profile where profile.id = v_owner for update;
  if not found then
    raise exception using errcode = '42501', message = 'profile_not_found';
  end if;

  select count(*)::integer into v_recent
  from public.invite_attempts
  where owner_id = v_owner
    and not succeeded
    and attempted_at > now() - interval '1 hour';

  if v_recent >= 10 then
    return query select 'rate_limited'::text, null::timestamptz;
    return;
  end if;

  select * into v_code
  from public.invite_codes
  where code = upper(btrim(coalesce(p_code, '')))
  for update;

  if not found
    or (v_code.expires_at is not null and v_code.expires_at <= now())
    or v_code.redeemed_count >= v_code.max_redemptions then
    -- 실패도 남아야 다음 시도부터 한도가 줄어든다.
    insert into public.invite_attempts (owner_id, succeeded) values (v_owner, false);
    return query select 'invalid'::text, null::timestamptz;
    return;
  end if;

  if exists (
    select 1 from public.invite_redemptions
    where code = v_code.code and owner_id = v_owner
  ) then
    -- 이미 쓴 코드를 다시 넣는 건 오타가 아니라 연장 시도다. 횟수 제한에 넣지 않는다.
    return query select 'already_redeemed'::text, null::timestamptz;
    return;
  end if;

  insert into public.invite_attempts (owner_id, succeeded) values (v_owner, true);
  insert into public.invite_redemptions (code, owner_id) values (v_code.code, v_owner);
  update public.invite_codes
  set redeemed_count = redeemed_count + 1
  where code = v_code.code;

  v_ends_at := now() + make_interval(days => v_code.grant_days);

  insert into public.subscriptions (owner_id, beta_ends_at, updated_at)
  values (v_owner, v_ends_at, now())
  on conflict (owner_id) do update
  -- 이미 더 긴 권한이 있으면 줄이지 않는다.
  set beta_ends_at = greatest(coalesce(public.subscriptions.beta_ends_at, '-infinity'::timestamptz), v_ends_at),
      updated_at = now();

  return query select 'ok'::text, v_ends_at;
end;
$$;

revoke all on function public.redeem_invite_code(text) from public, anon;
grant execute on function public.redeem_invite_code(text) to authenticated;

-- 런타임 계약 버전을 올린다.
-- 이 마이그레이션이 적용되지 않은 프로젝트로는 배포가 막혀야 한다.
-- 서버 한도 검사 없이 앱이 붙으면 요금제가 사실상 없는 것과 같기 때문이다.
create or replace function public.get_ilgamcheck_runtime_contract()
returns text
language sql
stable
set search_path = ''
as $$
  select '202608200007'::text;
$$;

revoke all on function public.get_ilgamcheck_runtime_contract() from public;
grant execute on function public.get_ilgamcheck_runtime_contract() to anon, authenticated, service_role;

-- service_role 계약도 같이 올린다.
-- 런타임 계약만 올리면 /api/health가 두 값을 같은 상수와 비교하다 어긋나서
-- 정상 배포에 503을 준다.
create or replace function public.get_ilgamcheck_service_role_contract()
returns text
language sql
stable
set search_path = ''
as $$
  select '202608200007'::text;
$$;

revoke all on function public.get_ilgamcheck_service_role_contract() from public, anon, authenticated;
grant execute on function public.get_ilgamcheck_service_role_contract() to service_role;

-- ---------------------------------------------------------------------------
-- 9. 일감 ID 재사용 차단
-- ---------------------------------------------------------------------------
-- 원장 키(job id)는 브라우저가 만든다. 일감을 지운 뒤 그 id를 새 일감에 다시 붙이면
-- 원장 행 수가 늘지 않아 누적 한도가 무한히 열린다.
-- 저장 상태에서 사라진 id는 "은퇴"로 표시하고, 은퇴한 id가 다시 나타나면 새로 만든 것으로 센다.
alter table public.workspace_job_ledger add column if not exists retired_at timestamptz;

create table if not exists public.workspace_job_recreations (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.workspace_job_recreations enable row level security;
drop policy if exists workspace_job_recreations_select on public.workspace_job_recreations;
create policy workspace_job_recreations_select on public.workspace_job_recreations
  for select to authenticated using (owner_id = auth.uid());
revoke all on table public.workspace_job_recreations from anon;
revoke insert, update, delete on table public.workspace_job_recreations from authenticated;

create or replace function public.record_workspace_jobs(p_owner uuid, p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids text[];
  v_resurrected integer;
begin
  select coalesce(array_agg(job ->> 'id'), '{}')
  into v_ids
  from jsonb_array_elements(p_state -> 'jobs') as job
  where coalesce(job ->> 'id', '') <> '';

  -- 은퇴한 id가 다시 등장하면 그건 되살린 게 아니라 새로 만든 것이다.
  select count(*)::integer into v_resurrected
  from public.workspace_job_ledger as ledger
  where ledger.owner_id = p_owner
    and ledger.retired_at is not null
    and ledger.job_key = any (v_ids);

  if v_resurrected > 0 then
    insert into public.workspace_job_recreations (owner_id, count, updated_at)
    values (p_owner, v_resurrected, now())
    on conflict (owner_id) do update
      set count = public.workspace_job_recreations.count + excluded.count,
          updated_at = now();
  end if;

  update public.workspace_job_ledger as ledger
  set retired_at = null
  where ledger.owner_id = p_owner
    and ledger.retired_at is not null
    and ledger.job_key = any (v_ids);

  insert into public.workspace_job_ledger (owner_id, job_key)
  select p_owner, unnest(v_ids)
  on conflict (owner_id, job_key) do nothing;

  -- 이번 저장에서 사라진 id는 은퇴시킨다. 행은 지우지 않는다.
  update public.workspace_job_ledger as ledger
  set retired_at = now()
  where ledger.owner_id = p_owner
    and ledger.retired_at is null
    and not (ledger.job_key = any (v_ids));
end;
$$;

revoke all on function public.record_workspace_jobs(uuid, jsonb) from public, anon, authenticated;
