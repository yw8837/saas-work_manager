-- 고객 링크 조회에 확정된 추가 작업의 건수와 늘어난 기간을 더한 것을 확인한다(migration 20261117120000).
-- 금액·원가·추가 작업 이름은 내보내지 않는다. 초안·취소한 추가 작업은 세지 않는다.
-- 가짜 사용자·가짜 문서만 쓰고, 끝에서 예외로 모두 되돌린다.
do $test$
declare
  v_owner uuid := gen_random_uuid();
  token_addons text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_none text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_broken text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  view_row record;
  view_json text;
begin
  begin
    insert into auth.users (id, raw_user_meta_data) values (v_owner, '{}'::jsonb);
    insert into public.workspace_documents(owner_id, state) values (v_owner, jsonb_build_object(
      'version', 2, 'packages', '[]'::jsonb, 'options', '[]'::jsonb, 'settings', '{}'::jsonb,
      'jobs', jsonb_build_array(
        jsonb_build_object('id', 'job-addons', 'title', '추가 작업 있음', 'revisionPortalToken', token_addons, 'status', 'active',
          'revisionPortalEnabled', true, 'revisionLimit', 3, 'revisions', '[]'::jsonb,
          'addons', jsonb_build_array(
            jsonb_build_object('id', 'a1', 'title', '비밀 추가 작업 이름', 'amountDelta', 123456, 'estimatedCostDelta', 7777, 'durationDaysDelta', 2, 'status', 'confirmed'),
            jsonb_build_object('id', 'a2', 'title', '둘째', 'amountDelta', 50000, 'estimatedCostDelta', 0, 'durationDaysDelta', 3, 'status', 'confirmed'),
            jsonb_build_object('id', 'a3', 'title', '초안', 'amountDelta', 9000, 'estimatedCostDelta', 0, 'durationDaysDelta', 10, 'status', 'draft'),
            jsonb_build_object('id', 'a4', 'title', '취소', 'amountDelta', 9000, 'estimatedCostDelta', 0, 'durationDaysDelta', 20, 'status', 'cancelled'))),
        jsonb_build_object('id', 'job-none', 'title', '추가 작업 없음', 'revisionPortalToken', token_none, 'status', 'active',
          'revisionPortalEnabled', true, 'revisionLimit', 3, 'revisions', '[]'::jsonb),
        jsonb_build_object('id', 'job-broken', 'title', '모양이 틀린 추가 작업', 'revisionPortalToken', token_broken, 'status', 'active',
          'revisionPortalEnabled', true, 'revisionLimit', 3, 'revisions', '[]'::jsonb,
          'addons', jsonb_build_array(
            '"문자열"'::jsonb,
            jsonb_build_object('id', 'b1', 'status', 'confirmed', 'durationDaysDelta', '이틀'),
            jsonb_build_object('id', 'b2', 'status', 'confirmed', 'durationDaysDelta', -5),
            jsonb_build_object('id', 'b3', 'status', 'confirmed', 'durationDaysDelta', 99999999),
            jsonb_build_object('id', 'b5', 'status', 'confirmed', 'durationDaysDelta', '3'),
            jsonb_build_object('id', 'b6', 'status', 'confirmed', 'durationDaysDelta', 10000),
            jsonb_build_object('id', 'b4', 'status', 'confirmed', 'durationDaysDelta', 4)))
      )
    ));
    insert into public.workspace_revision_portals(owner_id, job_key, token_hash, enabled) values
      (v_owner, 'job-addons', encode(extensions.digest(token_addons, 'sha256'), 'hex'), true),
      (v_owner, 'job-none', encode(extensions.digest(token_none, 'sha256'), 'hex'), true),
      (v_owner, 'job-broken', encode(extensions.digest(token_broken, 'sha256'), 'hex'), true);

    select * into view_row from public.get_workspace_revision_view(token_addons);
    if view_row.addons_confirmed <> 2 then raise exception 'confirmed_count_wrong: %', view_row.addons_confirmed; end if;
    if view_row.addon_days <> 5 then raise exception 'confirmed_days_wrong: %', view_row.addon_days; end if;
    -- 금액·원가·추가 작업 이름이 어떤 열에도 실려 나가지 않는다.
    view_json := to_jsonb(view_row)::text;
    if view_json like '%123456%' or view_json like '%7777%' or view_json like '%비밀 추가 작업 이름%' then
      raise exception 'addon_private_fields_leaked: %', view_json;
    end if;

    select * into view_row from public.get_workspace_revision_view(token_none);
    if view_row.addons_confirmed <> 0 or view_row.addon_days <> 0 then
      raise exception 'no_addons_should_be_zero: % %', view_row.addons_confirmed, view_row.addon_days;
    end if;

    -- 모양이 틀린 값이 있어도 함수 전체가 깨지지 않는다. 숫자가 아니거나(글자 '3' 포함) 음수·10000일 이상인 기간은 더하지 않는다.
    select * into view_row from public.get_workspace_revision_view(token_broken);
    if view_row.addons_confirmed <> 6 then raise exception 'broken_count_wrong: %', view_row.addons_confirmed; end if;
    if view_row.addon_days <> 4 then raise exception 'broken_days_wrong: %', view_row.addon_days; end if;

    raise exception 'public_revision_addons_rollback';
  exception when others then
    if sqlerrm <> 'public_revision_addons_rollback' then raise; end if;
  end;
end
$test$;
