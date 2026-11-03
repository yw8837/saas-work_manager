-- 고객 링크 조회(get_workspace_revision_view)에 완료 상태와 고객이 남긴 요청 목록을 더한다.
-- 1) 완료 화면: 작업자가 링크를 켠 채(revisionPortalEnabled=true) 일감을 완료하면, 지금 토큰으로 연 고객에게
--    '사용할 수 없는 링크' 대신 완료 상태와 완료 시각을 돌려준다. 고객 제출 함수는 바꾸지 않아서
--    (진행 중인 일감만 받는다) 완료된 링크로는 여전히 제출할 수 없다.
--    - 작업자가 끈 링크(revisionPortalEnabled=false), 재발급 전 옛 토큰(토큰 해시·문서 토큰 불일치),
--      보관(archived)·삭제한 일감, 가짜 토큰은 지금처럼 아무 행도 돌려주지 않는다.
--    - 앱은 완료 때 포털 행을 enabled=false로 맞추므로(syncHostedRevisionPortals), 완료된 일감은 포털 enabled를 보지 않고
--      문서의 상태·토큰·켜짐 값으로 판단한다. 진행 중인 일감은 지금처럼 포털 enabled도 요구한다.
-- 2) 요청 목록: 고객이 링크로 남긴 요청(source='public')만, 최근 것부터 20건, 상태 이름·회차·접수 시각·원문(4000자)만.
--    작업자 메모(revertReason)·고객 이름(clientLabel)·채널·참고 주소·수동 기록·금액은 내보내지 않는다.
--    상태: 되돌림/반려(revertedAt) → rejected, used → done(+sequence), extra_scope → extra, 그 밖 → pending.
-- 돌려주는 열이 늘어서 함수를 지우고 다시 만든다(이전 migration과 같은 방식).
-- 적용 순서: **새 앱을 먼저 배포하고, 그다음 이 migration을 적용한다.**
--   새 앱은 이 migration 전 DB와도 맞는다(새 열이 없으면 진행 중으로 보고 목록·완료 화면을 그리지 않는다).
--   이전 앱은 새 열을 무시하지만, 완료된 일감 행을 받으면 요청 입력란을 그린다(제출은 서버가 거부).
--   그래서 migration을 먼저 하지 않는다. 새 앱도 완료 때 링크 켜짐 값을 남기므로, 새 앱 배포 뒤에 완료한 일감부터 완료 화면이 보인다.

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
