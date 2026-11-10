-- 가입 유입 경로 기록(migration 20261103190000)을 확인한다.
-- 약관 동의가 끝난 새 계정에만 한 번 남고, 기존 계정·동의 전·형식이 틀린 값·로그인 없는 호출은 남지 않는지 본다.
-- 가짜 사용자만 쓰고, 끝에서 예외로 모두 되돌린다.
do $test$
declare
  new_user uuid := gen_random_uuid();
  old_user uuid := gen_random_uuid();
  no_consent_user uuid := gen_random_uuid();
  messy_user uuid := gen_random_uuid();
  row_count integer;
  saved record;
begin
  begin
    insert into auth.users (id, raw_user_meta_data) values
      (new_user, '{}'::jsonb), (old_user, '{}'::jsonb), (no_consent_user, '{}'::jsonb), (messy_user, '{}'::jsonb);
    insert into public.profiles (id) values (new_user), (old_user), (no_consent_user), (messy_user) on conflict (id) do nothing;
    update auth.users set created_at = now() - interval '3 days' where id = old_user;
    update public.profiles set created_at = now() - interval '3 days' where id = old_user;
    insert into public.policy_acceptances (owner_id, terms_version, privacy_version, source) values
      (new_user, '2026-11-11-beta.5', '2026-11-11-beta.5', 'in_app'),
      (old_user, '2026-11-11-beta.5', '2026-11-11-beta.5', 'in_app'),
      (messy_user, '2026-11-11-beta.5', '2026-11-11-beta.5', 'in_app');

    -- 1) 로그인 없이는 거절된다.
    perform set_config('request.jwt.claim.sub', '', true);
    begin
      perform public.record_signup_source('mail', 'email', 'cold1');
      raise exception 'anonymous_source_allowed';
    exception when sqlstate '42501' then
      if sqlerrm <> 'authentication_required' then raise; end if;
    end;

    -- 2) 새 계정: 형식이 틀린 값은 남지 않고(메일 주소·빈 값·41자), 맞는 값은 한 번만 남는다.
    perform set_config('request.jwt.claim.sub', new_user::text, true);
    if public.record_signup_source('someone@example.com', null, null) then raise exception 'email_like_source_saved'; end if;
    if public.record_signup_source('', null, null) then raise exception 'empty_source_saved'; end if;
    if public.record_signup_source(null, null, null) then raise exception 'null_source_saved'; end if;
    if public.record_signup_source(repeat('a', 41), null, null) then raise exception 'long_source_saved'; end if;
    -- 전화번호처럼 숫자가 6자리 이상 이어지는 값도 남지 않는다.
    if public.record_signup_source('01012345678', null, null) then raise exception 'phone_like_source_saved'; end if;
    if not public.record_signup_source(' Mail ', 'Email', 'cold-1') then raise exception 'new_user_source_not_saved'; end if;
    select * into saved from public.signup_sources where owner_id = new_user;
    if saved.source <> 'mail' or saved.medium <> 'email' or saved.campaign <> 'cold-1' then
      raise exception 'saved_values_mismatch: % % %', saved.source, saved.medium, saved.campaign;
    end if;
    -- 두 번째 호출은 덮어쓰지 않는다(처음 경로 유지).
    if public.record_signup_source('blog', null, null) then raise exception 'second_source_saved'; end if;
    select count(*) into row_count from public.signup_sources where owner_id = new_user and source = 'mail';
    if row_count <> 1 then raise exception 'first_source_overwritten'; end if;

    -- 3) medium·campaign만 형식이 틀리면 그 값만 비우고 남긴다.
    perform set_config('request.jwt.claim.sub', messy_user::text, true);
    if not public.record_signup_source('kmong', 'a@b.c', 'to-01012345678') then raise exception 'messy_user_source_not_saved'; end if;
    select * into saved from public.signup_sources where owner_id = messy_user;
    if saved.source <> 'kmong' or saved.medium is not null or saved.campaign is not null then
      raise exception 'messy_values_not_cleared';
    end if;

    -- 4) 가입한 지 하루가 넘은 기존 계정은 남지 않는다.
    perform set_config('request.jwt.claim.sub', old_user::text, true);
    if public.record_signup_source('mail', null, null) then raise exception 'old_user_source_saved'; end if;
    -- 본인이 고칠 수 있는 profiles.created_at을 지금으로 바꿔도 새 계정으로 보지 않는다.
    update public.profiles set created_at = now() where id = old_user;
    if public.record_signup_source('mail', null, null) then raise exception 'old_user_source_saved_after_profile_edit'; end if;

    -- 5) 약관 동의 기록이 없는 계정은 남지 않는다.
    perform set_config('request.jwt.claim.sub', no_consent_user::text, true);
    if public.record_signup_source('mail', null, null) then raise exception 'no_consent_source_saved'; end if;

    select count(*) into row_count from public.signup_sources where owner_id in (old_user, no_consent_user);
    if row_count <> 0 then raise exception 'unexpected_source_rows: %', row_count; end if;

    -- 6) 브라우저 역할은 표를 직접 읽지도 쓰지도 못한다(본인 행 포함).
    if has_table_privilege('anon', 'public.signup_sources', 'select')
      or has_table_privilege('authenticated', 'public.signup_sources', 'select')
      or has_table_privilege('authenticated', 'public.signup_sources', 'insert')
      or has_table_privilege('authenticated', 'public.signup_sources', 'update')
      or has_table_privilege('authenticated', 'public.signup_sources', 'delete') then
      raise exception 'signup_sources_table_open';
    end if;
    if not (select relrowsecurity from pg_class where oid = 'public.signup_sources'::regclass) then
      raise exception 'signup_sources_rls_off';
    end if;
    -- 정책이 하나도 없어야 한다(권한이 잘못 열려도 RLS가 모든 행을 막는다).
    select count(*) into row_count from pg_policies where schemaname = 'public' and tablename = 'signup_sources';
    if row_count <> 0 then raise exception 'signup_sources_has_policy: %', row_count; end if;
    if has_function_privilege('anon', 'public.record_signup_source(text,text,text)', 'execute')
      or not has_function_privilege('authenticated', 'public.record_signup_source(text,text,text)', 'execute') then
      raise exception 'record_signup_source_privilege';
    end if;

    -- 7) 계정을 지우면 유입 경로 기록도 같이 지워진다.
    delete from auth.users where id = messy_user;
    select count(*) into row_count from public.signup_sources where owner_id = messy_user;
    if row_count <> 0 then raise exception 'source_survived_account_delete'; end if;

    raise exception 'signup_source_rollback';
  exception when others then
    if sqlerrm <> 'signup_source_rollback' then raise; end if;
  end;
end
$test$;
