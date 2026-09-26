-- Transactional regression: uses only synthetic owners and always rolls back.
-- A missing cleanup trigger must fail with deleted_job_revision_data_retained.
do $test$
declare
  owner_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  token_a text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_keep text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  token_b text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  request_key uuid := gen_random_uuid();
  next_state jsonb;
  current_version bigint;
  portal record;
begin
  begin
    insert into auth.users (id, raw_user_meta_data) values (owner_a, '{}'::jsonb), (owner_b, '{}'::jsonb);
    insert into public.workspace_documents(owner_id, state) values
      (owner_a, '{"version":2,"packages":[],"options":[],"settings":{},"jobs":[{"id":"remove-me"},{"id":"keep-me"}]}'::jsonb),
      (owner_b, '{"version":2,"packages":[],"options":[],"settings":{},"jobs":[{"id":"remove-me"}]}'::jsonb);
    update public.workspace_documents set state=jsonb_set(state,'{jobs}',jsonb_build_array(
      jsonb_build_object('id','remove-me','revisionPortalToken',token_a,'status','active','revisionPortalEnabled',true,'revisionLimit',2,'revisions','[]'::jsonb),
      jsonb_build_object('id','keep-me','revisionPortalToken',token_keep,'status','active','revisionPortalEnabled',true,'revisionLimit',2,'revisions','[]'::jsonb)
    )) where owner_id=owner_a;
    update public.workspace_documents set state=jsonb_set(state,'{jobs}',jsonb_build_array(
      jsonb_build_object('id','remove-me','revisionPortalToken',token_b,'status','active','revisionPortalEnabled',true,'revisionLimit',2,'revisions','[]'::jsonb)
    )) where owner_id=owner_b;
    insert into public.workspace_revision_portals(owner_id,job_key,token_hash) values
      (owner_a,'remove-me',encode(extensions.digest(token_a,'sha256'),'hex')),
      (owner_a,'keep-me',encode(extensions.digest(token_keep,'sha256'),'hex')),
      (owner_a,'unrelated-historical-orphan',encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex')),
      (owner_b,'remove-me',encode(extensions.digest(token_b,'sha256'),'hex'));
    for portal in select * from public.workspace_revision_portals where owner_id in (owner_a,owner_b) loop
      insert into public.workspace_revision_requests(portal_id,owner_id,job_key,idempotency_key,request_hash,body,usage,document_version)
      values (portal.id,portal.owner_id,portal.job_key,gen_random_uuid(),repeat('a',64),'synthetic deletion regression','used',1);
    end loop;

    -- Editing a retained job must preserve every request.
    perform set_config('request.jwt.claim.sub',owner_a::text,true);
    select jsonb_set(state,'{jobs,0,title}','"edited"'), document_version into next_state,current_version
    from public.workspace_documents where owner_id=owner_a;
    perform public.save_workspace_document(next_state,current_version,gen_random_uuid());
    if (select count(*) from public.workspace_revision_requests where owner_id in(owner_a,owner_b)) <> 4 then
      raise exception 'ordinary_edit_removed_revision_data';
    end if;

    select jsonb_set(state,'{jobs}',jsonb_build_array(state->'jobs'->1)), document_version into next_state,current_version
    from public.workspace_documents where owner_id=owner_a;
    perform public.save_workspace_document(next_state,current_version,gen_random_uuid());
    if exists(select 1 from public.workspace_revision_requests where owner_id=owner_a and job_key='remove-me')
      or exists(select 1 from public.workspace_revision_portals where owner_id=owner_a and job_key='remove-me') then
      raise exception 'deleted_job_revision_data_retained';
    end if;
    if (select count(*) from public.workspace_revision_requests where owner_id in(owner_a,owner_b)) <> 3
      or (select count(*) from public.workspace_revision_portals where owner_id in(owner_a,owner_b)) <> 3 then
      raise exception 'cleanup_crossed_owner_or_job_boundary';
    end if;

    -- Same document save is idempotent, including historical unrelated rows.
    select state,document_version into next_state,current_version from public.workspace_documents where owner_id=owner_a;
    perform public.save_workspace_document(next_state,current_version,gen_random_uuid());
    if (select count(*) from public.workspace_revision_requests where owner_id in(owner_a,owner_b)) <> 3 then
      raise exception 'repeated_save_removed_unrelated_requests';
    end if;
    -- A retained portal still accepts public requests and idempotent replay.
    perform public.submit_workspace_revision_request(token_keep,'synthetic public request',null,request_key);
    perform public.submit_workspace_revision_request(token_keep,'synthetic public request',null,request_key);
    if (select count(*) from public.workspace_revision_requests where owner_id in(owner_a,owner_b)) <> 4 then
      raise exception 'retained_portal_or_idempotency_broken';
    end if;
    begin
      perform public.submit_workspace_revision_request(token_a,'deleted portal request',null,gen_random_uuid());
      raise exception 'deleted_portal_accepted_request';
    exception when sqlstate '22023' then null;
    end;
    begin
      perform public.register_workspace_revision_portal('remove-me',token_a,true);
      raise exception 'deleted_portal_reregistered';
    exception when sqlstate '22023' then null;
    end;
    raise sqlstate 'Z0001' using message='rollback_synthetic_fixtures';
  exception when sqlstate 'Z0001' then
    null;
  end;
  if exists(select 1 from auth.users where id in(owner_a,owner_b)) then
    raise exception 'synthetic_fixture_rollback_failed';
  end if;
end;
$test$;
select 'PASS: save RPC deletion, retained job, owner isolation, ordinary edit, repeated save, public submission/replay, deleted link rejection, rollback' as result;
