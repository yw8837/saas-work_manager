-- 수정 횟수는 '수정 완료' 때 쓴다: 고객 링크 제출은 확인 대기(pending)로만 기록되는지 확인한다.
-- 가짜 사용자·가짜 문서만 쓰고, 끝에서 예외로 모두 되돌린다.
do $test$
declare
  owner_a uuid := gen_random_uuid();
  token_a text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  first_key uuid := gen_random_uuid();
  receipt record;
  replay record;
  view_row record;
  next_state jsonb;
  current_version bigint;
  portal_id uuid;
begin
  begin
    insert into auth.users (id, raw_user_meta_data) values (owner_a, '{}'::jsonb);
    insert into public.workspace_documents(owner_id, state) values (owner_a, jsonb_build_object(
      'version', 2, 'packages', '[]'::jsonb, 'options', '[]'::jsonb, 'settings', '{}'::jsonb,
      'jobs', jsonb_build_array(jsonb_build_object(
        'id', 'job-pending', 'title', '로고', 'revisionPortalToken', token_a, 'status', 'active',
        'revisionPortalEnabled', true, 'revisionLimit', 1, 'revisions', '[]'::jsonb,
        'intakeItems', jsonb_build_array(
          jsonb_build_object('id', 'i1', 'label', '로고 원본 파일'),
          jsonb_build_object('id', 'i2', 'label', '브랜드 색상', 'receivedAt', '2026-11-01T00:00:00.000Z'),
          jsonb_build_object('id', 'i3', 'label', '   ')
        )
      ))
    ));
    insert into public.workspace_revision_portals(owner_id, job_key, token_hash)
      values (owner_a, 'job-pending', encode(extensions.digest(token_a, 'sha256'), 'hex'))
      returning id into portal_id;

    -- 1) 제출은 확인 대기로만 기록하고 남은 횟수를 줄이지 않는다.
    select * into receipt from public.submit_workspace_revision_request(token_a, '메인 문구를 바꿔 주세요', '김담당', first_key);
    if receipt.usage <> 'pending' or receipt.sequence is not null or receipt.remaining <> 1 then
      raise exception 'submit_not_pending: % % %', receipt.usage, receipt.sequence, receipt.remaining;
    end if;
    if not exists (
      select 1 from public.workspace_documents, lateral jsonb_array_elements(state -> 'jobs' -> 0 -> 'revisions') as revision
      where owner_id = owner_a and revision ->> 'usage' = 'pending' and revision ->> 'status' = 'new' and not (revision ? 'sequence')
    ) then
      raise exception 'document_revision_not_pending';
    end if;
    if (select usage from public.workspace_revision_requests where id = receipt.request_id) <> 'pending' then
      raise exception 'ledger_not_pending';
    end if;

    -- 2) 같은 키로 다시 보내면 같은 영수증(확인 대기)을 돌려준다.
    select * into replay from public.submit_workspace_revision_request(token_a, '메인 문구를 바꿔 주세요', '김담당', first_key);
    if replay.request_id <> receipt.request_id or replay.usage <> 'pending' or replay.remaining <> 1 then
      raise exception 'idempotent_replay_changed';
    end if;

    -- 3) 두 번째 요청도 대기로 쌓인다(3초 간격 제한은 시험에서만 앞당긴다).
    update public.workspace_revision_portals set last_submission_at = now() - interval '5 seconds' where id = portal_id;
    perform public.submit_workspace_revision_request(token_a, '두 번째 이미지도 밝게', null, gen_random_uuid());

    -- 4) 고객 조회: 대기 2건, 사용 0, 남음 1, 아직 안 받은 자료는 이름만(빈 이름·받은 항목 제외).
    select * into view_row from public.get_workspace_revision_view(token_a);
    if view_row.pending_requests <> 2 or view_row.used <> 0 or view_row.remaining <> 1
      or view_row.intake_pending <> '["로고 원본 파일"]'::jsonb or not view_row.has_open_revision then
      raise exception 'view_mismatch: % % % %', view_row.pending_requests, view_row.used, view_row.remaining, view_row.intake_pending;
    end if;

    -- 5) 작업자가 첫 요청을 '수정 완료'로 저장하면 그때 1회가 빠진다.
    perform set_config('request.jwt.claim.sub', owner_a::text, true);
    select jsonb_set(jsonb_set(jsonb_set(state, '{jobs,0,revisions,0,usage}', '"used"'), '{jobs,0,revisions,0,status}', '"done"'), '{jobs,0,revisions,0,sequence}', '1'),
      document_version into next_state, current_version
    from public.workspace_documents where owner_id = owner_a;
    perform public.save_workspace_document(next_state, current_version, gen_random_uuid());
    select * into view_row from public.get_workspace_revision_view(token_a);
    if view_row.pending_requests <> 1 or view_row.used <> 1 or view_row.remaining <> 0 then
      raise exception 'completion_not_counted: % % %', view_row.pending_requests, view_row.used, view_row.remaining;
    end if;

    -- 6) 원장 usage는 정해진 값만 받는다.
    begin
      insert into public.workspace_revision_requests(portal_id, owner_id, job_key, idempotency_key, request_hash, body, usage, document_version)
      values (portal_id, owner_a, 'job-pending', gen_random_uuid(), repeat('a', 64), '잘못된 값', 'consumed', 1);
      raise exception 'ledger_accepted_unknown_usage';
    exception when check_violation then null;
    end;

    -- 7) 익명 권한은 그대로: 제출·조회 함수만 실행할 수 있다.
    if not has_function_privilege('anon', 'public.get_workspace_revision_view(text)', 'execute')
      or not has_function_privilege('anon', 'public.submit_workspace_revision_request(text,text,text,uuid)', 'execute')
      or has_table_privilege('anon', 'public.workspace_revision_requests', 'insert') then
      raise exception 'anon_privilege_changed';
    end if;

    raise exception 'revision_pending_ok';
  exception when others then
    if sqlerrm <> 'revision_pending_ok' then raise; end if;
  end;
end;
$test$;
