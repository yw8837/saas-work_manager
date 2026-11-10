-- 범용 코드 BETA2026만 Pro 기간을 열고, 닫은 KMONG2026·SOOMGO2026은 거절되는지 확인한다(migration 20261103170000).
-- 가짜 사용자만 쓰고, 끝에서 예외로 모두 되돌린다.
do $test$
declare
  owner_id uuid := gen_random_uuid();
  result record;
begin
  begin
    insert into auth.users (id, raw_user_meta_data) values (owner_id, '{}'::jsonb);
    insert into public.profiles (id) values (owner_id) on conflict (id) do nothing;
    perform set_config('request.jwt.claim.sub', owner_id::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id)::text, true);

    select * into result from public.redeem_invite_code('KMONG2026');
    if result.status <> 'invalid' then raise exception 'kmong_code_still_open: %', result.status; end if;
    select * into result from public.redeem_invite_code(' soomgo2026 ');
    if result.status <> 'invalid' then raise exception 'soomgo_code_still_open: %', result.status; end if;

    select * into result from public.redeem_invite_code('beta2026');
    if result.status = 'invalid' or result.ends_at is null then raise exception 'beta_code_closed: %', result.status; end if;

    raise exception 'single_beta_code_rollback';
  exception when others then
    if sqlerrm <> 'single_beta_code_rollback' then raise; end if;
  end;
end
$test$;
