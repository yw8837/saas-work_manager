-- 받은 곳별 떼이는 비율: 일감의 feeRate와 설정의 feeRates가 작업공간 문서(JSON)에 그대로 저장·복원되고,
-- 고객 링크 제출(서버가 문서를 고치는 경로)에도 지워지지 않으며, 고객 조회에는 나가지 않는지 확인한다.
-- 가짜 사용자·가짜 문서만 쓰고, 끝에서 예외로 모두 되돌린다.
do $test$
declare
  owner_a uuid := gen_random_uuid();
  token_a text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  next_state jsonb;
  current_version bigint;
  stored jsonb;
  view_row record;
begin
  begin
    insert into auth.users (id, raw_user_meta_data) values (owner_a, '{}'::jsonb);
    insert into public.workspace_documents(owner_id, state) values (owner_a, jsonb_build_object(
      'version', 2, 'packages', '[]'::jsonb, 'options', '[]'::jsonb,
      'settings', jsonb_build_object('feeRates', jsonb_build_object('kmong', 20)),
      'jobs', jsonb_build_array(jsonb_build_object(
        'id', 'job-x1', 'title', '로고', 'revisionPortalToken', token_a, 'status', 'active',
        'revisionPortalEnabled', true, 'revisionLimit', 1, 'revisions', '[]'::jsonb,
        'source', 'kmong', 'amount', 1410000, 'estimatedCost', 95000, 'margin', 1033000, 'feeRate', 20
      ))
    ));
    insert into public.workspace_revision_portals(owner_id, job_key, token_hash)
      values (owner_a, 'job-x1', encode(extensions.digest(token_a, 'sha256'), 'hex'));

    -- 1) 작업자 저장(save_workspace_document)은 새 칸을 거르지 않는다.
    perform set_config('request.jwt.claim.sub', owner_a::text, true);
    select jsonb_set(
        jsonb_set(state, '{jobs,0,feeRate}', '15.5'),
        '{settings,feeRates}', '{"kmong":15.5,"soomgo":10}'),
      document_version into next_state, current_version
    from public.workspace_documents where owner_id = owner_a;
    perform public.save_workspace_document(next_state, current_version, gen_random_uuid());
    select state into stored from public.workspace_documents where owner_id = owner_a;
    if stored -> 'jobs' -> 0 -> 'feeRate' <> '15.5'::jsonb
      or stored -> 'settings' -> 'feeRates' <> '{"kmong":15.5,"soomgo":10}'::jsonb then
      raise exception 'owner_save_dropped_fee_fields: %', stored;
    end if;

    -- 2) 고객 링크 제출은 수정 기록만 붙이고 떼이는 비율 칸은 그대로 둔다.
    perform public.submit_workspace_revision_request(token_a, '메인 문구를 바꿔 주세요', null, gen_random_uuid());
    select state into stored from public.workspace_documents where owner_id = owner_a;
    if jsonb_array_length(stored -> 'jobs' -> 0 -> 'revisions') <> 1
      or stored -> 'jobs' -> 0 -> 'feeRate' <> '15.5'::jsonb
      or stored -> 'jobs' -> 0 -> 'margin' <> '1033000'::jsonb
      or stored -> 'settings' -> 'feeRates' <> '{"kmong":15.5,"soomgo":10}'::jsonb then
      raise exception 'public_submit_dropped_fee_fields: %', stored;
    end if;

    -- 3) 고객 조회 결과에는 금액·비율·받은 곳이 없다.
    select * into view_row from public.get_workspace_revision_view(token_a);
    if to_jsonb(view_row)::text ~* '(fee|15\.5|1410000|kmong|margin|amount)' then
      raise exception 'public_view_leaked_fee: %', to_jsonb(view_row);
    end if;

    raise sqlstate 'Z0001' using message = 'rollback_synthetic_fixtures';
  exception when sqlstate 'Z0001' then
    null;
  end;
  if exists(select 1 from auth.users where id = owner_a) then
    raise exception 'synthetic_fixture_rollback_failed';
  end if;
end;
$test$;
select 'PASS: fee fields survive owner save and public submit, not exposed in public view, rollback' as result;
