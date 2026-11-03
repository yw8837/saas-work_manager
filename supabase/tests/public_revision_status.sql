-- 고객 링크 조회(get_workspace_revision_view)의 완료 화면·요청 목록을 확인한다(migration 20261103120000).
-- 가짜 사용자·가짜 문서만 쓰고, 끝에서 예외로 모두 되돌린다.
do $test$
declare
  owner_a uuid := gen_random_uuid();
  token_active text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_done text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_off text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_old text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_new text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_archived text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  view_row record;
  row_count integer;
begin
  begin
    insert into auth.users (id, raw_user_meta_data) values (owner_a, '{}'::jsonb);
    insert into public.workspace_documents(owner_id, state) values (owner_a, jsonb_build_object(
      'version', 2, 'packages', '[]'::jsonb, 'options', '[]'::jsonb, 'settings', '{}'::jsonb,
      'jobs', jsonb_build_array(
        -- 진행 중: 고객 요청 4건(대기·완료·추가 작업·반려) + 작업자 수동 기록 1건
        jsonb_build_object(
          'id', 'job-active', 'title', '카페 모라 · Standard 홈페이지', 'revisionPortalToken', token_active,
          'status', 'active', 'revisionPortalEnabled', true, 'revisionLimit', 2, 'amount', 990000,
          'revisions', jsonb_build_array(
            jsonb_build_object('id', 'r1', 'source', 'public', 'clientLabel', '김담당', 'body', '첫 요청', 'status', 'done', 'usage', 'used', 'sequence', 1, 'submittedAt', '2026-11-01T01:00:00.000Z', 'completedAt', '2026-11-01T05:00:00.000Z'),
            jsonb_build_object('id', 'r2', 'source', 'public', 'body', '범위 밖 요청', 'status', 'extra_scope', 'usage', 'extra_scope', 'submittedAt', '2026-11-01T02:00:00.000Z'),
            jsonb_build_object('id', 'r3', 'source', 'public', 'body', '질문', 'status', 'void', 'usage', 'pending', 'submittedAt', '2026-11-01T03:00:00.000Z', 'revertedAt', '2026-11-01T04:00:00.000Z', 'revertReason', '작업자만 보는 반려 사유'),
            jsonb_build_object('id', 'm1', 'source', 'manual', 'channel', 'kakao', 'body', '작업자 수동 메모', 'status', 'new', 'usage', 'pending', 'submittedAt', '2026-11-01T03:30:00.000Z'),
            jsonb_build_object('id', 'r4', 'source', 'public', 'body', '  최근 요청  ', 'status', 'new', 'usage', 'pending', 'submittedAt', '2026-11-01T06:00:00.000Z')
          )
        ),
        -- 링크를 켠 채 완료
        jsonb_build_object(
          'id', 'job-done', 'title', '완료 일감', 'revisionPortalToken', token_done, 'status', 'completed',
          'revisionPortalEnabled', true, 'revisionLimit', 1, 'completedAt', '2026-11-03T05:00:00.000Z',
          'revisions', '[]'::jsonb
        ),
        -- 링크를 끈 뒤 완료
        jsonb_build_object(
          'id', 'job-off', 'title', '끈 일감', 'revisionPortalToken', token_off, 'status', 'completed',
          'revisionPortalEnabled', false, 'revisionLimit', 1, 'completedAt', '2026-11-03T05:00:00.000Z',
          'revisions', '[]'::jsonb
        ),
        -- 재발급 뒤 완료(옛 토큰은 막혀야 한다)
        jsonb_build_object(
          'id', 'job-rotated', 'title', '재발급 일감', 'revisionPortalToken', token_new, 'status', 'completed',
          'revisionPortalEnabled', true, 'revisionLimit', 1, 'completedAt', '2026-11-03T05:00:00.000Z',
          'revisions', '[]'::jsonb
        ),
        -- 보관
        jsonb_build_object(
          'id', 'job-archived', 'title', '보관 일감', 'revisionPortalToken', token_archived, 'status', 'archived',
          'revisionPortalEnabled', true, 'revisionLimit', 1, 'revisions', '[]'::jsonb
        )
      )
    ));
    -- 앱은 진행 중이고 켠 링크만 enabled로 맞춘다(syncHostedRevisionPortals).
    insert into public.workspace_revision_portals(owner_id, job_key, token_hash, enabled) values
      (owner_a, 'job-active', encode(extensions.digest(token_active, 'sha256'), 'hex'), true),
      (owner_a, 'job-done', encode(extensions.digest(token_done, 'sha256'), 'hex'), false),
      (owner_a, 'job-off', encode(extensions.digest(token_off, 'sha256'), 'hex'), false),
      (owner_a, 'job-rotated', encode(extensions.digest(token_old, 'sha256'), 'hex'), false),
      (owner_a, 'job-archived', encode(extensions.digest(token_archived, 'sha256'), 'hex'), false);

    -- 1) 진행 중: 상태 active, 요청은 고객 링크 것만 최근 것부터, 상태 이름과 원문만.
    select * into view_row from public.get_workspace_revision_view(token_active);
    if view_row.job_status is distinct from 'active' or view_row.completed_at is not null then
      raise exception 'active_status_mismatch: % %', view_row.job_status, view_row.completed_at;
    end if;
    if view_row.requests <> jsonb_build_array(
      jsonb_build_object('status', 'pending', 'submittedAt', '2026-11-01T06:00:00.000Z', 'body', '최근 요청'),
      jsonb_build_object('status', 'rejected', 'submittedAt', '2026-11-01T03:00:00.000Z', 'body', '질문'),
      jsonb_build_object('status', 'extra', 'submittedAt', '2026-11-01T02:00:00.000Z', 'body', '범위 밖 요청'),
      jsonb_build_object('status', 'done', 'sequence', 1, 'submittedAt', '2026-11-01T01:00:00.000Z', 'body', '첫 요청')
    ) then
      raise exception 'requests_mismatch: %', view_row.requests;
    end if;
    if view_row.requests::text ~ '(작업자만 보는|김담당|작업자 수동 메모|990000|clientLabel|revertReason)' then
      raise exception 'requests_leak: %', view_row.requests;
    end if;

    -- 2) 링크를 켠 채 완료: 행이 나오고 상태 completed와 완료 시각을 준다.
    select * into view_row from public.get_workspace_revision_view(token_done);
    if view_row.job_key is distinct from 'job-done' or view_row.job_status is distinct from 'completed'
      or view_row.completed_at is distinct from '2026-11-03T05:00:00.000Z' then
      raise exception 'completed_view_mismatch: % % %', view_row.job_key, view_row.job_status, view_row.completed_at;
    end if;

    -- 3) 링크를 끈 뒤 완료, 재발급 전 옛 토큰, 보관 일감, 가짜 토큰은 아무것도 안 준다.
    select count(*) into row_count from public.get_workspace_revision_view(token_off);
    if row_count <> 0 then raise exception 'disabled_completed_visible'; end if;
    select count(*) into row_count from public.get_workspace_revision_view(token_old);
    if row_count <> 0 then raise exception 'rotated_token_visible'; end if;
    select count(*) into row_count from public.get_workspace_revision_view(token_new);
    if row_count <> 0 then raise exception 'unregistered_token_visible'; end if;
    select count(*) into row_count from public.get_workspace_revision_view(token_archived);
    if row_count <> 0 then raise exception 'archived_visible'; end if;
    select count(*) into row_count from public.get_workspace_revision_view(repeat('a', 43));
    if row_count <> 0 then raise exception 'fake_token_visible'; end if;

    -- 4) 진행 중인 일감이라도 포털이 꺼져 있으면(작업자가 끔) 안 보인다.
    update public.workspace_revision_portals set enabled = false where job_key = 'job-active';
    select count(*) into row_count from public.get_workspace_revision_view(token_active);
    if row_count <> 0 then raise exception 'disabled_active_visible'; end if;

    -- 5) 완료된 링크로는 여전히 제출할 수 없다.
    begin
      perform public.submit_workspace_revision_request(token_done, '완료 뒤 요청', null, gen_random_uuid());
      raise exception 'completed_submit_accepted';
    exception when sqlstate '22023' then null;
    end;

    -- 6) 권한: 익명은 조회만, 테이블은 못 읽는다.
    if not has_function_privilege('anon', 'public.get_workspace_revision_view(text)', 'execute')
      or not has_function_privilege('authenticated', 'public.get_workspace_revision_view(text)', 'execute')
      or has_table_privilege('anon', 'public.workspace_documents', 'select') then
      raise exception 'privilege_mismatch';
    end if;

    raise exception 'public_revision_status_ok';
  exception when others then
    if sqlerrm <> 'public_revision_status_ok' then raise; end if;
  end;
end;
$test$;
