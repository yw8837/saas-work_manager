-- Applied via Supabase migration API at 2026-09-26T14:19:10Z.
-- Remove customer revision data atomically when its workspace job is deleted.
-- Do not purge historical unrelated orphans or change accounting/entitlement ledgers.
-- Public submission and portal registration use document -> portal lock order.

create or replace function public.submit_workspace_revision_request(
  p_token text,
  p_body text,
  p_client_label text,
  p_idempotency_key uuid
)
returns table(
  request_id uuid,
  usage text,
  sequence integer,
  submitted_at timestamptz,
  remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_portal public.workspace_revision_portals%rowtype;
  v_existing public.workspace_revision_requests%rowtype;
  v_document public.workspace_documents%rowtype;
  v_hash text;
  v_request_hash text;
  v_now timestamptz := clock_timestamp();
  v_local_date date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_job jsonb;
  v_job_index integer;
  v_limit integer;
  v_used integer;
  v_usage text;
  v_sequence integer;
  v_revision_id uuid := gen_random_uuid();
  v_revision jsonb;
  v_state jsonb;
  v_next_version bigint;
begin
  if coalesce(char_length(p_token), 0) not between 43 and 128
    or p_token !~ '^[A-Za-z0-9_-]+$'
    or coalesce(char_length(trim(p_body)), 0) not between 2 and 4000
    or coalesce(char_length(trim(p_client_label)), 0) > 100
    or p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'invalid_revision_request';
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_request_hash := encode(extensions.digest(trim(p_body) || '|' || coalesce(trim(p_client_label), ''), 'sha256'), 'hex');

  select portal.* into v_portal
  from public.workspace_revision_portals as portal
  where portal.token_hash = v_hash and portal.enabled;
  if not found then
    raise exception using errcode = '22023', message = 'invalid_revision_link';
  end if;

  -- The workspace document is the canonical token source. Lock and verify it
  -- before returning an idempotent receipt so a rotated token is immediately
  -- invalid even if the portal-hash synchronization call has not completed.
  select document.* into v_document
  from public.workspace_documents as document
  where document.owner_id = v_portal.owner_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'workspace_not_found';
  end if;

  -- Use the same document -> portal lock order as deletion and registration.
  -- Revalidate after acquiring the document lock; the initial lookup was only
  -- used to discover the owner and may have raced with deletion or rotation.
  select portal.* into v_portal
  from public.workspace_revision_portals as portal
  where portal.token_hash = v_hash and portal.enabled
    and portal.owner_id = v_document.owner_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'invalid_revision_link';
  end if;

  select (ordinality - 1)::integer, job into v_job_index, v_job
  from jsonb_array_elements(v_document.state -> 'jobs') with ordinality as entries(job, ordinality)
  where job ->> 'id' = v_portal.job_key
  limit 1;
  if v_job is null
    or v_job ->> 'revisionPortalToken' <> p_token
    or v_job ->> 'status' <> 'active'
    or not coalesce((v_job ->> 'revisionPortalEnabled')::boolean, false) then
    raise exception using errcode = '22023', message = 'invalid_revision_link';
  end if;

  select request.* into v_existing
  from public.workspace_revision_requests as request
  where request.portal_id = v_portal.id
    and request.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return query select
      v_existing.id,
      v_existing.usage,
      v_existing.sequence,
      v_existing.submitted_at,
      greatest(0, coalesce((select summary.remaining from public.get_workspace_revision_summary(p_token) as summary), 0));
    return;
  end if;

  if v_portal.last_submission_at is not null
    and v_now < v_portal.last_submission_at + interval '3 seconds' then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;
  if v_portal.hourly_window_started_at is null
    or v_now >= v_portal.hourly_window_started_at + interval '1 hour' then
    v_portal.hourly_window_started_at := v_now;
    v_portal.hourly_count := 0;
  end if;
  if v_portal.daily_window_date is distinct from v_local_date then
    v_portal.daily_window_date := v_local_date;
    v_portal.daily_count := 0;
  end if;
  if v_portal.hourly_count >= 20 or v_portal.daily_count >= 100 then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  v_limit := greatest(coalesce((v_job ->> 'revisionLimit')::integer, 0), 0);
  select count(*)::integer into v_used
  from jsonb_array_elements(coalesce(v_job -> 'revisions', '[]'::jsonb)) as revision
  where revision ->> 'usage' = 'used'
    and not (revision ? 'revertedAt');
  v_usage := case when v_used < v_limit then 'used' else 'extra_scope' end;
  v_sequence := case when v_usage = 'used' then v_used + 1 else null end;

  v_revision := jsonb_strip_nulls(jsonb_build_object(
    'id', v_revision_id::text,
    'jobId', v_portal.job_key,
    'source', 'public',
    'clientLabel', nullif(trim(p_client_label), ''),
    'body', trim(p_body),
    'status', case when v_usage = 'used' then 'new' else 'extra_scope' end,
    'usage', v_usage,
    'sequence', v_sequence,
    'submittedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));

  v_job := jsonb_set(
    v_job,
    '{revisions}',
    coalesce(v_job -> 'revisions', '[]'::jsonb) || jsonb_build_array(v_revision),
    true
  );
  v_job := jsonb_set(v_job, '{updatedAt}', to_jsonb(to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), true);
  v_state := jsonb_set(v_document.state, array['jobs', v_job_index::text], v_job, false);
  perform public.validate_workspace_state(v_state);
  v_next_version := v_document.document_version + 1;

  update public.workspace_documents as document
  set state = v_state, document_version = v_next_version, updated_at = v_now
  where document.owner_id = v_portal.owner_id;

  insert into public.workspace_revision_requests (
    id, portal_id, owner_id, job_key, idempotency_key, request_hash,
    client_label, body, usage, sequence, document_version, submitted_at
  ) values (
    v_revision_id, v_portal.id, v_portal.owner_id, v_portal.job_key,
    p_idempotency_key, v_request_hash, nullif(trim(p_client_label), ''),
    trim(p_body), v_usage, v_sequence, v_next_version, v_now
  );

  update public.workspace_revision_portals as portal
  set last_submission_at = v_now,
      hourly_window_started_at = v_portal.hourly_window_started_at,
      hourly_count = v_portal.hourly_count + 1,
      daily_window_date = v_portal.daily_window_date,
      daily_count = v_portal.daily_count + 1,
      updated_at = v_now
  where portal.id = v_portal.id;

  return query select
    v_revision_id,
    v_usage,
    v_sequence,
    v_now,
    greatest(v_limit - (v_used + case when v_usage = 'used' then 1 else 0 end), 0);
end;
$$;

create or replace function public.register_workspace_revision_portal(
  p_job_key text,
  p_raw_token text,
  p_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_hash text;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if coalesce(char_length(p_job_key), 0) not between 1 and 120
    or coalesce(char_length(p_raw_token), 0) not between 43 and 128
    or p_raw_token !~ '^[A-Za-z0-9_-]+$' then
    raise exception using errcode = '22023', message = 'invalid_portal_input';
  end if;

  -- Serialize with job deletion before checking whether registration is valid.
  perform 1 from public.workspace_documents as document
  where document.owner_id = v_owner
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'workspace_job_not_found';
  end if;

  perform 1
  from public.workspace_documents as document,
    lateral jsonb_array_elements(document.state -> 'jobs') as job
  where document.owner_id = v_owner
    and job ->> 'id' = p_job_key
    and job ->> 'revisionPortalToken' = p_raw_token;
  if not found then
    raise exception using errcode = '22023', message = 'workspace_job_not_found';
  end if;

  v_hash := encode(extensions.digest(p_raw_token, 'sha256'), 'hex');
  insert into public.workspace_revision_portals (
    owner_id, job_key, token_hash, enabled, updated_at
  ) values (
    v_owner, p_job_key, v_hash, coalesce(p_enabled, true), clock_timestamp()
  )
  on conflict (owner_id, job_key) do update
  set token_hash = excluded.token_hash,
      enabled = excluded.enabled,
      hourly_window_started_at = case
        when public.workspace_revision_portals.token_hash = excluded.token_hash
          then public.workspace_revision_portals.hourly_window_started_at
        else null
      end,
      hourly_count = case
        when public.workspace_revision_portals.token_hash = excluded.token_hash
          then public.workspace_revision_portals.hourly_count
        else 0
      end,
      daily_window_date = case
        when public.workspace_revision_portals.token_hash = excluded.token_hash
          then public.workspace_revision_portals.daily_window_date
        else null
      end,
      daily_count = case
        when public.workspace_revision_portals.token_hash = excluded.token_hash
          then public.workspace_revision_portals.daily_count
        else 0
      end,
      last_submission_at = case
        when public.workspace_revision_portals.token_hash = excluded.token_hash
          then public.workspace_revision_portals.last_submission_at
        else null
      end,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.purge_deleted_workspace_job_revisions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_jobs text[];
begin
  select array_agg(old_job ->> 'id') into removed_jobs
  from jsonb_array_elements(old.state -> 'jobs') as old_job
  where not exists (
    select 1 from jsonb_array_elements(new.state -> 'jobs') as new_job
    where new_job ->> 'id' = old_job ->> 'id'
  );
  if coalesce(cardinality(removed_jobs),0) = 0 then
    return new;
  end if;

  -- The request FK is RESTRICT, so delete evidence before deleting its portal.
  -- Only jobs removed by this exact update, for this owner, are in scope.
  delete from public.workspace_revision_requests
  where owner_id = new.owner_id and job_key = any(removed_jobs);
  delete from public.workspace_revision_portals
  where owner_id = new.owner_id and job_key = any(removed_jobs);
  return new;
end;
$$;

revoke all on function public.purge_deleted_workspace_job_revisions() from public, anon, authenticated;

create trigger purge_deleted_workspace_job_revisions
  after update of state on public.workspace_documents
  for each row
  when (old.state -> 'jobs' is distinct from new.state -> 'jobs')
  execute function public.purge_deleted_workspace_job_revisions();

-- Keep the explicit role contract after redefining the existing RPCs.
revoke execute on function public.register_workspace_revision_portal(text,text,boolean) from public, anon;
grant execute on function public.register_workspace_revision_portal(text,text,boolean) to authenticated;
grant execute on function public.submit_workspace_revision_request(text,text,text,uuid) to anon, authenticated;

notify pgrst, 'reload schema';
