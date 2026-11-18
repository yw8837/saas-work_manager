-- 고객 링크 조회(get_workspace_revision_view)의 요청 목록(requests)에 작업자가 직접 적은 요청도 넣는다.
-- 2026-11-18: 콜드메일 회신 "고객은 쓰던 카톡 채팅창에서 말하고 싶어 한다". 작업자가 카톡·전화로 받은 요청을
-- '요청 직접 적기'로 남겨도 고객 화면 목록에는 링크로 남긴 요청만 보여, 카톡으로만 말한 고객이 링크를 열면 기록이 비어 있었다.
-- 함수 본문은 20261117120000과 같고, requests를 만드는 부분만 바꿨다. 반환 열은 그대로다.
-- 바꾼 것:
--   1) 직접 적은 요청(source 'manual')도 담는다. 원문(body)은 담지 않는다. 작업자가 자기 말로 적은 메모라
--      고객에게 보일 글이 아닐 수 있다. 대신 'source': 'manual'과 받은 경로 'channel'만 담는다.
--      경로는 앱의 선택지 일곱 개(kakao·kmong·soomgo·instagram·discord·phone·other)만 내보내고, 그 밖의 값은 'other'로 바꾼다.
--   2) 고객 링크 요청 항목은 지금과 같은 모양이다(source·channel 없음, 원문 포함).
--   3) 두 가지를 접수 시각이 늦은 것부터 20건. 시각이 같거나 형식이 틀리면 문서에 적힌 순서(나중 것 먼저)로 둔다.
--      시각은 변환하지 않고 글자 그대로 비교한다(앱이 쓰는 ISO 형식만 통과시키고, collate "C"로 바이트 순서).
-- 배포 순서와 상관없이 깨지지 않게:
--   - 옛 화면은 원문이 없는 항목을 버리므로 새 함수가 와도 지금처럼 고객 링크 요청만 보인다.
--   - 새 화면은 source가 없으면 고객 링크 요청으로 읽으므로 옛 함수가 와도 지금처럼 동작한다.
-- 그대로 지키는 것: 금액·원가·추가 작업 이름·반려 사유·고객 이름·연락처·참고 링크는 내보내지 않는다. 최근 20건, 익명 호출 권한, 토큰 검증.
-- 반환 열이 같아 create or replace도 되지만, 20261117120000 이전 모양의 함수가 남아 있는 DB에서도 이 파일 하나로 맞도록
-- 직전 판처럼 지우고 다시 만든다(같은 파일 안에서 권한을 다시 준다).

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
  requests jsonb,
  addons_confirmed integer,
  addon_days integer
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
  v_addons jsonb;
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
  v_addons := case when jsonb_typeof(v_job -> 'addons') = 'array' then v_job -> 'addons' else '[]'::jsonb end;
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
    -- 고객 링크 요청과 작업자가 직접 적은 요청, 접수 시각이 늦은 것부터 20건. 상태 이름·회차·접수 시각을 담는다.
    -- 고객 링크 요청은 원문을, 직접 적은 요청은 원문 대신 source·channel(정해진 값)만 담는다.
    coalesce((
      select jsonb_agg(entry order by sort_at collate "C" desc nulls last, position desc)
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
          'source', case when revision ->> 'source' = 'manual' then 'manual' end,
          'channel', case
            when revision ->> 'source' <> 'manual' then null
            when revision ->> 'channel' in ('kakao', 'kmong', 'soomgo', 'instagram', 'discord', 'phone') then revision ->> 'channel'
            else 'other'
          end,
          -- 원문은 고객 링크 요청에만 담는다. 직접 적은 요청의 원문은 어떤 경우에도 내보내지 않는다.
          'body', case when revision ->> 'source' = 'public' then left(btrim(revision ->> 'body'), 4000) end
        )) as entry,
        (case
          when coalesce(revision ->> 'submittedAt', '') ~ c_iso then revision ->> 'submittedAt'
        end) collate "C" as sort_at,
        position
        from jsonb_array_elements(v_revisions) with ordinality as entries(revision, position)
        where jsonb_typeof(revision) = 'object'
          and revision ->> 'source' in ('public', 'manual')
          and coalesce(btrim(revision ->> 'body'), '') <> ''
        order by sort_at desc nulls last, position desc
        limit 20
      ) as recent
    ), '[]'::jsonb),
    -- 확정된 추가 작업의 건수. 초안·취소는 세지 않는다. 이름·금액·원가는 내보내지 않는다.
    (select count(*)::integer
      from jsonb_array_elements(v_addons) as addon
      where jsonb_typeof(addon) = 'object'
        and addon ->> 'status' = 'confirmed'),
    -- 확정된 추가 작업으로 더해진 기간(일). JSON 숫자이면서 0~9999인 정수만 더한다(글자·음수·소수·10000 이상은 건너뛴다).
    -- 앱의 customerAddonsOf와 같은 규칙이다.
    (select coalesce(sum((addon ->> 'durationDaysDelta')::integer), 0)::integer
      from jsonb_array_elements(v_addons) as addon
      where jsonb_typeof(addon) = 'object'
        and addon ->> 'status' = 'confirmed'
        and jsonb_typeof(addon -> 'durationDaysDelta') = 'number'
        and coalesce(addon ->> 'durationDaysDelta', '') ~ '^[0-9]{1,4}$');
end;
$$;

revoke all on function public.get_workspace_revision_view(text) from public;
grant execute on function public.get_workspace_revision_view(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
