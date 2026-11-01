-- 수정 횟수를 접수가 아니라 작업자가 '수정 완료'를 누를 때 쓰도록 바꾼다(설계: docs/design/revision-count-and-customer-link.md).
-- 1) 고객 링크 제출은 확인 대기(usage='pending')로만 기록하고 남은 횟수를 줄이지 않는다.
--    수정 완료·추가 작업 분류·반려는 작업자 화면이 자기 문서를 저장하는 기존 경로(save_workspace_document)로 한다.
--    그 저장은 문서 버전으로 낙관적 잠금을 하므로, 고객 제출과 겹치면 작업자 저장이 충돌로 거부되고 덮어쓰지 않는다.
-- 2) 원장 usage에 'pending'을 허용한다. 기존 행(used/extra_scope)은 그대로다.
-- 3) 고객 조회 RPC가 확인 대기 건수와 아직 받지 못한 '시작 전 받을 자료' 이름을 내보낸다.
--    돌려주는 열이 늘어서 함수를 지우고 다시 만든다. 금액·연락처·할 일 이름은 여전히 내보내지 않는다.
-- 적용 순서: **새 앱을 먼저 배포하고, 곧바로 이 migration을 적용한다.**
--   새 앱은 이 migration 전 DB와도 맞는다(영수증 used/extra_scope 처리, 조회 함수에 새 열이 없으면 표시 생략).
--   반대로 이전 앱은 'pending' 영수증을 used가 아니라서 '추가 작업 검토'로 잘못 안내하므로, migration을 먼저 하면 안 된다.
--   주의: 새 앱 배포 전에 열어 둔 고객 탭은 옛 화면 코드라서, migration 뒤 그 탭에서 제출하면 같은 오안내가 난다.
--   순서나 간격으로는 막을 수 없다. 데이터는 확인 대기로 맞게 남고, 그 탭을 새로 고치면 바로잡힌다.

alter table public.workspace_revision_requests
  drop constraint if exists workspace_revision_requests_usage_check;
alter table public.workspace_revision_requests
  add constraint workspace_revision_requests_usage_check
  check (usage in ('pending', 'used', 'extra_scope'));

create or replace function public.submit_workspace_revision_request(
  p_token text,
  p_body text,
  p_client_label text,
  p_idempotency_key uuid
)
returns table(
  request_id uuid,
  usage text,
  sequence integer,
  submitted_at timestamptz,
  remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_portal public.workspace_revision_portals%rowtype;
  v_existing public.workspace_revision_requests%rowtype;
  v_document public.workspace_documents%rowtype;
  v_hash text;
  v_request_hash text;
  v_now timestamptz := clock_timestamp();
  v_local_date date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_job jsonb;
  v_job_index integer;
  v_limit integer;
  v_used integer;
  v_revision_id uuid := gen_random_uuid();
  v_revision jsonb;
  v_state jsonb;
  v_next_version bigint;
begin
  if coalesce(char_length(p_token), 0) not between 43 and 128
    or p_token !~ '^[A-Za-z0-9_-]+$'
    or coalesce(char_length(trim(p_body)), 0) not between 2 and 4000
    or coalesce(char_length(trim(p_client_label)), 0) > 100
    or p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'invalid_revision_request';
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_request_hash := encode(extensions.digest(trim(p_body) || '|' || coalesce(trim(p_client_label), ''), 'sha256'), 'hex');

  select portal.* into v_portal
  from public.workspace_revision_portals as portal
  where portal.token_hash = v_hash and portal.enabled;
  if not found then
    raise exception using errcode = '22023', message = 'invalid_revision_link';
  end if;

  -- The workspace document is the canonical token source. Lock and verify it
  -- before returning an idempotent receipt so a rotated token is immediately
  -- invalid even if the portal-hash synchronization call has not completed.
  select document.* into v_document
  from public.workspace_documents as document
  where document.owner_id = v_portal.owner_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'workspace_not_found';
  end if;

  -- Use the same document -> portal lock order as deletion and registration.
  select portal.* into v_portal
  from public.workspace_revision_portals as portal
  where portal.token_hash = v_hash and portal.enabled
    and portal.owner_id = v_document.owner_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'invalid_revision_link';
  end if;

  select (ordinality - 1)::integer, job into v_job_index, v_job
  from jsonb_array_elements(v_document.state -> 'jobs') with ordinality as entries(job, ordinality)
  where job ->> 'id' = v_portal.job_key
  limit 1;
  if v_job is null
    or v_job ->> 'revisionPortalToken' <> p_token
    or v_job ->> 'status' <> 'active'
    or not coalesce((v_job ->> 'revisionPortalEnabled')::boolean, false) then
    raise exception using errcode = '22023', message = 'invalid_revision_link';
  end if;

  select request.* into v_existing
  from public.workspace_revision_requests as request
  where request.portal_id = v_portal.id
    and request.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return query select
      v_existing.id,
      v_existing.usage,
      v_existing.sequence,
      v_existing.submitted_at,
      greatest(0, coalesce((select summary.remaining from public.get_workspace_revision_summary(p_token) as summary), 0));
    return;
  end if;

  if v_portal.last_submission_at is not null
    and v_now < v_portal.last_submission_at + interval '3 seconds' then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  if v_portal.hourly_window_started_at is null
    or v_now >= v_portal.hourly_window_started_at + interval '1 hour' then
    v_portal.hourly_window_started_at := v_now;
    v_portal.hourly_count := 0;
  end if;
  if v_portal.daily_window_date is distinct from v_local_date then
    v_portal.daily_window_date := v_local_date;
    v_portal.daily_count := 0;
  end if;
  if v_portal.hourly_count >= 20 or v_portal.daily_count >= 100 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  -- 접수만으로는 횟수를 쓰지 않는다. 남은 횟수는 작업자가 '수정 완료'로 센 기록(used)만으로 계산한다.
  v_limit := greatest(coalesce((v_job ->> 'revisionLimit')::integer, 0), 0);
  select count(*)::integer into v_used
  from jsonb_array_elements(coalesce(v_job -> 'revisions', '[]'::jsonb)) as revision
  where revision ->> 'usage' = 'used'
    and not (revision ? 'revertedAt');

  v_revision := jsonb_strip_nulls(jsonb_build_object(
    'id', v_revision_id::text,
    'jobId', v_portal.job_key,
    'source', 'public',
    'clientLabel', nullif(trim(p_client_label), ''),
    'body', trim(p_body),
    'status', 'new',
    'usage', 'pending',
    'submittedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));

  v_job := jsonb_set(
    v_job,
    '{revisions}',
    coalesce(v_job -> 'revisions', '[]'::jsonb) || jsonb_build_array(v_revision),
    true
  );
  v_job := jsonb_set(v_job, '{updatedAt}', to_jsonb(to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), true);
  v_state := jsonb_set(v_document.state, array['jobs', v_job_index::text], v_job, false);
  perform public.validate_workspace_state(v_state);
  v_next_version := v_document.document_version + 1;

  update public.workspace_documents as document
  set state = v_state, document_version = v_next_version, updated_at = v_now
  where document.owner_id = v_portal.owner_id;

  insert into public.workspace_revision_requests (
    id, portal_id, owner_id, job_key, idempotency_key, request_hash,
    client_label, body, usage, sequence, document_version, submitted_at
  ) values (
    v_revision_id, v_portal.id, v_portal.owner_id, v_portal.job_key,
    p_idempotency_key, v_request_hash, nullif(trim(p_client_label), ''),
    trim(p_body), 'pending', null, v_next_version, v_now
  );

  update public.workspace_revision_portals as portal
  set last_submission_at = v_now,
      hourly_window_started_at = v_portal.hourly_window_started_at,
      hourly_count = v_portal.hourly_count + 1,
      daily_window_date = v_portal.daily_window_date,
      daily_count = v_portal.daily_count + 1,
      updated_at = v_now
  where portal.id = v_portal.id;

  return query select
    v_revision_id,
    'pending'::text,
    null::integer,
    v_now,
    greatest(v_limit - v_used, 0);
end;
$$;

-- 고객 조회: 확인 대기 건수와 아직 받지 못한 '시작 전 받을 자료' 이름(작업자가 패키지에 적은 것)을 더한다.
drop function if exists public.get_workspace_revision_view(text);

create function public.get_workspace_revision_view(p_token text)
returns table(
  job_key text,
  title text,
  package_name text,
  included integer,
  used integer,
  remaining integer,
  due_date text,
  tasks_total integer,
  tasks_done integer,
  has_open_revision boolean,
  worker_name text,
  pending_requests integer,
  intake_pending jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job jsonb;
  v_settings jsonb;
  v_limit integer;
  v_used integer;
  v_due text;
  v_revisions jsonb;
  v_intake jsonb;
begin
  if coalesce(char_length(p_token), 0) not between 43 and 128
    or p_token !~ '^[A-Za-z0-9_-]+$' then
    return;
  end if;

  select job, document.state -> 'settings' into v_job, v_settings
  from public.workspace_revision_portals as portal
  join public.workspace_documents as document on document.owner_id = portal.owner_id,
    lateral jsonb_array_elements(document.state -> 'jobs') as job
  where portal.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and portal.enabled
    and job ->> 'id' = portal.job_key
    and job ->> 'revisionPortalToken' = p_token
    and job ->> 'status' = 'active'
    and coalesce((job ->> 'revisionPortalEnabled')::boolean, false)
  limit 1;

  if v_job is null then return; end if;
  v_revisions := case when jsonb_typeof(v_job -> 'revisions') = 'array' then v_job -> 'revisions' else '[]'::jsonb end;
  v_intake := case when jsonb_typeof(v_job -> 'intakeItems') = 'array' then v_job -> 'intakeItems' else '[]'::jsonb end;
  -- included/used/remaining은 기존 get_workspace_revision_summary와 같은 식으로 계산한다.
  v_limit := greatest(coalesce((v_job ->> 'revisionLimit')::integer, 0), 0);
  select count(*)::integer into v_used
  from jsonb_array_elements(v_revisions) as revision
  where revision ->> 'usage' = 'used'
    and not (revision ? 'revertedAt');

  -- 형식이 맞는 날짜 문자열만 내보낸다. 날짜 변환은 하지 않아 잘못된 값이 RPC 전체를 깨지 않는다.
  v_due := case
    when coalesce(v_job ->> 'dueDate', '') ~ '^\d{4}-\d{2}-\d{2}$' then v_job ->> 'dueDate'
    else null
  end;

  return query select
    v_job ->> 'id',
    left(coalesce(v_job ->> 'title', '수정 요청'), 160),
    left(coalesce(v_job #>> '{packageSnapshot,name}', '작업'), 80),
    v_limit,
    v_used,
    greatest(v_limit - v_used, 0),
    v_due,
    (select count(*)::integer
      from jsonb_array_elements(case when jsonb_typeof(v_job -> 'tasks') = 'array' then v_job -> 'tasks' else '[]'::jsonb end) as task
      where coalesce(task ->> 'status', '') <> 'cancelled'),
    (select count(*)::integer
      from jsonb_array_elements(case when jsonb_typeof(v_job -> 'tasks') = 'array' then v_job -> 'tasks' else '[]'::jsonb end) as task
      where task ->> 'status' = 'done'),
    exists (
      select 1
      from jsonb_array_elements(v_revisions) as revision
      where not (revision ? 'revertedAt')
    ),
    nullif(left(btrim(coalesce(
      case when jsonb_typeof(v_settings) = 'object' then v_settings ->> 'publicWorkerName' end,
      ''
    )), 40), ''),
    (select count(*)::integer
      from jsonb_array_elements(v_revisions) as revision
      where revision ->> 'usage' = 'pending'
        and not (revision ? 'revertedAt')),
    -- 이름만, 최대 20개, 각 80자. 받은 시각(receivedAt)이 있는 항목은 빼고 순서를 지킨다.
    coalesce((
      select jsonb_agg(label order by position)
      from (
        select left(btrim(item ->> 'label'), 80) as label, position
        from jsonb_array_elements(v_intake) with ordinality as entries(item, position)
        where jsonb_typeof(item) = 'object'
          and coalesce(btrim(item ->> 'label'), '') <> ''
          and coalesce(item ->> 'receivedAt', '') = ''
        order by position
        limit 20
      ) as missing
    ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_workspace_revision_view(text) from public;
grant execute on function public.get_workspace_revision_view(text) to anon, authenticated;
