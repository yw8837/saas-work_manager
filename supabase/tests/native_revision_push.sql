-- Synthetic fixtures only; all mutations roll back. Runs on Postgres, including local Supabase.
begin;
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  installation uuid := gen_random_uuid(); device uuid; portal uuid; request uuid := gen_random_uuid();
  lease uuid; first_claim jsonb;
begin
  if has_table_privilege('authenticated','public.native_push_devices','select')
    or has_table_privilege('anon','public.native_revision_outbox','insert')
    or has_function_privilege('authenticated','public.claim_native_push_batch(integer)','execute')
    or has_function_privilege('authenticated','public.finish_native_push_attempt(uuid,uuid,uuid,text,text)','execute')
    or has_function_privilege('anon','public.register_native_push_device(uuid,text,text)','execute') then
    raise exception 'push_privilege_leak';
  end if;
  insert into auth.users(id,email) values (a,'native-a@example.test'),(b,'native-b@example.test');
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.register_native_push_device(installation,'android',repeat('a',140));
    raise exception 'unauthenticated_registration_allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',a::text,true);
  begin
    perform public.register_native_push_device(installation,'other',repeat('a',140));
    raise exception 'invalid_platform_allowed';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.register_native_push_device(installation,'android',repeat('a',4097));
    raise exception 'oversized_token_allowed';
  exception when invalid_parameter_value then null; end;
  perform public.register_native_push_device(installation,'android',repeat('a',140));
  select id into device from public.native_push_devices where installation_id=installation;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.revoke_native_push_device(installation);
  if not exists(select 1 from public.native_push_devices where id=device and enabled and owner_id=a) then
    raise exception 'cross_owner_revoke';
  end if;
  insert into public.workspace_revision_portals(owner_id,job_key,token_hash)
    values(a,'job-native',repeat('b',64)) returning id into portal;
  insert into public.workspace_revision_requests(id,portal_id,owner_id,job_key,idempotency_key,request_hash,body,usage,document_version)
    values(request,portal,a,'job-native',gen_random_uuid(),repeat('c',64),'test only','used',1);
  if (select count(*) from public.native_revision_outbox where request_id=request) <> 1
    or (select count(*) from public.native_push_attempts where request_id=request) <> 1 then
    raise exception 'missing_outbox_or_attempt';
  end if;
  select to_jsonb(c) into first_claim from public.claim_native_push_batch(10) c where c.request_id=request;
  if first_claim is null then raise exception 'claim_missing'; end if;
  if exists(select 1 from public.claim_native_push_batch(10) c where c.request_id=request) then
    raise exception 'lease_claimed_twice';
  end if;
  lease := (first_claim->>'lease_id')::uuid;
  perform public.finish_native_push_attempt(request,device,gen_random_uuid(),repeat('a',140),'sent');
  if exists(select 1 from public.native_push_attempts where request_id=request and status='sent') then
    raise exception 'stale_lease_acknowledged';
  end if;
  perform public.finish_native_push_attempt(request,device,lease,repeat('a',140),'retry');
  if not exists(select 1 from public.native_push_attempts where request_id=request and status='pending' and attempts=1 and next_attempt_at>now()) then
    raise exception 'retry_not_scheduled';
  end if;
  -- Account switch on this installation invalidates old device IDs and attempts.
  perform public.register_native_push_device(installation,'android',repeat('a',140));
  if exists(select 1 from public.native_push_devices where id=device)
    or exists(select 1 from public.native_push_attempts where device_id=device) then
    raise exception 'old_account_device_retained';
  end if;
  delete from public.workspace_revision_requests where id=request;
  if exists(select 1 from public.native_revision_outbox where request_id=request) then
    raise exception 'deleted_request_outbox_retained';
  end if;
  delete from auth.users where id=b;
  if exists(select 1 from public.native_push_devices where owner_id=b) then
    raise exception 'deleted_account_device_retained';
  end if;
end;
$test$;
do $rotation$
declare
  owner uuid := gen_random_uuid(); installation uuid := gen_random_uuid();
  device uuid; portal uuid; request uuid := gen_random_uuid();
  claimed jsonb; old_lease uuid;
begin
  insert into auth.users(id,email) values(owner,'native-rotation@example.test');
  perform set_config('request.jwt.claim.sub',owner::text,true);
  perform public.register_native_push_device(installation,'android',repeat('old',50));
  select id into device from public.native_push_devices where installation_id=installation;
  insert into public.workspace_revision_portals(owner_id,job_key,token_hash)
    values(owner,'job-rotation',repeat('d',64)) returning id into portal;
  insert into public.workspace_revision_requests(id,portal_id,owner_id,job_key,idempotency_key,request_hash,body,usage,document_version)
    values(request,portal,owner,'job-rotation',gen_random_uuid(),repeat('e',64),'rotation fixture','used',1);
  select to_jsonb(c) into claimed from public.claim_native_push_batch(10) c where c.request_id=request;
  old_lease := (claimed->>'lease_id')::uuid;
  perform public.register_native_push_device(installation,'android',repeat('new',50));
  if public.is_native_push_claim_current(request,device,old_lease,repeat('old',50)) then
    raise exception 'rotated_token_still_current';
  end if;
  perform public.finish_native_push_attempt(request,device,old_lease,repeat('old',50),'invalid');
  if not exists(select 1 from public.native_push_devices where id=device and enabled and token=repeat('new',50)) then
    raise exception 'stale_invalid_ack_disabled_new_token';
  end if;
  if not exists(select 1 from public.native_push_attempts where request_id=request and status='pending') then
    raise exception 'rotated_notification_not_requeued';
  end if;
  select to_jsonb(c) into claimed from public.claim_native_push_batch(10) c where c.request_id=request;
  if claimed->>'token' is distinct from repeat('new',50) then
    raise exception 'retry_did_not_use_new_token';
  end if;
  perform public.finish_native_push_attempt(request,device,old_lease,repeat('old',50),'invalid');
  if not exists(select 1 from public.native_push_devices where id=device and enabled) then
    raise exception 'old_lease_disabled_current_token';
  end if;
  perform public.finish_native_push_attempt(request,device,(claimed->>'lease_id')::uuid,repeat('new',50),'invalid');
  if exists(select 1 from public.native_push_devices where id=device and enabled) then
    raise exception 'current_invalid_token_not_disabled';
  end if;
end;
$rotation$;
rollback;
