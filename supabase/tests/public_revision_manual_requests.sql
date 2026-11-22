-- 고객 링크 조회의 요청 목록에 작업자가 직접 적은 요청이 들어가는지 확인한다(migration 20261118120000).
-- 직접 적은 요청은 원문 없이 받은 경로(정해진 값)만, 고객 링크 요청은 지금처럼 원문까지 담는다.
-- 되돌린 직접 기록은 담지 않고(20건도 뺀 뒤에 센다), 되돌린 고객 링크 요청은 지금처럼 '반려'로 담는다.
-- 정렬은 앱의 toISOString 모양(YYYY-MM-DDTHH:MM:SS.sssZ)만 시각으로 보고, 그 밖의 모양(+09:00, 밀리초 없음)은 문서 순서로 뒤에 둔다.
-- 직접 적은 요청의 원문·금액·원가·추가 작업 이름·고객 이름·참고 링크·반려 사유는 어떤 열에도 실려 나가지 않는다.
-- 가짜 사용자·가짜 문서만 쓰고, 끝에서 예외로 모두 되돌린다.
do $test$
declare
  v_owner uuid := gen_random_uuid();
  token_mixed text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_many text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_manual_only text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_reverted_only text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_tz text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  view_row record;
  view_json text;
  v_many jsonb := '[]'::jsonb;
  v_secret text;
  i integer;
begin
  begin
    -- 많은 요청: 1~25일에 하루 한 건씩, 5로 나눈 나머지가 0·3인 날(10건)은 직접 적은 요청.
    -- 문서에는 25일 것부터 거꾸로 적어, 20건을 문서 순서가 아니라 접수 시각으로 고르는지 본다.
    -- 직접 적은 요청 가운데 23·18일 것은 잘못 적어 되돌린 기록이다. 빼고 나서 20건을 세면 4일 것까지 들어온다.
    for i in reverse 25..1 loop
      v_many := v_many || jsonb_build_array(jsonb_build_object(
        'id', 'many-' || i,
        'source', case when i % 5 in (0, 3) then 'manual' else 'public' end,
        'channel', 'phone',
        'body', '요청 ' || i,
        'status', 'new', 'usage', 'pending', 'sequence', null,
        'submittedAt', '2026-11-' || lpad(i::text, 2, '0') || 'T01:00:00.000Z')
        || case when i in (23, 18) then jsonb_build_object('status', 'void', 'revertedAt', '2026-11-26T01:00:00.000Z') else '{}'::jsonb end);
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
            -- 고객 링크 요청에 channel이 들어 있어도(정해진 값이든 아니든) 밖으로 나가지 않는다.
            jsonb_build_object('id', 'p1', 'source', 'public', 'channel', 'kakao', 'clientLabel', '고객이름비밀', 'referenceUrl', 'https://secret.example/ref',
              'body', '첫 고객 요청', 'status', 'done', 'usage', 'used', 'sequence', 1, 'submittedAt', '2026-11-10T01:00:00.000Z'),
            jsonb_build_object('id', 'm1', 'source', 'manual', 'channel', 'kakao', 'clientLabel', '수동이름비밀',
              'body', '비밀 메모 김사장 010-9999-8888', 'status', 'done', 'usage', 'used', 'sequence', 2, 'submittedAt', '2026-11-12T03:00:00.000Z'),
            -- 정해진 값이 아닌 경로(글자가 섞임)는 other로 바뀌어야 한다.
            jsonb_build_object('id', 'm2', 'source', 'manual', 'channel', '카톡 김사장 010-1234-5678',
              'body', '두 번째 메모', 'status', 'new', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-13T03:00:00.000Z'),
            -- 경로가 없는 옛 기록도 other.
            jsonb_build_object('id', 'm3', 'source', 'manual',
              'body', '셋째 메모', 'status', 'extra_scope', 'usage', 'extra_scope', 'sequence', null, 'submittedAt', '2026-11-14T03:00:00.000Z'),
            -- 잘못 적어 되돌린 직접 기록은 목록에서 빠진다(가장 늦게 접수됐어도).
            jsonb_build_object('id', 'm4', 'source', 'manual', 'channel', 'phone',
              'body', '되돌린 메모', 'status', 'void', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-15T03:00:00.000Z',
              'revertedAt', '2026-11-15T04:00:00.000Z', 'revertReason', '작업자만 보는 반려 사유'),
            jsonb_build_object('id', 'p2', 'source', 'public', 'channel', '링크채널비밀',
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
        ),
        -- 직접 기록이 되돌린 것 하나뿐인 일감: 고객 링크 요청(되돌림 = 반려)만 남아 화면 제목은 '남기신 요청'이 된다.
        jsonb_build_object(
          'id', 'job-reverted-only', 'title', '되돌린 기록만 있는 일감', 'revisionPortalToken', token_reverted_only, 'status', 'active',
          'revisionPortalEnabled', true, 'revisionLimit', 2,
          'revisions', jsonb_build_array(
            jsonb_build_object('id', 'q1', 'source', 'public',
              'body', '고객이 남긴 질문', 'status', 'void', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-17T01:00:00.000Z',
              'revertedAt', '2026-11-17T02:00:00.000Z', 'revertReason', '질문이라 대화창으로 답함'),
            jsonb_build_object('id', 'q2', 'source', 'manual', 'channel', 'kakao',
              'body', '다른 일감 것을 잘못 적음', 'status', 'void', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-18T01:00:00.000Z',
              'revertedAt', '2026-11-18T01:05:00.000Z', 'revertReason', '잘못 적음'))
        ),
        -- Z가 아닌 시간대 표기(+09:00)·밀리초 없는 시각이 섞인 일감. 글자 비교로는 t1이 가장 늦어 보이지만,
        -- 정렬에는 .sssZ 모양만 쓰므로 t4·t2가 앞이고 t1·t3은 문서 순서(나중 것 먼저)로 뒤에 붙는다. 표시용 시각은 직전 판처럼 그대로 내보낸다.
        jsonb_build_object(
          'id', 'job-tz', 'title', '시간대가 섞인 일감', 'revisionPortalToken', token_tz, 'status', 'active',
          'revisionPortalEnabled', true, 'revisionLimit', 5,
          'revisions', jsonb_build_array(
            jsonb_build_object('id', 't1', 'source', 'public',
              'body', '시간대 붙은 요청', 'status', 'new', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-20T01:00:00.000+09:00'),
            jsonb_build_object('id', 't2', 'source', 'manual', 'channel', 'soomgo',
              'body', '숨고 메모', 'status', 'new', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-10T01:00:00.000Z'),
            jsonb_build_object('id', 't3', 'source', 'public',
              'body', '밀리초 없는 요청', 'status', 'new', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-05T01:00:00Z'),
            jsonb_build_object('id', 't4', 'source', 'public',
              'body', '보통 요청', 'status', 'new', 'usage', 'pending', 'sequence', null, 'submittedAt', '2026-11-12T01:00:00.000Z'))
        )
      )
    ));
    insert into public.workspace_revision_portals(owner_id, job_key, token_hash, enabled) values
      (v_owner, 'job-mixed', encode(extensions.digest(token_mixed, 'sha256'), 'hex'), true),
      (v_owner, 'job-many', encode(extensions.digest(token_many, 'sha256'), 'hex'), true),
      (v_owner, 'job-manual-only', encode(extensions.digest(token_manual_only, 'sha256'), 'hex'), true),
      (v_owner, 'job-reverted-only', encode(extensions.digest(token_reverted_only, 'sha256'), 'hex'), true),
      (v_owner, 'job-tz', encode(extensions.digest(token_tz, 'sha256'), 'hex'), true);

    -- 1) 섞인 목록: 접수 시각이 늦은 것부터. 직접 적은 요청은 원문 없이 source·channel만, 고객 링크 요청은 지금 모양 그대로.
    -- 되돌린 직접 기록(m4)은 없고, 고객 링크 요청(p1·p2)에 있던 channel도 없다.
    select * into view_row from public.get_workspace_revision_view(token_mixed);
    if view_row.requests <> jsonb_build_array(
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
      '비밀 추가 작업', 'clientLabel', 'revertReason', 'referenceUrl', 'amount', '링크채널비밀', 'phone', 'revertedAt'
    ] loop
      if strpos(view_json, v_secret) > 0 then
        raise exception 'manual_private_field_leaked: % in %', v_secret, view_json;
      end if;
    end loop;

    -- 3) 많으면 접수 시각이 늦은 것부터 20건. 되돌린 직접 기록(23·18일)을 뺀 뒤에 세므로 25일~4일이다.
    -- 그 가운데 직접 적은 요청 7건(25·20·15·13·10·8·5일)에는 원문이 없고, '반려'로 보이는 줄은 없다.
    select * into view_row from public.get_workspace_revision_view(token_many);
    if jsonb_array_length(view_row.requests) <> 20 then
      raise exception 'many_limit_mismatch: %', jsonb_array_length(view_row.requests);
    end if;
    if view_row.requests -> 0 ->> 'submittedAt' <> '2026-11-25T01:00:00.000Z'
      or view_row.requests -> 19 ->> 'submittedAt' <> '2026-11-04T01:00:00.000Z' then
      raise exception 'many_order_mismatch: %', view_row.requests;
    end if;
    if exists (
      select 1 from jsonb_array_elements(view_row.requests) as entry
      where entry ->> 'status' = 'rejected'
        or entry ->> 'submittedAt' in ('2026-11-23T01:00:00.000Z', '2026-11-18T01:00:00.000Z')
    ) then
      raise exception 'many_reverted_manual_listed: %', view_row.requests;
    end if;
    if (select count(*) from jsonb_array_elements(view_row.requests) as entry where entry ->> 'source' = 'manual') <> 7
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

    -- 5) 되돌린 직접 기록만 있으면 목록에 직접 기록이 하나도 없다(화면 제목은 '남기신 요청 1건').
    -- 고객 링크 요청은 되돌려도 지금처럼 '반려'로 보인다. 반려 사유·잘못 적은 원문은 나가지 않는다.
    select * into view_row from public.get_workspace_revision_view(token_reverted_only);
    if view_row.requests <> jsonb_build_array(
      jsonb_build_object('status', 'rejected', 'submittedAt', '2026-11-17T01:00:00.000Z', 'body', '고객이 남긴 질문')
    ) then
      raise exception 'reverted_only_mismatch: %', view_row.requests;
    end if;
    if strpos(to_jsonb(view_row)::text, '잘못 적') > 0 or strpos(to_jsonb(view_row)::text, '대화창으로 답함') > 0 then
      raise exception 'reverted_only_leaked: %', to_jsonb(view_row);
    end if;

    -- 6) Z가 아닌 시간대·밀리초 없는 시각은 정렬에서 문서 순서(나중 것 먼저)로 뒤에 간다. 표시용 시각은 그대로 내보낸다.
    select * into view_row from public.get_workspace_revision_view(token_tz);
    if view_row.requests <> jsonb_build_array(
      jsonb_build_object('status', 'pending', 'submittedAt', '2026-11-12T01:00:00.000Z', 'body', '보통 요청'),
      jsonb_build_object('status', 'pending', 'submittedAt', '2026-11-10T01:00:00.000Z', 'source', 'manual', 'channel', 'soomgo'),
      jsonb_build_object('status', 'pending', 'submittedAt', '2026-11-05T01:00:00Z', 'body', '밀리초 없는 요청'),
      jsonb_build_object('status', 'pending', 'submittedAt', '2026-11-20T01:00:00.000+09:00', 'body', '시간대 붙은 요청')
    ) then
      raise exception 'tz_order_mismatch: %', view_row.requests;
    end if;

    -- 7) 권한은 그대로: 익명·로그인 사용자는 조회 함수만, 문서 테이블은 못 읽는다.
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
