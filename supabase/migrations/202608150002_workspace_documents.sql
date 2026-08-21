-- 일감체크 MVP canonical workspace storage.
-- The normalized foundation remains available for later reporting, while this
-- document boundary preserves exact UI/domain parity for the first hosted beta.

create table public.workspace_documents (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  state jsonb not null,
  document_version bigint not null default 1 check (document_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_save_requests (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key uuid not null,
  request_hash text not null check (char_length(request_hash) = 64),
  result_version bigint not null check (result_version >= 1),
  created_at timestamptz not null default now(),
  primary key (owner_id, idempotency_key)
);

create table public.workspace_revision_portals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_key text not null check (char_length(job_key) between 1 and 120),
  token_hash text not null unique check (char_length(token_hash) = 64),
  enabled boolean not null default true,
  last_submission_at timestamptz,
  hourly_window_started_at timestamptz,
  hourly_count smallint not null default 0 check (hourly_count between 0 and 20),
  daily_window_date date,
  daily_count smallint not null default 0 check (daily_count between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, job_key),
  unique (id, owner_id)
);

create table public.workspace_revision_requests (
  id uuid primary key default gen_random_uuid(),
  portal_id uuid not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_key text not null,
  idempotency_key uuid not null,
  request_hash text not null check (char_length(request_hash) = 64),
  client_label text check (client_label is null or char_length(client_label) <= 100),
  body text not null check (char_length(body) between 2 and 4000),
  usage text not null check (usage in ('used', 'extra_scope')),
  sequence integer,
  document_version bigint not null,
  submitted_at timestamptz not null default now(),
  unique (portal_id, idempotency_key),
  foreign key (portal_id, owner_id)
    references public.workspace_revision_portals(id, owner_id) on delete restrict
);

create index workspace_revision_requests_owner_job_idx
  on public.workspace_revision_requests(owner_id, job_key, submitted_at desc);

create or replace function public.validate_workspace_state(p_state jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_state is null
    or jsonb_typeof(p_state) <> 'object'
    or p_state ->> 'version' <> '2'
    or jsonb_typeof(p_state -> 'packages') <> 'array'
    or jsonb_typeof(p_state -> 'options') <> 'array'
    or jsonb_typeof(p_state -> 'jobs') <> 'array'
    or jsonb_typeof(p_state -> 'settings') <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_workspace_state';
  end if;

  if pg_column_size(p_state) > 5242880
    or jsonb_array_length(p_state -> 'packages') > 500
    or jsonb_array_length(p_state -> 'options') > 1000
    or jsonb_array_length(p_state -> 'jobs') > 1000 then
    raise exception using errcode = '54000', message = 'workspace_state_too_large';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_state -> 'jobs') as job
    where jsonb_typeof(job) <> 'object'
      or coalesce(char_length(job ->> 'id'), 0) not between 1 and 120
      or coalesce(char_length(job ->> 'revisionPortalToken'), 0) not between 43 and 128
      or (job ->> 'revisionPortalToken') !~ '^[A-Za-z0-9_-]+$'
  ) then
    raise exception using errcode = '22023', message = 'invalid_workspace_job';
  end if;

  if exists (
    select job ->> 'id'
    from jsonb_array_elements(p_state -> 'jobs') as job
    group by job ->> 'id'
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'duplicate_workspace_job';
  end if;
end;
$$;

create or replace function public.save_workspace_document(
  p_state jsonb,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns table(document_version bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_hash text;
  v_existing public.workspace_save_requests%rowtype;
  v_document public.workspace_documents%rowtype;
  v_now timestamptz := clock_timestamp();
  v_next_version bigint;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency_key_required';
  end if;

  perform public.validate_workspace_state(p_state);
  v_hash := encode(extensions.digest(p_state::text, 'sha256'), 'hex');

  -- Profiles exist before any workspace document and therefore provide a
  -- stable per-owner lock even for the very first save. Concurrent retries
  -- with the same idempotency key wait here, then observe the committed
  -- receipt instead of racing on the document primary key.
  perform 1
  from public.profiles as profile
  where profile.id = v_owner
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'profile_not_found';
  end if;

  select request.* into v_existing
  from public.workspace_save_requests as request
  where request.owner_id = v_owner and request.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_hash <> v_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return query select v_existing.result_version, v_existing.created_at;
    return;
  end if;

  select document.* into v_document
  from public.workspace_documents as document
  where document.owner_id = v_owner
  for update;

  if not found then
    if coalesce(p_expected_version, 0) <> 0 then
      raise exception using errcode = '40001', message = 'workspace_conflict';
    end if;
    v_next_version := 1;
    insert into public.workspace_documents (owner_id, state, document_version, created_at, updated_at)
    values (v_owner, p_state, v_next_version, v_now, v_now);
  else
    if p_expected_version is distinct from v_document.document_version then
      raise exception using errcode = '40001', message = 'workspace_conflict';
    end if;
    v_next_version := v_document.document_version + 1;
    update public.workspace_documents as document
    set state = p_state, document_version = v_next_version, updated_at = v_now
    where document.owner_id = v_owner;
  end if;

  insert into public.workspace_save_requests (
    owner_id, idempotency_key, request_hash, result_version, created_at
  ) values (
    v_owner, p_idempotency_key, v_hash, v_next_version, v_now
  );

  return query select v_next_version, v_now;
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

create or replace function public.get_workspace_revision_summary(p_token text)
returns table(
  job_key text,
  title text,
  package_name text,
  included integer,
  used integer,
  remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job jsonb;
  v_limit integer;
  v_used integer;
begin
  if coalesce(char_length(p_token), 0) not between 43 and 128
    or p_token !~ '^[A-Za-z0-9_-]+$' then
    return;
  end if;

  select job into v_job
  from public.workspace_revision_portals as portal
  join public.workspace_documents as document on document.owner_id = portal.owner_id,
    lateral jsonb_array_elements(document.state -> 'jobs') as job
  where portal.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and portal.enabled
    and job ->> 'id' = portal.job_key
    and job ->> 'revisionPortalToken' = p_token
    and job ->> 'status' = 'active'
    and coalesce((job ->> 'revisionPortalEnabled')::boolean, false)
  limit 1;

  if v_job is null then return; end if;
  v_limit := greatest(coalesce((v_job ->> 'revisionLimit')::integer, 0), 0);
  select count(*)::integer into v_used
  from jsonb_array_elements(coalesce(v_job -> 'revisions', '[]'::jsonb)) as revision
  where revision ->> 'usage' = 'used'
    and not (revision ? 'revertedAt');

  return query select
    v_job ->> 'id',
    left(coalesce(v_job ->> 'title', '수정 요청'), 160),
    left(coalesce(v_job #>> '{packageSnapshot,name}', '작업'), 80),
    v_limit,
    v_used,
    greatest(v_limit - v_used, 0);
end;
$$;

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
  where portal.token_hash = v_hash and portal.enabled
  for update;
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

alter table public.workspace_documents enable row level security;
create policy workspace_documents_owner_select on public.workspace_documents
  for select to authenticated using (owner_id = (select auth.uid()));

alter table public.workspace_save_requests enable row level security;
alter table public.workspace_revision_portals enable row level security;
create policy workspace_revision_portals_owner_select on public.workspace_revision_portals
  for select to authenticated using (owner_id = (select auth.uid()));
alter table public.workspace_revision_requests enable row level security;
create policy workspace_revision_requests_owner_select on public.workspace_revision_requests
  for select to authenticated using (owner_id = (select auth.uid()));

revoke all on table public.workspace_documents from anon, authenticated;
grant select on table public.workspace_documents to authenticated;
revoke all on table public.workspace_save_requests from anon, authenticated;
revoke all on table public.workspace_revision_portals from anon, authenticated;
grant select on table public.workspace_revision_portals to authenticated;
revoke all on table public.workspace_revision_requests from anon, authenticated;
grant select on table public.workspace_revision_requests to authenticated;

revoke all on function public.validate_workspace_state(jsonb) from public, anon, authenticated;
revoke all on function public.save_workspace_document(jsonb, bigint, uuid) from public;
grant execute on function public.save_workspace_document(jsonb, bigint, uuid) to authenticated;
revoke all on function public.register_workspace_revision_portal(text, text, boolean) from public;
grant execute on function public.register_workspace_revision_portal(text, text, boolean) to authenticated;
revoke all on function public.get_workspace_revision_summary(text) from public;
grant execute on function public.get_workspace_revision_summary(text) to anon, authenticated;
revoke all on function public.submit_workspace_revision_request(text, text, text, uuid) from public;
grant execute on function public.submit_workspace_revision_request(text, text, text, uuid) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'workspace_documents'
    ) then
    alter publication supabase_realtime add table public.workspace_documents;
  end if;
end;
$$;
