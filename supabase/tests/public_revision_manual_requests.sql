-- 고객 링크 조회의 요청 목록에 작업자가 직접 적은 요청이 들어가는지 확인한다(migration 20261118120000).
-- 직접 적은 요청은 원문 없이 받은 경로(정해진 값)만, 고객 링크 요청은 지금처럼 원문까지 담는다.
-- 직접 적은 요청의 원문·금액·원가·추가 작업 이름·고객 이름·참고 링크·반려 사유는 어떤 열에도 실려 나가지 않는다.
-- 가짜 사용자·가짜 문서만 쓰고, 끝에서 예외로 모두 되돌린다.
do $test$
declare
  v_owner uuid := gen_random_uuid();
  token_mixed text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_many text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_manual_only text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  view_row record;
  view_json text;
  v_many jsonb := '[]'::jsonb;
  v_secret text;
  i integer;
begin
  begin
    -- 많은 요청: 1~25일에 하루 한 건씩, 5로 나눈 나머지가 0·3인 날(10건)은 직접 적은 요청.
    -- 문서에는 25일 것부터 거꾸로 적어, 20건을 문서 순서가 아니라 접수 시각으로 고르는지 본다.
    for i in reverse 25..1 loop
      v_many := v_many || jsonb_build_array(jsonb_build_object(
        'id', 'many-' || i,
        'source', case when i % 5 in (0, 3) then 'manual' else 'public' end,
        'channel', 'phone',
        'body', '요청 ' || i,
        'status', 'new', 'usage', 'pending', 'sequence', null,
        'submittedAt', '2026-11-' || lpad(i::text, 2, '0') || 'T01:00:00.000Z'));
    end loop;

    insert into auth.users (id, raw_user_meta_data) values (v_owner, '{}'::jsonb);
    insert into public.workspace_documents(owner_id, state) values (v_owner, jsonb_build_object(
      'version', 2, 'packages', '[]'::jsonb, 'options', '[]'::jsonb, 'settings', '{}'::jsonb,
      'jobs', jsonb_build_array(
        jsonb_build_object(
          'id', 'job-mixed', 'title', '일감 제목', 'clientLabel', '고객사비밀', 'amount', 990000,
          'revisionPortalToken', token_mixed, 'status', 'active', 'revisionPortalEnabled', true, 'revisionLimit', 3,
          'addons', jsonb_build_array(
            jsonb_build_object('id', 'a1', 'title', '비밀 추가 작업', 'amountDelta', 123456, 'estimatedCostDelta', 7777, 'durationDaysDelta', 2, 'status', 'confirmed')),
          -- 문서에 적힌 순서와 접수 시각 순서가 다르다(p2는 늦게 합쳐졌지만 m1보다 먼저 접수됨).
          'revisions', jsonb_build_array(
            jsonb_build_object('id', 'p1', 'source', 'public', 'clientLabel', '고객이름비밀', 'referenceUrl', 'https://secret.example/ref',
              'body', '첫 고객 요청', 'status', 'done', 'usage', 'used', 'sequence', 1, 'submittedAt', '2026-11-10T01:00:00.000Z'),
            jsonb_build_object('id', 'm1', 'source', 'manual', 'channel', 'kakao', 'clientLabel', '수동이름비밀',
              'body', '비밀 메모 김사장 010-9999-8888', 'status', 'done', 'usage', 'used', 'sequence', 2, 'submittedAt', '2026-11-12T03:00:00.000Z'),
            -- 정해진 값이 아닌 경로(글자가 섞임)는 other로 바뀌어야 한다.
            jsonb_build_object('id', 'm2', 'source', 'manual', 'channel', '카톡 김사장 010-1234-5678',
              'body', '두 번째 메모', 'status', 'new', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-13T03:00:00.000Z'),
            -- 경로가 없는 옛 기록도 other.
            jsonb_build_object('id', 'm3', 'source', 'manual',
              'body', '셋째 메모', 'status', 'extra_scope', 'usage', 'extra_scope', 'sequence', null, 'submittedAt', '2026-11-14T03:00:00.000Z'),
            jsonb_build_object('id', 'm4', 'source', 'manual', 'channel', 'phone',
              'body', '되돌린 메모', 'status', 'void', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-15T03:00:00.000Z',
              'revertedAt', '2026-11-15T04:00:00.000Z', 'revertReason', '작업자만 보는 반려 사유'),
            jsonb_build_object('id', 'p2', 'source', 'public',
              'body', '  나중에 합쳐진 고객 요청  ', 'status', 'new', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-11T05:00:00.000Z'),
            -- 원문이 빈 기록과 모르는 출처는 목록에서 뺀다.
            jsonb_build_object('id', 'm5', 'source', 'manual', 'channel', 'kakao',
              'body', '   ', 'status', 'new', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-16T03:00:00.000Z'),
            jsonb_build_object('id', 'x1', 'source', 'import',
              'body', '모르는 출처', 'status', 'new', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-16T04:00:00.000Z'),
            -- 접수 시각 형식이 틀린 기록은 시각 없이 맨 뒤로 간다.
            jsonb_build_object('id', 'm6', 'source', 'manual', 'channel', 'instagram',
              'body', '날짜 형식 틀림', 'status', 'new', 'usage', 'pending', 'sequence', null, 'submittedAt', 'yesterday')
          )
        ),
        jsonb_build_object(
          'id', 'job-many', 'title', '요청 많은 일감', 'revisionPortalToken', token_many, 'status', 'active',
          'revisionPortalEnabled', true, 'revisionLimit', 30, 'revisions', v_many
        ),
        -- 고객이 링크를 한 번도 안 쓰고 카톡으로만 말한 일감.
        jsonb_build_object(
          'id', 'job-manual-only', 'title', '카톡만 쓴 일감', 'revisionPortalToken', token_manual_only, 'status', 'active',
          'revisionPortalEnabled', true, 'revisionLimit', 2,
          'revisions', jsonb_build_array(
            jsonb_build_object('id', 'k1', 'source', 'manual', 'channel', 'kakao',
              'body', '카톡으로 받은 메모', 'status', 'new', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-18T01:00:00.000Z'))
        )
      )
    ));
    insert into public.workspace_revision_portals(owner_id, job_key, token_hash, enabled) values
      (v_owner, 'job-mixed', encode(extensions.digest(token_mixed, 'sha256'), 'hex'), true),
      (v_owner, 'job-many', encode(extensions.digest(token_many, 'sha256'), 'hex'), true),
      (v_owner, 'job-manual-only', encode(extensions.digest(token_manual_only, 'sha256'), 'hex'), true);

    -- 1) 섞인 목록: 접수 시각이 늦은 것부터. 직접 적은 요청은 원문 없이 source·channel만, 고객 링크 요청은 지금 모양 그대로.
    select * into view_row from public.get_workspace_revision_view(token_mixed);
    if view_row.requests <> jsonb_build_array(
      jsonb_build_object('status', 'rejected', 'submittedAt', '2026-11-15T03:00:00.000Z', 'source', 'manual', 'channel', 'phone'),
      jsonb_build_object('status', 'extra', 'submittedAt', '2026-11-14T03:00:00.000Z', 'source', 'manual', 'channel', 'other'),
      jsonb_build_object('status', 'pending', 'submittedAt', '2026-11-13T03:00:00.000Z', 'source', 'manual', 'channel', 'other'),
      jsonb_build_object('status', 'done', 'sequence', 2, 'submittedAt', '2026-11-12T03:00:00.000Z', 'source', 'manual', 'channel', 'kakao'),
      jsonb_build_object('status', 'pending', 'submittedAt', '2026-11-11T05:00:00.000Z', 'body', '나중에 합쳐진 고객 요청'),
      jsonb_build_object('status', 'done', 'sequence', 1, 'submittedAt', '2026-11-10T01:00:00.000Z', 'body', '첫 고객 요청'),
      jsonb_build_object('status', 'pending', 'source', 'manual', 'channel', 'instagram')
    ) then
      raise exception 'mixed_requests_mismatch: %', view_row.requests;
    end if;
    -- 횟수 계산은 그대로다. 직접 적은 요청도 수정 완료면 1회를 쓰고(p1·m1), 확인 대기는 출처와 상관없이 센다(m2·p2·m5·x1·m6).
    if view_row.used <> 2 or view_row.remaining <> 1 or view_row.pending_requests <> 5 then
      raise exception 'mixed_counts_mismatch: % % %', view_row.used, view_row.remaining, view_row.pending_requests;
    end if;

    -- 2) 직접 적은 요청의 원문·작업자 메모·금액·이름·참고 링크가 어떤 열에도 실려 나가지 않는다.
    view_json := to_jsonb(view_row)::text;
    foreach v_secret in array array[
      '비밀 메모', '김사장', '010-9999-8888', '010-1234-5678', '두 번째 메모', '셋째 메모', '되돌린 메모', '날짜 형식 틀림',
      '모르는 출처', '작업자만 보는', '고객이름비밀', '수동이름비밀', '고객사비밀', 'secret.example', '123456', '7777', '990000',
      '비밀 추가 작업', 'clientLabel', 'revertReason', 'referenceUrl', 'amount'
    ] loop
      if strpos(view_json, v_secret) > 0 then
        raise exception 'manual_private_field_leaked: % in %', v_secret, view_json;
      end if;
    end loop;

    -- 3) 많으면 접수 시각이 늦은 것부터 20건(25일~6일). 그 가운데 직접 적은 요청 8건에는 원문이 없다.
    select * into view_row from public.get_workspace_revision_view(token_many);
    if jsonb_array_length(view_row.requests) <> 20 then
      raise exception 'many_limit_mismatch: %', jsonb_array_length(view_row.requests);
    end if;
    if view_row.requests -> 0 ->> 'submittedAt' <> '2026-11-25T01:00:00.000Z'
      or view_row.requests -> 19 ->> 'submittedAt' <> '2026-11-06T01:00:00.000Z' then
      raise exception 'many_order_mismatch: %', view_row.requests;
    end if;
    if (select count(*) from jsonb_array_elements(view_row.requests) as entry where entry ->> 'source' = 'manual') <> 8
      or exists (select 1 from jsonb_array_elements(view_row.requests) as entry where entry ->> 'source' = 'manual' and entry ? 'body')
      or exists (select 1 from jsonb_array_elements(view_row.requests) as entry where entry ->> 'source' is null and not (entry ? 'body')) then
      raise exception 'many_manual_shape_mismatch: %', view_row.requests;
    end if;

    -- 4) 카톡으로만 말한 고객도 링크를 열면 기록이 보인다.
    select * into view_row from public.get_workspace_revision_view(token_manual_only);
    if view_row.requests <> jsonb_build_array(
      jsonb_build_object('status', 'pending', 'submittedAt', '2026-11-18T01:00:00.000Z', 'source', 'manual', 'channel', 'kakao')
    ) then
      raise exception 'manual_only_mismatch: %', view_row.requests;
    end if;

    -- 5) 권한은 그대로: 익명·로그인 사용자는 조회 함수만, 문서 테이블은 못 읽는다.
    if not has_function_privilege('anon', 'public.get_workspace_revision_view(text)', 'execute')
      or not has_function_privilege('authenticated', 'public.get_workspace_revision_view(text)', 'execute')
      or has_table_privilege('anon', 'public.workspace_documents', 'select') then
      raise exception 'privilege_mismatch';
    end if;

    raise exception 'public_revision_manual_requests_rollback';
  exception when others then
    if sqlerrm <> 'public_revision_manual_requests_rollback' then raise; end if;
  end;
end
$test$;
