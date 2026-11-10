-- 2026-11-11 점검 반영(migration 20261103180000)을 확인한다.
-- 1) 고객 화면의 열린 요청은 확인 대기(pending)만 센다. 수정 완료(used)만 남은 일감은 '열린 요청 없음'이다.
-- 2) 확인 대기 중인 고객 요청이 30건이면 새 요청을 'pending_request_limit'로 거절하고, 29건이면 받는다.
-- 가짜 사용자·가짜 문서만 쓰고, 끝에서 예외로 모두 되돌린다.
do $test$
declare
  v_owner uuid := gen_random_uuid();
  token_used text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_pending text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_full text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_almost text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  pending_30 jsonb;
  pending_29 jsonb;
  view_row record;
  receipt record;
begin
  begin
    select jsonb_agg(jsonb_build_object('id', 'p' || n, 'source', 'public', 'body', '요청 ' || n, 'status', 'new', 'usage', 'pending', 'submittedAt', '2026-11-01T01:00:00.000Z'))
      into pending_30 from generate_series(1, 30) as n;
    select jsonb_agg(jsonb_build_object('id', 'q' || n, 'source', 'public', 'body', '요청 ' || n, 'status', 'new', 'usage', 'pending', 'submittedAt', '2026-11-01T01:00:00.000Z'))
      into pending_29 from generate_series(1, 29) as n;

    insert into auth.users (id, raw_user_meta_data) values (v_owner, '{}'::jsonb);
    insert into public.workspace_documents(owner_id, state) values (v_owner, jsonb_build_object(
      'version', 2, 'packages', '[]'::jsonb, 'options', '[]'::jsonb, 'settings', '{}'::jsonb,
      'jobs', jsonb_build_array(
        jsonb_build_object('id', 'job-used', 'title', '수정 완료만', 'revisionPortalToken', token_used, 'status', 'active',
          'revisionPortalEnabled', true, 'revisionLimit', 3,
          'revisions', jsonb_build_array(jsonb_build_object('id', 'u1', 'source', 'public', 'body', '첫 요청', 'status', 'done', 'usage', 'used', 'sequence', 1, 'submittedAt', '2026-11-01T01:00:00.000Z'))),
        jsonb_build_object('id', 'job-pending', 'title', '확인 대기 있음', 'revisionPortalToken', token_pending, 'status', 'active',
          'revisionPortalEnabled', true, 'revisionLimit', 3,
          'revisions', jsonb_build_array(jsonb_build_object('id', 'w1', 'source', 'public', 'body', '대기 요청', 'status', 'new', 'usage', 'pending', 'submittedAt', '2026-11-01T01:00:00.000Z'))),
        jsonb_build_object('id', 'job-full', 'title', '대기 30건', 'revisionPortalToken', token_full, 'status', 'active',
          'revisionPortalEnabled', true, 'revisionLimit', 3, 'revisions', pending_30),
        jsonb_build_object('id', 'job-almost', 'title', '대기 29건', 'revisionPortalToken', token_almost, 'status', 'active',
          'revisionPortalEnabled', true, 'revisionLimit', 3, 'revisions', pending_29)
      )
    ));
    insert into public.workspace_revision_portals(owner_id, job_key, token_hash, enabled) values
      (v_owner, 'job-used', encode(extensions.digest(token_used, 'sha256'), 'hex'), true),
      (v_owner, 'job-pending', encode(extensions.digest(token_pending, 'sha256'), 'hex'), true),
      (v_owner, 'job-full', encode(extensions.digest(token_full, 'sha256'), 'hex'), true),
      (v_owner, 'job-almost', encode(extensions.digest(token_almost, 'sha256'), 'hex'), true);

    select * into view_row from public.get_workspace_revision_view(token_used);
    if view_row.has_open_revision then raise exception 'used_only_should_not_be_open'; end if;
    select * into view_row from public.get_workspace_revision_view(token_pending);
    if not view_row.has_open_revision then raise exception 'pending_should_be_open'; end if;

    begin
      perform * from public.submit_workspace_revision_request(token_full, '31번째 요청', null, gen_random_uuid());
      raise exception 'pending_limit_not_enforced';
    exception when others then
      if sqlerrm <> 'pending_request_limit' then raise; end if;
    end;

    select * into receipt from public.submit_workspace_revision_request(token_almost, '30번째 요청', null, gen_random_uuid());
    if receipt.usage <> 'pending' then raise exception 'almost_full_should_accept: %', receipt.usage; end if;

    raise exception 'review_hardening_rollback';
  exception when others then
    if sqlerrm <> 'review_hardening_rollback' then raise; end if;
  end;
end
$test$;
