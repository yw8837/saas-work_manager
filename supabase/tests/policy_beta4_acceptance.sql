-- 정책 버전 2026-11-03-beta.4(베타 이용 코드 14일 문구)의 동의 기록을 확인한다(migration 20261103160000).
-- 새 버전으로는 가입·동의가 되고, 옛 버전(2026-08-24-beta.3)으로는 거절되는지, 기존 가입자는 다시 동의해야 하는지 본다.
-- 가짜 사용자만 쓰고, 끝에서 예외로 모두 되돌린다.
do $test$
declare
  existing_user uuid := gen_random_uuid();
  new_user uuid := gen_random_uuid();
  stale_signup uuid := gen_random_uuid();
  accepted timestamptz;
  row_count integer;
  contract jsonb;
begin
  begin
    -- 1) 기존 가입자: beta.3 동의 기록만 있다 → 앱이 찾는 beta.4 기록은 없다(다시 동의 화면).
    insert into auth.users (id, raw_user_meta_data) values (existing_user, '{}'::jsonb);
    insert into public.policy_acceptances (owner_id, terms_version, privacy_version, source)
    values (existing_user, '2026-08-24-beta.3', '2026-08-24-beta.3', 'in_app');
    select count(*) into row_count from public.policy_acceptances
    where owner_id = existing_user and terms_version = '2026-11-03-beta.4' and privacy_version = '2026-11-03-beta.4';
    if row_count <> 0 then raise exception 'existing_user_already_on_beta4'; end if;

    -- 2) 옛 버전 동의는 거절된다(22023 outdated_policy_version).
    perform set_config('request.jwt.claim.sub', existing_user::text, true);
    begin
      perform public.accept_current_policies('2026-08-24-beta.3', '2026-08-24-beta.3');
      raise exception 'stale_version_accepted';
    exception when sqlstate '22023' then
      if sqlerrm <> 'outdated_policy_version' then raise; end if;
    end;
    -- 버전이 섞여도 거절된다.
    begin
      perform public.accept_current_policies('2026-11-03-beta.4', '2026-08-24-beta.3');
      raise exception 'mixed_version_accepted';
    exception when sqlstate '22023' then
      if sqlerrm <> 'outdated_policy_version' then raise; end if;
    end;

    -- 3) 새 버전 동의는 기록되고, 옛 기록은 그대로 남는다(증빙 보존).
    accepted := public.accept_current_policies('2026-11-03-beta.4', '2026-11-03-beta.4');
    if accepted is null then raise exception 'beta4_acceptance_missing'; end if;
    select count(*) into row_count from public.policy_acceptances
    where owner_id = existing_user and terms_version = '2026-11-03-beta.4' and source = 'in_app';
    if row_count <> 1 then raise exception 'beta4_in_app_row_count: %', row_count; end if;
    select count(*) into row_count from public.policy_acceptances
    where owner_id = existing_user and terms_version = '2026-08-24-beta.3';
    if row_count <> 1 then raise exception 'beta3_evidence_lost'; end if;
    -- 같은 동의를 다시 눌러도 첫 시각을 돌려주고 행이 늘지 않는다.
    if public.accept_current_policies('2026-11-03-beta.4', '2026-11-03-beta.4') <> accepted then
      raise exception 'repeat_acceptance_changed_time';
    end if;

    -- 4) 새 가입자(Google 로그인 직후, 기록 없음)도 새 버전으로 동의가 된다.
    insert into auth.users (id, raw_user_meta_data) values (new_user, '{}'::jsonb);
    perform set_config('request.jwt.claim.sub', new_user::text, true);
    if public.accept_current_policies('2026-11-03-beta.4', '2026-11-03-beta.4') is null then
      raise exception 'new_user_beta4_missing';
    end if;

    -- 5) 로그인 없이는 거절된다.
    perform set_config('request.jwt.claim.sub', '', true);
    begin
      perform public.accept_current_policies('2026-11-03-beta.4', '2026-11-03-beta.4');
      raise exception 'anonymous_acceptance_allowed';
    exception when sqlstate '42501' then
      if sqlerrm <> 'authentication_required' then raise; end if;
    end;

    -- 6) 가입 메타데이터 트리거: 새 버전만 'signup'으로 남기고, 옛 버전 메타데이터는 남기지 않는다.
    insert into auth.users (id, raw_user_meta_data) values (gen_random_uuid(), jsonb_build_object(
      'ilgamcheck_policy_accepted', true,
      'ilgamcheck_terms_version', '2026-11-03-beta.4',
      'ilgamcheck_privacy_version', '2026-11-03-beta.4'
    ));
    select count(*) into row_count from public.policy_acceptances
    where source = 'signup' and terms_version = '2026-11-03-beta.4';
    if row_count <> 1 then raise exception 'signup_trigger_beta4_count: %', row_count; end if;
    insert into auth.users (id, raw_user_meta_data) values (stale_signup, jsonb_build_object(
      'ilgamcheck_policy_accepted', true,
      'ilgamcheck_terms_version', '2026-08-24-beta.3',
      'ilgamcheck_privacy_version', '2026-08-24-beta.3'
    ));
    select count(*) into row_count from public.policy_acceptances where owner_id = stale_signup;
    if row_count <> 0 then raise exception 'signup_trigger_recorded_stale'; end if;

    -- 7) 공개 계약 함수가 새 버전을 돌려준다(앱 /api/health가 이 값과 manifest를 비교).
    contract := public.get_ilgamcheck_policy_publication_contract();
    if contract ->> 'termsVersion' <> '2026-11-03-beta.4'
      or contract ->> 'privacyVersion' <> '2026-11-03-beta.4'
      or (contract ->> 'finalized')::boolean is distinct from false then
      raise exception 'publication_contract_mismatch: %', contract;
    end if;

    -- 7-1) 다시 동의 화면용 조회: 로그인 사용자(authenticated)가 기존 select 권한·RLS만으로
    --      본인의 모든 버전 기록을 읽고, 남의 기록은 못 읽는다(새 권한 없음).
    perform set_config('request.jwt.claim.sub', existing_user::text, true);
    execute 'set local role authenticated';
    select count(*) into row_count from public.policy_acceptances;
    if row_count <> 2 then
      execute 'reset role';
      raise exception 'own_rows_visible_count: %', row_count;
    end if;
    select count(*) into row_count from public.policy_acceptances where owner_id <> existing_user;
    execute 'reset role';
    if row_count <> 0 then raise exception 'other_rows_visible: %', row_count; end if;

    -- 8) 권한은 그대로: 동의 RPC는 로그인 사용자만, 트리거 함수는 아무도 직접 실행 못 한다.
    if has_function_privilege('anon', 'public.accept_current_policies(text,text)', 'execute')
      or not has_function_privilege('authenticated', 'public.accept_current_policies(text,text)', 'execute')
      or has_function_privilege('anon', 'public.record_signup_policy_acceptance()', 'execute')
      or has_function_privilege('authenticated', 'public.record_signup_policy_acceptance()', 'execute')
      or not has_function_privilege('anon', 'public.get_ilgamcheck_policy_publication_contract()', 'execute') then
      raise exception 'policy_privilege_changed';
    end if;

    raise exception 'policy_beta4_ok';
  exception when others then
    if sqlerrm <> 'policy_beta4_ok' then raise; end if;
  end;
end;
$test$;
