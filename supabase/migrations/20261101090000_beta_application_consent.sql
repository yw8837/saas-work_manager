-- 베타 신청·광고성 정보 수신 동의·수신거부·처리결과 통지 기록.
-- 기준: 스테이션/과제/2-MVP/범위-신청동의수신거부-2026-11-01.md
-- 앱은 기록·판정·기한 관리·메일 초안까지만 한다. 메일은 보내지 않는다(발송은 운영자가 Gmail로 직접).
--
-- 보안 경계
-- - 표는 anon·authenticated가 직접 읽고 쓰지 못한다(Supabase 기본 ACL이 준 권한까지 명시적으로 뺀다).
-- - 로그인 없는 화면은 공개 RPC 3개(신청·주소 확인·수신거부)만 쓴다. security definer, 빈 search_path, 입력 검증, 호출 제한.
-- - 운영자 RPC는 authenticated에만 열고, 함수 안에서 beta_operator_accounts에 등록된 계정인지 다시 확인한다.
--   저장소에는 운영자 계정을 넣지 않는다. 등록은 배포 때 사용자가 한다(비어 있으면 아무도 운영자가 아니다).
-- - 확인·수신거부 토큰은 해시로만 비교한다. 운영자가 메일에 붙일 원본 링크는 beta_application_links에만 두고
--   운영자 RPC로만 읽는다. 신청 RPC는 토큰을 돌려주지 않는다(남의 주소로 신청한 사람이 스스로 확인하지 못하게).
--
-- 잠금 순서 규칙(교착 방지). 같은 이메일을 다루는 모든 쓰기 경로는 아래 순서만 따른다.
--   1) 이메일 잠금 ilgam_private.beta_lock_email(해시)  — 한 주소만 잠그거나, 여러 주소면 해시 오름차순(보유기간 정리)
--   2) 호출 제한 카운터(beta_public_call_counters)의 UPSERT  — beta_take_call
--   3) 신청·통지·삭제 기록 등 행 잠금·행 삭제(for update, insert, delete)
-- 무효 토큰은 1) 전에 끝나며 카운터도 쓰지 않는다(토큰 조회는 읽기만).
-- 오래된 카운터 행 정리(DELETE)는 공개 RPC에서 하지 않는다. 운영자 카운터 정리(beta_ops_prune_call_counters)가
-- 신청 정리와 따로(별도 트랜잭션, 이메일 잠금 없이) 2일 지난 시간 창만 한 번에 5,000행까지 지운다.
-- 공개 RPC는 현재 시간 창 행만 건드리므로 같은 행을 두고 다투지 않는다.

-- 운영자 계정. 비어 있으면 운영자 화면은 "운영자 계정이 아닙니다"만 보인다.
create table public.beta_operator_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 신청 정보(폼 응답). 이름·전화·업체명·IP는 받지 않는다.
create table public.beta_applications (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 6 and 254 and email = lower(btrim(email))),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  work_type text not null check (work_type in ('web', 'design', 'other')),
  sells_packages boolean not null,
  concurrent_jobs text not null check (concurrent_jobs in ('0', '1', '2-3', '4+')),
  order_channels text[] not null default '{}'
    check (order_channels <@ array['kmong', 'referral', 'own_site', 'other']::text[]),
  participation text not null check (participation in ('interview', 'beta', 'both')),
  -- 적격: 패키지 판매 = 예 그리고 동시 진행 2~3건 또는 4건 이상. 하는 일은 판정에 쓰지 않는다.
  eligible boolean not null,
  copy_version text not null,
  privacy_consented_at timestamptz not null,
  ad_checked boolean not null,
  created_at timestamptz not null default now(),
  confirm_token_hash text not null unique check (confirm_token_hash ~ '^[0-9a-f]{64}$'),
  confirm_expires_at timestamptz not null,
  email_confirmed_at timestamptz,
  -- 운영자가 결과 안내를 보낸 뒤 기록한다. 보유기간 계산의 기준이다.
  outcome text check (outcome in ('not_matched', 'not_selected', 'interview', 'beta')),
  result_sent_at timestamptz,
  interview_done_at timestamptz,
  beta_ended_at timestamptz,
  purge_after timestamptz
);
create index beta_applications_email_hash_idx on public.beta_applications (email_hash, created_at);
create index beta_applications_purge_after_idx on public.beta_applications (purge_after) where purge_after is not null;

-- 운영자가 메일에 붙일 원본 링크 토큰. 신청 정보와 함께 지워진다.
create table public.beta_application_links (
  application_id uuid primary key references public.beta_applications(id) on delete cascade,
  confirm_token text not null,
  unsubscribe_token text not null
);

-- 수신거부 토큰 해시 → 이메일 해시. 신청 정보가 지워진 뒤에도 이미 보낸 메일의 수신거부 링크가 동작하도록
-- 주소 원문 없이 해시만 남긴다.
create table public.beta_unsubscribe_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

-- 광고 수신 의사표시 이력(동의·거부·철회). 지우지 않고 쌓는다. 상태는 이 이력으로 계산한다.
-- 의사표시 1건마다 처리결과 통지 1건: 화면 표시 시각, 이메일 통지 보낸 시각(운영자 표시), 마감(+14일).
create table public.beta_ad_consent_events (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('consent', 'refuse', 'withdraw')),
  source text not null check (source in ('apply_form', 'unsubscribe_link', 'deletion_request')),
  item text not null default '광고성 정보 수신(이메일)',
  copy_version text,
  application_id uuid references public.beta_applications(id) on delete set null,
  occurred_at timestamptz not null,
  -- 주소 주인이 확인 버튼을 누른 시각. 이 값이 없으면 동의는 광고 발송 대상이 아니다.
  confirmed_at timestamptz,
  notice_shown_at timestamptz,
  notice_due_at timestamptz not null,
  notice_emailed_at timestamptz,
  -- 의사표시 때 그 주소가 이미 정리돼(신청 정보·삭제 안내용 주소 모두 없음) 이메일로 통지할 수 없었던 건.
  -- 화면 통지(notice_shown_at)만 했다는 뜻이다. 주소를 새로 남기지는 않는다.
  notice_email_unavailable boolean not null default false,
  check (kind = 'consent' or confirmed_at is null)
);
create index beta_ad_consent_events_email_hash_idx on public.beta_ad_consent_events (email_hash, occurred_at);

-- 발송금지 목록. 이메일 해시만 남긴다. 보관 기한은 미정(G05)이라 정하지 않는다.
create table public.beta_ad_suppressions (
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason in ('withdraw', 'refuse', 'deletion_request')),
  created_at timestamptz not null default now()
);

-- 이번 모집에서 광고를 보내지 않을 주소: 미충족·미선정으로 결과를 안내한 주소(D1 결정 전 기본 동작).
-- 신청 정보를 보유기간에 맞춰 정리해도 이 근거는 남아야 하므로 신청 표와 떼어 이메일 해시만 남긴다.
-- 보관 기한은 D1·G05 결정 전이라 정하지 않는다.
create table public.beta_ad_exclusions (
  cohort text not null,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason in ('not_matched', 'not_selected')),
  created_at timestamptz not null default now(),
  primary key (cohort, email_hash)
);

-- 삭제 요청 처리 기록. 신청 정보는 요청을 처리할 때 바로 지운다.
-- 다만 그 주소로 보내야 할 처리결과 통지·삭제 결과 안내가 남아 있으므로, 안내를 보냈다고 표시할 때까지만
-- 주소(email)를 이 표에 남기고, 표시하는 순간 지운다(email = null). 해시와 시각만 기록으로 남는다.
create table public.beta_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  email text check (email is null or (char_length(email) between 6 and 254 and email = lower(btrim(email)))),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  requested_at timestamptz not null,
  deleted_count integer not null,
  result_emailed_at timestamptz,
  check ((result_emailed_at is null) = (email is not null))
);
create index beta_deletion_requests_email_hash_idx on public.beta_deletion_requests (email_hash);

-- 공개 RPC 호출 제한 카운터(시간 창 단위).
create table public.beta_public_call_counters (
  bucket text not null,
  window_start timestamptz not null,
  calls integer not null default 0,
  primary key (bucket, window_start)
);
create index beta_public_call_counters_window_idx on public.beta_public_call_counters (window_start);

alter table public.beta_operator_accounts enable row level security;
alter table public.beta_applications enable row level security;
alter table public.beta_application_links enable row level security;
alter table public.beta_unsubscribe_tokens enable row level security;
alter table public.beta_ad_consent_events enable row level security;
alter table public.beta_ad_suppressions enable row level security;
alter table public.beta_ad_exclusions enable row level security;
alter table public.beta_deletion_requests enable row level security;
alter table public.beta_public_call_counters enable row level security;

revoke all on table
  public.beta_operator_accounts,
  public.beta_applications,
  public.beta_application_links,
  public.beta_unsubscribe_tokens,
  public.beta_ad_consent_events,
  public.beta_ad_suppressions,
  public.beta_ad_exclusions,
  public.beta_deletion_requests,
  public.beta_public_call_counters
from public, anon, authenticated;

-- ── 내부 도우미(클라이언트가 직접 부르지 못한다) ─────────────────────────────

create function ilgam_private.beta_email_hash(p_email text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(extensions.digest('ilgamcheck-beta-ad:' || lower(btrim(p_email)), 'sha256'), 'hex');
$$;

create function ilgam_private.beta_token_hash(p_token text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- 43자 base64url 토큰(256비트).
create function ilgam_private.beta_new_token()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
$$;

-- 호출 1회를 세고, 한도 안이면 true. 한도를 넘은 호출도 센다.
create function ilgam_private.beta_take_call(p_bucket text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  v_calls integer;
begin
  -- 오래된 시간 창 정리는 여기서 하지 않는다(운영자 정리 함수가 한다). 공개 요청끼리 다른 행을 두고 다투지 않게.
  insert into public.beta_public_call_counters as counter (bucket, window_start, calls)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set calls = counter.calls + 1
  returning counter.calls into v_calls;
  return v_calls <= p_limit;
end;
$$;

-- 현재 시간 창의 호출 수를 읽기만 한다(행을 만들지 않는다).
create function ilgam_private.beta_peek_calls(p_bucket text, p_window_seconds integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select counter.calls from public.beta_public_call_counters as counter
    where counter.bucket = p_bucket
      and counter.window_start = to_timestamp(
        floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
      )
  ), 0);
$$;

-- 같은 이메일(해시)을 다루는 쓰기는 모두 이 잠금 하나로 줄 세운다:
-- 신청, 주소 확인, 수신거부(주소 확인·통지 생성), 삭제 요청, 삭제 결과 안내 완료(마지막 주소 삭제), 보유기간 정리.
-- 잠금 순서 규칙: 행 잠금(for update)이나 행 삭제보다 먼저 잡는다. 여러 주소를 잠그는 경로(정리)는 해시 오름차순으로 잡는다.
-- 그 밖의 경로는 한 주소만 잠그므로 잠금끼리 서로 기다리는 고리가 생기지 않는다.
create function ilgam_private.beta_lock_email(p_email_hash text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtext('beta-email:' || p_email_hash));
$$;

-- 지금 받는 모집. 모집을 새로 열면 새 migration에서 이 값을 바꾼다(광고 제외는 모집 단위).
create function ilgam_private.beta_current_cohort()
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select 'beta-2026-1'::text;
$$;

-- 이메일(해시) 하나의 광고 동의 상태.
-- 마지막 거부·철회 뒤에 확인된 동의가 있으면 active, 확인 전 동의만 있으면 pending,
-- 거부·철회만 남았으면 withdrawn, 아무 의사표시도 없으면 none.
-- 체크하지 않고 다시 신청한 것은 의사표시가 아니므로 이전 상태가 그대로 유지된다.
create function ilgam_private.beta_ad_status(p_email_hash text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with negative as (
    select max(event.occurred_at) as at
    from public.beta_ad_consent_events as event
    where event.email_hash = p_email_hash and event.kind in ('refuse', 'withdraw')
  ),
  positive as (
    select count(*) as consents, coalesce(bool_or(event.confirmed_at is not null), false) as confirmed
    from public.beta_ad_consent_events as event, negative
    where event.email_hash = p_email_hash
      and event.kind = 'consent'
      and (negative.at is null or event.occurred_at > negative.at)
  )
  select case
    when positive.consents > 0 and positive.confirmed then 'active'
    when positive.consents > 0 then 'pending'
    when negative.at is not null then 'withdrawn'
    else 'none'
  end
  from negative, positive;
$$;

create function ilgam_private.beta_require_operator()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.beta_operator_accounts as account where account.user_id = auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'not_operator';
  end if;
end;
$$;

revoke all on function
  ilgam_private.beta_email_hash(text),
  ilgam_private.beta_token_hash(text),
  ilgam_private.beta_new_token(),
  ilgam_private.beta_take_call(text, integer, integer),
  ilgam_private.beta_peek_calls(text, integer),
  ilgam_private.beta_lock_email(text),
  ilgam_private.beta_current_cohort(),
  ilgam_private.beta_ad_status(text),
  ilgam_private.beta_require_operator()
from public, anon, authenticated;

-- ── 공개 RPC: 신청 ────────────────────────────────────────────────────────

create function public.submit_beta_application(
  p_email text,
  p_work_type text,
  p_sells_packages boolean,
  p_concurrent_jobs text,
  p_order_channels text[],
  p_participation text,
  p_privacy_consent boolean,
  p_ad_consent boolean,
  p_copy_version text
)
returns table(
  status text,
  ad_event_kind text,
  ad_event_at timestamptz,
  ad_notice_due_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash text;
  v_channels text[];
  v_now timestamptz := clock_timestamp();
  v_application_id uuid;
  v_confirm text := ilgam_private.beta_new_token();
  v_unsubscribe text := ilgam_private.beta_new_token();
begin
  if p_privacy_consent is distinct from true then
    raise exception using errcode = '22023', message = 'privacy_consent_required';
  end if;

  select coalesce(array_agg(distinct channel order by channel), '{}'::text[]) into v_channels
  from unnest(coalesce(p_order_channels, '{}'::text[])) as channel;

  if char_length(v_email) not between 6 and 254
    or v_email !~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'
    or p_work_type is null or p_work_type not in ('web', 'design', 'other')
    or p_sells_packages is null
    or p_concurrent_jobs is null or p_concurrent_jobs not in ('0', '1', '2-3', '4+')
    or p_participation is null or p_participation not in ('interview', 'beta', 'both')
    or not (v_channels <@ array['kmong', 'referral', 'own_site', 'other']::text[])
    or p_ad_consent is null
    -- 화면에 보여 준 동의 문구 판본만 받는다. 문구를 바꾸면 새 판본을 여기에 더한다.
    or p_copy_version is null or p_copy_version not in ('beta-apply-v1-2026-11-01') then
    raise exception using errcode = '22023', message = 'invalid_beta_application';
  end if;

  v_hash := ilgam_private.beta_email_hash(v_email);

  -- 호출 제한(같은 주소 시간당 3건·하루 5건, 전체 시간당 300건).
  -- 1) 같은 주소 요청을 줄 세운 뒤 주소별 사용량을 읽기만 한다. 걸리면 아무것도 쓰지 않고 거절한다
  --    (주소별 한도에 걸린 반복 신청이 전체 예산을 쓰지 않게).
  -- 2) 전체 예산을 확보한다. 모자라면 거절하고, 이때도 주소별 행은 만들지 않는다
  --    (전체 한도가 찬 뒤 주소를 바꿔 가며 보내도 카운터 행이 늘지 않게. 전체 행은 시간 창마다 1개뿐).
  -- 3) 둘 다 통과했을 때만 주소별 카운터를 센다. 모두 이 트랜잭션 안에서 일어나 함께 커밋된다.
  perform ilgam_private.beta_lock_email(v_hash);
  if ilgam_private.beta_peek_calls('apply:' || v_hash || ':hour', 3600) >= 3
    or ilgam_private.beta_peek_calls('apply:' || v_hash || ':day', 86400) >= 5 then
    return query select 'rate_limited'::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  if not ilgam_private.beta_take_call('apply:all:hour', 3600, 300) then
    return query select 'rate_limited'::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  perform ilgam_private.beta_take_call('apply:' || v_hash || ':hour', 3600, 3);
  perform ilgam_private.beta_take_call('apply:' || v_hash || ':day', 86400, 5);

  insert into public.beta_applications (
    email, email_hash, work_type, sells_packages, concurrent_jobs, order_channels, participation,
    eligible, copy_version, privacy_consented_at, ad_checked, created_at,
    confirm_token_hash, confirm_expires_at
  ) values (
    v_email, v_hash, p_work_type, p_sells_packages, p_concurrent_jobs, v_channels, p_participation,
    p_sells_packages and p_concurrent_jobs in ('2-3', '4+'), p_copy_version, v_now, p_ad_consent, v_now,
    ilgam_private.beta_token_hash(v_confirm), v_now + interval '30 days'
  )
  returning id into v_application_id;

  insert into public.beta_application_links (application_id, confirm_token, unsubscribe_token)
  values (v_application_id, v_confirm, v_unsubscribe);
  insert into public.beta_unsubscribe_tokens (token_hash, email_hash)
  values (ilgam_private.beta_token_hash(v_unsubscribe), v_hash);

  if p_ad_consent then
    -- 체크했을 때만 의사표시(동의)로 기록한다. 확인 전이라 광고 발송 대상은 아니다.
    insert into public.beta_ad_consent_events (
      email_hash, kind, source, copy_version, application_id, occurred_at, notice_shown_at, notice_due_at
    ) values (
      v_hash, 'consent', 'apply_form', p_copy_version, v_application_id, v_now, v_now, v_now + interval '14 days'
    );
    return query select 'received'::text, 'consent'::text, v_now, v_now + interval '14 days';
    return;
  end if;

  -- 체크하지 않은 것은 철회로 보지 않는다. 이전 상태를 드러내지 않도록 아무 상태도 돌려주지 않는다.
  return query select 'received'::text, null::text, null::timestamptz, null::timestamptz;
end;
$$;

-- ── 공개 RPC: 주소 확인(버튼을 눌렀을 때만 부른다) ───────────────────────────

create function public.confirm_beta_email(p_token text)
returns table(status text, ad_active boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_application public.beta_applications%rowtype;
  v_now timestamptz := clock_timestamp();
  v_negative_at timestamptz;
  v_activated integer;
begin
  if coalesce(char_length(p_token), 0) not between 43 and 128 or p_token !~ '^[A-Za-z0-9_-]+$' then
    return query select 'invalid'::text, false;
    return;
  end if;
  -- 무효 토큰은 아무것도 쓰지 않고 돌려보낸다. 호출 제한은 실제로 있는 링크마다 따로 센다
  -- (형식만 맞는 무효 토큰을 많이 보내도 다른 사람의 정상 확인이 막히지 않게).
  select application.* into v_application
  from public.beta_applications as application
  where application.confirm_token_hash = ilgam_private.beta_token_hash(p_token);
  if not found then
    return query select 'invalid'::text, false;
    return;
  end if;
  -- 잠금 순서: 이메일 잠금 → 카운터 → 행 잠금.
  perform ilgam_private.beta_lock_email(v_application.email_hash);
  if not ilgam_private.beta_take_call('confirm:' || v_application.confirm_token_hash || ':minute', 60, 10) then
    return query select 'rate_limited'::text, false;
    return;
  end if;
  select application.* into v_application
  from public.beta_applications as application
  where application.id = v_application.id
  for update;
  if not found then
    return query select 'invalid'::text, false;
    return;
  end if;

  if v_application.email_confirmed_at is null then
    if v_now > v_application.confirm_expires_at then
      return query select 'expired'::text, false;
      return;
    end if;
    update public.beta_applications set email_confirmed_at = v_now where id = v_application.id;

    select max(event.occurred_at) into v_negative_at
    from public.beta_ad_consent_events as event
    where event.email_hash = v_application.email_hash and event.kind in ('refuse', 'withdraw');

    -- 이 신청에서 남긴 동의가 마지막 거부·철회보다 뒤일 때만 유효해진다.
    -- 철회 뒤에 옛 확인 링크를 눌러도 동의가 되살아나지 않는다.
    update public.beta_ad_consent_events as event
    set confirmed_at = v_now
    where event.application_id = v_application.id
      and event.kind = 'consent'
      and event.confirmed_at is null
      and (v_negative_at is null or event.occurred_at > v_negative_at);
    get diagnostics v_activated = row_count;
    if v_activated > 0 then
      -- 철회 뒤 명시적으로 다시 동의하고 주소까지 확인했으므로 발송금지에서 뺀다. 이력은 남는다.
      delete from public.beta_ad_suppressions where email_hash = v_application.email_hash;
    end if;
    return query select 'confirmed'::text,
      exists (
        select 1 from public.beta_ad_consent_events as event
        where event.application_id = v_application.id and event.kind = 'consent'
          and event.confirmed_at is not null
          and (v_negative_at is null or event.occurred_at > v_negative_at)
      );
    return;
  end if;

  select max(event.occurred_at) into v_negative_at
  from public.beta_ad_consent_events as event
  where event.email_hash = v_application.email_hash and event.kind in ('refuse', 'withdraw');
  return query select 'already_confirmed'::text,
    exists (
      select 1 from public.beta_ad_consent_events as event
      where event.application_id = v_application.id and event.kind = 'consent'
        and event.confirmed_at is not null
        and (v_negative_at is null or event.occurred_at > v_negative_at)
    );
end;
$$;

-- ── 공개 RPC: 수신거부(버튼을 눌렀을 때만 부른다) ────────────────────────────

create function public.unsubscribe_beta_ads(p_token text)
returns table(status text, event_kind text, event_at timestamptz, notice_state text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email_hash text;
  v_status text;
  v_now timestamptz := clock_timestamp();
  v_kind text;
  v_last record;
  v_has_address boolean;
begin
  if coalesce(char_length(p_token), 0) not between 43 and 128 or p_token !~ '^[A-Za-z0-9_-]+$' then
    return query select 'invalid'::text, null::text, null::timestamptz, null::text;
    return;
  end if;
  -- 무효 토큰은 아무것도 쓰지 않고 돌려보낸다. 호출 제한은 실제로 있는 링크마다 따로 센다.
  select token.email_hash into v_email_hash
  from public.beta_unsubscribe_tokens as token
  where token.token_hash = ilgam_private.beta_token_hash(p_token);
  if v_email_hash is null then
    return query select 'invalid'::text, null::text, null::timestamptz, null::text;
    return;
  end if;
  -- 잠금 순서: 이메일 잠금 → 카운터 → 통지·발송금지 기록. 같은 링크를 거의 동시에 두 번 눌러도 이력이 두 건 생기지 않는다.
  perform ilgam_private.beta_lock_email(v_email_hash);
  if not ilgam_private.beta_take_call('unsubscribe:' || ilgam_private.beta_token_hash(p_token) || ':minute', 60, 10) then
    return query select 'rate_limited'::text, null::text, null::timestamptz, null::text;
    return;
  end if;

  v_status := ilgam_private.beta_ad_status(v_email_hash);

  if v_status = 'withdrawn' then
    select event.kind, event.occurred_at, event.notice_email_unavailable, event.notice_emailed_at into v_last
    from public.beta_ad_consent_events as event
    where event.email_hash = v_email_hash and event.kind in ('refuse', 'withdraw')
    order by event.occurred_at desc
    limit 1;
    insert into public.beta_ad_suppressions (email_hash, reason)
    values (v_email_hash, v_last.kind)
    on conflict (email_hash) do nothing;
    -- 다시 누른 링크는 새 통지를 만들지 않는다. 기존 통지의 상태만 돌려준다(새 발송을 약속하지 않게).
    return query select 'already'::text, v_last.kind::text, v_last.occurred_at,
      case
        when v_last.notice_emailed_at is not null then 'emailed'
        when v_last.notice_email_unavailable then 'screen_only'
        else 'email_pending'
      end;
    return;
  end if;

  -- 이메일로 통지할 주소가 남아 있는지: 신청 정보, 또는 삭제 결과 안내를 위해 잠시 남긴 주소.
  -- 보유기간 정리로 둘 다 없으면 주소를 새로 남기지 않고, 이 화면의 처리 결과 안내(화면 통지)만 한다.
  v_has_address := exists (
      select 1 from public.beta_applications as application where application.email_hash = v_email_hash
    ) or exists (
      select 1 from public.beta_deletion_requests as deletion
      where deletion.email_hash = v_email_hash and deletion.email is not null
    );

  -- 동의(확인 대기 포함)가 있으면 철회, 동의한 적이 없으면 거부로 기록한다.
  v_kind := case when v_status in ('active', 'pending') then 'withdraw' else 'refuse' end;
  insert into public.beta_ad_consent_events (
    email_hash, kind, source, occurred_at, notice_shown_at, notice_due_at, notice_email_unavailable
  ) values (
    v_email_hash, v_kind, 'unsubscribe_link', v_now, v_now, v_now + interval '14 days', not v_has_address
  );
  insert into public.beta_ad_suppressions (email_hash, reason)
  values (v_email_hash, v_kind)
  on conflict (email_hash) do nothing;
  return query select case when v_kind = 'withdraw' then 'withdrawn' else 'refused' end, v_kind, v_now,
    case when v_has_address then 'email_pending' else 'screen_only' end;
end;
$$;

-- ── 운영자 RPC ───────────────────────────────────────────────────────────

create function public.beta_ops_list_applications()
returns table(
  id uuid,
  email text,
  work_type text,
  sells_packages boolean,
  concurrent_jobs text,
  order_channels text[],
  participation text,
  eligible boolean,
  ad_checked boolean,
  created_at timestamptz,
  confirm_expires_at timestamptz,
  email_confirmed_at timestamptz,
  outcome text,
  result_sent_at timestamptz,
  interview_done_at timestamptz,
  beta_ended_at timestamptz,
  purge_after timestamptz,
  ad_status text,
  suppressed boolean,
  ad_target boolean,
  confirm_token text,
  unsubscribe_token text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform ilgam_private.beta_require_operator();
  return query
  select
    application.id,
    application.email,
    application.work_type,
    application.sells_packages,
    application.concurrent_jobs,
    application.order_channels,
    application.participation,
    application.eligible,
    application.ad_checked,
    application.created_at,
    application.confirm_expires_at,
    application.email_confirmed_at,
    application.outcome,
    application.result_sent_at,
    application.interview_done_at,
    application.beta_ended_at,
    application.purge_after,
    state.ad_status,
    state.suppressed,
    -- 광고 발송 대상은 신청 행이 아니라 주소(이메일) 단위로 한 번만 계산한다.
    -- 주소 확인까지 끝난 동의, 발송금지 아님, 그 주소의 가장 최근 신청이 적격,
    -- 그 주소의 어느 신청도 미충족·미선정으로 결과 안내되지 않음(D1 결정 전 기본 동작).
    -- 같은 주소의 과거 적격 신청 행이 남아 있어도 새 신청이 미충족·미선정이면 대상이 아니다.
    (state.ad_status = 'active'
      and not state.suppressed
      and state.latest_eligible
      and not state.excluded_by_result),
    link.confirm_token,
    link.unsubscribe_token
  from public.beta_applications as application
  left join public.beta_application_links as link on link.application_id = application.id
  cross join lateral (
    select
      ilgam_private.beta_ad_status(application.email_hash) as ad_status,
      exists (
        select 1 from public.beta_ad_suppressions as suppression
        where suppression.email_hash = application.email_hash
      ) as suppressed,
      (
        select latest.eligible from public.beta_applications as latest
        where latest.email_hash = application.email_hash
        order by latest.created_at desc, latest.id desc
        limit 1
      ) as latest_eligible,
      (
        exists (
          select 1 from public.beta_ad_exclusions as exclusion
          where exclusion.cohort = ilgam_private.beta_current_cohort()
            and exclusion.email_hash = application.email_hash
        )
        or exists (
          select 1 from public.beta_applications as decided
          where decided.email_hash = application.email_hash
            and decided.outcome in ('not_matched', 'not_selected')
        )
      ) as excluded_by_result
  ) as state
  order by application.created_at desc;
end;
$$;

create function public.beta_ops_list_notices()
returns table(
  event_id uuid,
  kind text,
  source text,
  occurred_at timestamptz,
  confirmed_at timestamptz,
  notice_shown_at timestamptz,
  notice_due_at timestamptz,
  notice_emailed_at timestamptz,
  application_id uuid,
  recipient_email text,
  email_unavailable boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform ilgam_private.beta_require_operator();
  return query
  select
    event.id,
    event.kind,
    event.source,
    event.occurred_at,
    event.confirmed_at,
    event.notice_shown_at,
    event.notice_due_at,
    event.notice_emailed_at,
    target.application_id,
    -- 통지를 보낼 주소: 그 의사표시를 남긴 신청, 없으면(수신거부 링크) 같은 주소의 가장 최근 신청,
    -- 신청 정보가 삭제 요청으로 지워졌으면 삭제 결과 안내를 보낼 때까지 남겨 둔 주소.
    coalesce(
      (select application.email from public.beta_applications as application where application.id = target.application_id),
      (
        select deletion.email from public.beta_deletion_requests as deletion
        where deletion.email_hash = event.email_hash and deletion.email is not null
        order by deletion.requested_at desc
        limit 1
      )
    ),
    event.notice_email_unavailable
  from public.beta_ad_consent_events as event
  cross join lateral (
    select coalesce(event.application_id, (
      select application.id from public.beta_applications as application
      where application.email_hash = event.email_hash
      order by application.created_at desc
      limit 1
    )) as application_id
  ) as target
  order by event.occurred_at desc;
end;
$$;

create function public.beta_ops_mark_notice_emailed(p_event_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  perform ilgam_private.beta_require_operator();
  update public.beta_ad_consent_events as event
  set notice_emailed_at = coalesce(event.notice_emailed_at, clock_timestamp())
  where event.id = p_event_id
  returning event.notice_emailed_at into v_at;
  if v_at is null then
    raise exception using errcode = '22023', message = 'notice_not_found';
  end if;
  return v_at;
end;
$$;

-- 결과 안내 보냄·인터뷰 끝남·베타 끝남을 기록하고 정리 예정일(purge_after)을 다시 계산한다.
-- 보유기간: 미충족·미선정 결과 안내 후 1개월 / 인터뷰만 인터뷰 후 6개월 / 베타 참가자 베타 종료 후 6개월.
create function public.beta_ops_record_milestone(p_application_id uuid, p_kind text, p_outcome text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_application public.beta_applications%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  perform ilgam_private.beta_require_operator();
  select application.* into v_application
  from public.beta_applications as application
  where application.id = p_application_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'application_not_found';
  end if;

  if p_kind = 'result_sent' then
    if v_application.result_sent_at is not null then
      raise exception using errcode = '22023', message = 'already_recorded';
    end if;
    -- 미충족이면 결과는 늘 '이번 모집 조건과 맞지 않음'이다.
    if not v_application.eligible then
      if p_outcome is distinct from 'not_matched' then
        raise exception using errcode = '22023', message = 'invalid_outcome';
      end if;
    elsif p_outcome is null or p_outcome not in ('not_selected', 'interview', 'beta')
      or (v_application.participation = 'interview' and p_outcome = 'beta')
      or (v_application.participation = 'beta' and p_outcome = 'interview') then
      raise exception using errcode = '22023', message = 'invalid_outcome';
    end if;
    v_application.outcome := p_outcome;
    v_application.result_sent_at := v_now;
    if p_outcome in ('not_matched', 'not_selected') then
      -- 신청 정보를 정리한 뒤에도 이번 모집 광고에서 빠지도록 해시만 따로 남긴다.
      insert into public.beta_ad_exclusions (cohort, email_hash, reason)
      values (ilgam_private.beta_current_cohort(), v_application.email_hash, p_outcome)
      on conflict (cohort, email_hash) do nothing;
    end if;
  elsif p_kind = 'interview_done' then
    if v_application.outcome is distinct from 'interview' or v_application.interview_done_at is not null then
      raise exception using errcode = '22023', message = 'invalid_milestone';
    end if;
    v_application.interview_done_at := v_now;
  elsif p_kind = 'beta_ended' then
    if v_application.outcome is distinct from 'beta' or v_application.beta_ended_at is not null then
      raise exception using errcode = '22023', message = 'invalid_milestone';
    end if;
    v_application.beta_ended_at := v_now;
  else
    raise exception using errcode = '22023', message = 'invalid_milestone';
  end if;

  v_application.purge_after := case v_application.outcome
    when 'not_matched' then v_application.result_sent_at + interval '1 month'
    when 'not_selected' then v_application.result_sent_at + interval '1 month'
    when 'interview' then v_application.interview_done_at + interval '6 months'
    when 'beta' then v_application.beta_ended_at + interval '6 months'
  end;

  update public.beta_applications
  set outcome = v_application.outcome,
    result_sent_at = v_application.result_sent_at,
    interview_done_at = v_application.interview_done_at,
    beta_ended_at = v_application.beta_ended_at,
    purge_after = v_application.purge_after
  where id = v_application.id;
  return v_application.purge_after;
end;
$$;

-- 삭제 요청 처리: 같은 주소의 신청 정보를 모두 지운다. 광고 수신 목록에서 빼고 발송금지 해시는 남긴다.
-- 동의·철회 증빙은 남긴다(보유 근거 확정 전 기본). 일감체크 계정 데이터는 건드리지 않는다.
-- 그 주소로 아직 보내지 않은 처리결과 통지(삭제 전 동의 등)와 이번 철회 통지, 삭제 결과 안내를 끝낼 수 있도록
-- 주소만 beta_deletion_requests에 남긴다. 운영자가 통지를 모두 보내고 삭제 결과 안내를 보냈다고 표시하면 지운다.
create function public.beta_ops_delete_application(p_application_id uuid)
returns table(deleted_count integer, withdraw_event_id uuid, withdraw_at timestamptz, deletion_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_email_hash text;
  v_status text;
  v_now timestamptz := clock_timestamp();
  v_event_id uuid;
  v_deleted integer;
  v_deletion_id uuid;
begin
  perform ilgam_private.beta_require_operator();
  select application.email, application.email_hash into v_email, v_email_hash
  from public.beta_applications as application
  where application.id = p_application_id;
  if v_email_hash is null then
    raise exception using errcode = '22023', message = 'application_not_found';
  end if;

  perform ilgam_private.beta_lock_email(v_email_hash);
  -- 잠금을 잡는 사이 다른 경로(정리 등)가 지웠을 수 있으니 다시 확인한다.
  if not exists (select 1 from public.beta_applications as application where application.id = p_application_id) then
    raise exception using errcode = '22023', message = 'application_not_found';
  end if;
  v_status := ilgam_private.beta_ad_status(v_email_hash);
  if v_status in ('active', 'pending') then
    -- 삭제 요청은 광고 수신 철회로도 기록한다. 화면 표시는 없으니 통지는 운영자가 메일로 보낸다.
    insert into public.beta_ad_consent_events (
      email_hash, kind, source, occurred_at, notice_due_at
    ) values (
      v_email_hash, 'withdraw', 'deletion_request', v_now, v_now + interval '14 days'
    )
    returning id into v_event_id;
  end if;
  insert into public.beta_ad_suppressions (email_hash, reason)
  values (v_email_hash, 'deletion_request')
  on conflict (email_hash) do nothing;

  delete from public.beta_applications as application where application.email_hash = v_email_hash;
  get diagnostics v_deleted = row_count;
  insert into public.beta_deletion_requests (email, email_hash, requested_at, deleted_count)
  values (v_email, v_email_hash, v_now, v_deleted)
  returning id into v_deletion_id;
  return query select v_deleted, v_event_id, case when v_event_id is null then null else v_now end, v_deletion_id;
end;
$$;

-- 삭제 요청 기록. 안내를 아직 보내지 않은 건만 주소가 있다.
create function public.beta_ops_list_deletions()
returns table(
  id uuid,
  email text,
  requested_at timestamptz,
  deleted_count integer,
  result_emailed_at timestamptz,
  pending_notices integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform ilgam_private.beta_require_operator();
  return query
  select
    deletion.id,
    deletion.email,
    deletion.requested_at,
    deletion.deleted_count,
    deletion.result_emailed_at,
    (
      select count(*)::integer from public.beta_ad_consent_events as event
      where event.email_hash = deletion.email_hash and event.notice_emailed_at is null
        and not event.notice_email_unavailable
    )
  from public.beta_deletion_requests as deletion
  order by deletion.requested_at desc;
end;
$$;

-- 삭제 결과 안내를 보냈다고 표시하고 남겨 둔 주소를 지운다.
-- 같은 주소로 보내야 할 처리결과 통지가 남아 있으면 거부한다(주소를 지우면 통지를 보낼 수 없으므로).
create function public.beta_ops_mark_deletion_emailed(p_deletion_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deletion public.beta_deletion_requests%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  perform ilgam_private.beta_require_operator();
  select deletion.* into v_deletion
  from public.beta_deletion_requests as deletion
  where deletion.id = p_deletion_id;
  if not found then
    raise exception using errcode = '22023', message = 'deletion_not_found';
  end if;
  -- 마지막 주소를 지우기 전에, 같은 주소의 수신거부(통지 생성)와 줄을 세운 뒤 조건을 다시 읽는다.
  perform ilgam_private.beta_lock_email(v_deletion.email_hash);
  select deletion.* into v_deletion
  from public.beta_deletion_requests as deletion
  where deletion.id = p_deletion_id
  for update;
  if v_deletion.result_emailed_at is not null then
    return v_deletion.result_emailed_at;
  end if;
  if exists (
    select 1 from public.beta_ad_consent_events as event
    where event.email_hash = v_deletion.email_hash and event.notice_emailed_at is null
      and not event.notice_email_unavailable
  ) then
    raise exception using errcode = '22023', message = 'notices_pending';
  end if;
  update public.beta_deletion_requests
  set email = null, result_emailed_at = v_now
  where id = v_deletion.id;
  return v_now;
end;
$$;

-- 보유기간이 지난 신청 정보 정리(운영자 버튼). 자동 예약은 다음 단계다.
create function public.beta_ops_purge_expired()
returns table(deleted_count integer, remaining_count integer, held_count integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_count integer;
  v_email_hash text;
  v_remaining integer;
  v_held integer;
begin
  perform ilgam_private.beta_require_operator();
  -- 정리할 주소를 해시 오름차순으로 하나씩 잠근다(잠금 순서를 한 가지로). 잠근 뒤 같은 조건으로 다시 확인하며 지운다.
  -- 그 주소로 아직 보내지 않은 처리결과 통지가 있으면 주소를 잃지 않도록 정리하지 않는다(통지를 보낸 뒤 다시 정리).
  for v_email_hash in
    -- 잠금을 함수 끝까지 쥐므로 한 번에 주소 100개까지만 처리하고, 남은 것은 다음 실행에서 처리한다.
    -- 미발송 통지 때문에 보류된 주소는 후보에서 먼저 뺀다(보류된 앞 주소들이 뒤의 정리 가능한 주소를 가리지 않게).
    -- 잠근 뒤 DELETE에서 같은 조건을 한 번 더 검사한다(그 사이 통지가 생겼을 수 있으므로).
    select distinct candidate.email_hash
    from public.beta_applications as candidate
    where candidate.purge_after is not null and candidate.purge_after <= clock_timestamp()
      and not exists (
        select 1 from public.beta_ad_consent_events as event
        where event.email_hash = candidate.email_hash and event.notice_emailed_at is null
          and not event.notice_email_unavailable
      )
    order by candidate.email_hash
    limit 100
  loop
    perform ilgam_private.beta_lock_email(v_email_hash);
    delete from public.beta_applications as application
    where application.email_hash = v_email_hash
      and application.purge_after is not null and application.purge_after <= clock_timestamp()
      and not exists (
        select 1 from public.beta_ad_consent_events as event
        where event.email_hash = application.email_hash and event.notice_emailed_at is null
          and not event.notice_email_unavailable
      );
    get diagnostics v_count = row_count;
    v_deleted := v_deleted + v_count;
  end loop;

  -- 남은 정리 대상을 둘로 나눈다: 정리 가능한데 다음 실행 몫인 주소, 보내지 않은 통지 때문에 보류된 주소.
  select
    count(distinct candidate.email_hash) filter (where not candidate_state.held)::integer,
    count(distinct candidate.email_hash) filter (where candidate_state.held)::integer
  into v_remaining, v_held
  from public.beta_applications as candidate
  cross join lateral (
    select exists (
      select 1 from public.beta_ad_consent_events as event
      where event.email_hash = candidate.email_hash and event.notice_emailed_at is null
        and not event.notice_email_unavailable
    ) as held
  ) as candidate_state
  where candidate.purge_after is not null and candidate.purge_after <= clock_timestamp();

  return query select v_deleted, v_remaining, v_held;
end;
$$;

-- 오래된 호출 제한 카운터 정리(운영자). 신청 정리와 따로 부르는 별도 트랜잭션이며 이메일 잠금을 잡지 않는다.
-- 2일 지난 시간 창만, 한 번에 5,000행까지 지우고 남은 수를 돌려준다(남으면 다시 실행).
-- 남은 수는 실행 시간에 상한을 두려고 5,001개까지만 센다. remaining_rows = 5001이면 '5,000행 넘게 남음'이라는 뜻이다.
create function public.beta_ops_prune_call_counters()
returns table(deleted_rows integer, remaining_rows integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := clock_timestamp() - interval '2 days';
  v_deleted integer;
  v_remaining integer;
begin
  perform ilgam_private.beta_require_operator();
  delete from public.beta_public_call_counters as counter
  using (
    select old.bucket, old.window_start
    from public.beta_public_call_counters as old
    where old.window_start < v_cutoff
    order by old.window_start
    limit 5000
  ) as batch
  where counter.bucket = batch.bucket and counter.window_start = batch.window_start;
  get diagnostics v_deleted = row_count;
  select count(*)::integer into v_remaining
  from (
    select 1
    from public.beta_public_call_counters as counter
    where counter.window_start < v_cutoff
    limit 5001
  ) as capped;
  return query select v_deleted, v_remaining;
end;
$$;

revoke all on function
  public.submit_beta_application(text, text, boolean, text, text[], text, boolean, boolean, text),
  public.confirm_beta_email(text),
  public.unsubscribe_beta_ads(text)
from public;
grant execute on function
  public.submit_beta_application(text, text, boolean, text, text[], text, boolean, boolean, text),
  public.confirm_beta_email(text),
  public.unsubscribe_beta_ads(text)
to anon, authenticated;

revoke all on function
  public.beta_ops_list_applications(),
  public.beta_ops_list_notices(),
  public.beta_ops_mark_notice_emailed(uuid),
  public.beta_ops_record_milestone(uuid, text, text),
  public.beta_ops_delete_application(uuid),
  public.beta_ops_list_deletions(),
  public.beta_ops_mark_deletion_emailed(uuid),
  public.beta_ops_purge_expired(),
  public.beta_ops_prune_call_counters()
from public, anon;
grant execute on function
  public.beta_ops_list_applications(),
  public.beta_ops_list_notices(),
  public.beta_ops_mark_notice_emailed(uuid),
  public.beta_ops_record_milestone(uuid, text, text),
  public.beta_ops_delete_application(uuid),
  public.beta_ops_list_deletions(),
  public.beta_ops_mark_deletion_emailed(uuid),
  public.beta_ops_purge_expired(),
  public.beta_ops_prune_call_counters()
to authenticated;

notify pgrst, 'reload schema';
