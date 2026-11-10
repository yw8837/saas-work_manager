-- 고객 요청이 남아 있는 계정도 탈퇴(auth.users 삭제)가 끝까지 지워지는지 확인한다.
-- 요청 행이 포털 행을 참조하므로 연쇄 삭제 순서에 따라 막힐 수 있다는 보안 검토 지적(2026-11-11)을 시험으로 고정한다.
-- 가짜 사용자만 쓰고, 끝에서 예외로 모두 되돌린다.
do $test$
declare
  v_owner uuid := gen_random_uuid();
  v_portal uuid;
  left_rows integer;
begin
  begin
    insert into auth.users (id, raw_user_meta_data) values (v_owner, '{}'::jsonb);
    insert into public.profiles (id) values (v_owner) on conflict (id) do nothing;
    insert into public.workspace_revision_portals (owner_id, job_key, token_hash)
    values (v_owner, 'job_delete_test', repeat('a', 64))
    returning id into v_portal;
    insert into public.workspace_revision_requests (
      portal_id, owner_id, job_key, idempotency_key, request_hash, body, usage, document_version
    ) values (
      v_portal, v_owner, 'job_delete_test', gen_random_uuid(), repeat('b', 64), '로고 색을 바꿔 주세요.', 'pending', 1
    );

    delete from auth.users where id = v_owner;

    select (select count(*) from public.profiles where id = v_owner)
         + (select count(*) from public.workspace_revision_portals where owner_id = v_owner and job_key = 'job_delete_test')
         + (select count(*) from public.workspace_revision_requests where job_key = 'job_delete_test')
      into left_rows;
    if left_rows <> 0 then raise exception 'account_delete_left_rows: %', left_rows; end if;

    raise exception 'account_delete_rollback';
  exception when others then
    if sqlerrm <> 'account_delete_rollback' then raise; end if;
  end;
end
$test$;
