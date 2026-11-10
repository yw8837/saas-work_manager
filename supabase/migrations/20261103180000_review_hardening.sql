-- 2026-11-11 점검 반영 (코드 리뷰·보안 검토)
-- 1) 고객 링크 조회(get_workspace_revision_view): 열린 요청을 확인 대기(usage='pending')만으로 센다.
--    앱의 customerProgressOf와 같은 규칙이다. 돌려주는 열은 그대로라 앱 순서와 상관없이 적용할 수 있다.
-- 2) 고객 요청 제출(submit_workspace_revision_request): 확인 대기 중인 고객 요청이 30건이면 'pending_request_limit'로 거절한다.
--    새 앱은 이 오류를 안내 문구로 바꿔 보여 준다. 이전 앱은 '링크 상태를 확인해주세요'로 보이지만 데이터는 안전하다.
-- 버전은 PR #21의 20261104010000보다 앞에 둔다(그 migration을 --include-all 없이 올리기 위해).

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

  -- 작업자가 아직 확인하지 않은 고객 요청이 쌓이면 더 받지 않는다(2026-11-11 보안 검토).
  -- 링크를 가진 사람이 하루 100건씩 보내 작업공간 문서를 5MB 상한까지 부풀리면 작업자 저장이 막히기 때문이다.
  if (
    select count(*)
    from jsonb_array_elements(coalesce(v_job -> 'revisions', '[]'::jsonb)) as revision
    where revision ->> 'source' = 'public'
      and revision ->> 'usage' = 'pending'
      and not (revision ? 'revertedAt')
  ) >= 30 then
    raise exception using errcode = 'P0001', message = 'pending_request_limit';
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
  intake_pending jsonb,
  job_status text,
  completed_at text,
  requests jsonb
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
  v_status text;
  v_completed_at text;
  -- 앱이 쓰는 ISO 시각(toISOString)만 통과시킨다. 형식이 틀린 값은 null로 내보내고 변환하지 않는다.
  c_iso constant text := '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$';
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
    and job ->> 'id' = portal.job_key
    and job ->> 'revisionPortalToken' = p_token
    and coalesce((job ->> 'revisionPortalEnabled')::boolean, false)
    and (
      (job ->> 'status' = 'active' and portal.enabled)
      or job ->> 'status' = 'completed'
    )
  limit 1;

  if v_job is null then return; end if;
  v_status := v_job ->> 'status';
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
  v_completed_at := case
    when v_status = 'completed' and coalesce(v_job ->> 'completedAt', '') ~ c_iso then v_job ->> 'completedAt'
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
    -- 열린 요청 = 아직 확인 대기(pending)인 요청. 수정 완료(used)·추가 작업(extra_scope)으로 처리한 요청까지 세면
    -- 수정을 다 끝내도 고객 화면 단계가 '수정'에 머문다(2026-11-11 코드 리뷰).
    exists (
      select 1
      from jsonb_array_elements(v_revisions) as revision
      where revision ->> 'usage' = 'pending'
        and not (revision ? 'revertedAt')
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
    ), '[]'::jsonb),
    v_status,
    v_completed_at,
    -- 고객 링크 요청만, 최근 것부터 20건. 상태 이름·회차·접수 시각·원문만 담는다.
    coalesce((
      select jsonb_agg(entry order by position desc)
      from (
        select jsonb_strip_nulls(jsonb_build_object(
          'status', case
            when revision ? 'revertedAt' then 'rejected'
            when revision ->> 'usage' = 'used' then 'done'
            when revision ->> 'usage' = 'extra_scope' then 'extra'
            else 'pending'
          end,
          'sequence', case
            when revision ->> 'usage' = 'used'
              and not (revision ? 'revertedAt')
              and coalesce(revision ->> 'sequence', '') ~ '^[1-9]\d{0,3}$'
              then (revision ->> 'sequence')::integer
          end,
          'submittedAt', case
            when coalesce(revision ->> 'submittedAt', '') ~ c_iso then revision ->> 'submittedAt'
          end,
          'body', left(btrim(revision ->> 'body'), 4000)
        )) as entry, position
        from jsonb_array_elements(v_revisions) with ordinality as entries(revision, position)
        where jsonb_typeof(revision) = 'object'
          and revision ->> 'source' = 'public'
          and coalesce(btrim(revision ->> 'body'), '') <> ''
        order by position desc
        limit 20
      ) as recent
    ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_workspace_revision_view(text) from public;
grant execute on function public.get_workspace_revision_view(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
