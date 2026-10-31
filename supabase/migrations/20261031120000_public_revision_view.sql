-- 고객 링크(/r)에 작업자 이름·마감일·진행 상황을 보여 주기 위한 공개 RPC.
-- 기존 get_workspace_revision_summary는 그대로 둔다. 이 migration 전에 배포된 앱과
-- 이 함수가 아직 없는 DB에서도 앱이 기존 함수로 되돌아가게 하려는 것이다.
-- 고객에게는 할 일 이름·금액·연락처를 내보내지 않고 개수와 날짜만 내보낸다.
-- 작업자 이름은 작업자가 설정에서 직접 적은 경우(settings.publicWorkerName)에만 내보낸다.

create or replace function public.get_workspace_revision_view(p_token text)
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
  worker_name text
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
  -- included/used/remaining은 기존 get_workspace_revision_summary와 같은 식으로 계산한다.
  v_limit := greatest(coalesce((v_job ->> 'revisionLimit')::integer, 0), 0);
  select count(*)::integer into v_used
  from jsonb_array_elements(case when jsonb_typeof(v_job -> 'revisions') = 'array' then v_job -> 'revisions' else '[]'::jsonb end) as revision
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
      from jsonb_array_elements(case when jsonb_typeof(v_job -> 'revisions') = 'array' then v_job -> 'revisions' else '[]'::jsonb end) as revision
      where not (revision ? 'revertedAt')
    ),
    nullif(left(btrim(coalesce(
      case when jsonb_typeof(v_settings) = 'object' then v_settings ->> 'publicWorkerName' end,
      ''
    )), 40), '');
end;
$$;

revoke all on function public.get_workspace_revision_view(text) from public;
grant execute on function public.get_workspace_revision_view(text) to anon, authenticated;
