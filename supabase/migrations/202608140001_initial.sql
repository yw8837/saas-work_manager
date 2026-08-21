-- 일감체크 hosted-mode foundation (Supabase/Postgres 15)
-- This migration is intentionally backend-ready only. Applying it requires a
-- user-owned Supabase project; no project or secret is bundled with the app.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '일감체크 사용자' check (char_length(display_name) between 1 and 80),
  timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_packages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  price_krw integer not null default 0 check (price_krw >= 0),
  duration_days integer not null default 1 check (duration_days between 0 and 3650),
  revision_limit integer not null default 0 check (revision_limit between 0 and 999),
  description text not null default '' check (char_length(description) <= 2000),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.package_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  package_id uuid not null,
  task_key text not null check (char_length(task_key) between 1 and 120),
  title text not null check (char_length(title) between 1 and 160),
  relative_due_days integer not null default 0 check (relative_due_days between 0 and 3650),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, task_key),
  unique (id, owner_id),
  foreign key (package_id, owner_id) references public.service_packages(id, owner_id) on delete cascade
);

create table public.service_options (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  price_delta_krw integer not null default 0 check (price_delta_krw >= 0),
  duration_delta_days integer not null default 0 check (duration_delta_days between 0 and 3650),
  revision_delta integer not null default 0 check (revision_delta between 0 and 999),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.option_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  option_id uuid not null,
  action text not null default 'add' check (action in ('add', 'remove')),
  task_key text check (task_key is null or char_length(task_key) between 1 and 120),
  target_task_key text check (target_task_key is null or char_length(target_task_key) between 1 and 120),
  title text check (title is null or char_length(title) between 1 and 160),
  relative_due_days integer check (relative_due_days is null or relative_due_days between 0 and 3650),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  check (
    (action = 'add' and task_key is not null and target_task_key is null
      and title is not null and relative_due_days is not null)
    or
    (action = 'remove' and task_key is null and target_task_key is not null
      and title is null and relative_due_days is null)
  ),
  foreign key (option_id, owner_id) references public.service_options(id, owner_id) on delete cascade
);

-- An option may affect a deterministic task key at most once. This rejects
-- duplicate adds/removes and an add/remove conflict inside the same option.
create unique index option_tasks_one_effect_per_key_idx
  on public.option_tasks(option_id, (coalesce(task_key, target_task_key)));

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  creation_key uuid not null,
  creation_request_hash text not null check (char_length(creation_request_hash) = 64),
  client_label text not null check (char_length(client_label) between 1 and 100),
  title text not null check (char_length(title) between 1 and 160),
  status text not null default 'active' check (status in ('active', 'waiting', 'completed', 'archived')),
  start_date date not null,
  due_date date not null,
  waiting_since timestamptz,
  package_id uuid,
  package_snapshot jsonb not null default '{}'::jsonb,
  option_snapshot jsonb not null default '[]'::jsonb,
  price_krw integer not null default 0 check (price_krw >= 0),
  revision_limit integer not null default 0 check (revision_limit between 0 and 9999),
  revision_used integer not null default 0 check (revision_used between 0 and 9999),
  contact_url text check (contact_url is null or char_length(contact_url) <= 2048),
  work_url text check (work_url is null or char_length(work_url) <= 2048),
  notes text not null default '' check (char_length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, owner_id),
  unique (owner_id, creation_key),
  check (due_date >= start_date),
  check (revision_used <= revision_limit or revision_limit = 0)
);

create index jobs_owner_status_due_idx on public.jobs(owner_id, status, due_date);

create table public.job_options (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null,
  option_id uuid,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (job_id, owner_id) references public.jobs(id, owner_id) on delete cascade
);

create table public.job_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null,
  title text not null check (char_length(title) between 1 and 160),
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'doing', 'waiting', 'done')),
  waiting_since timestamptz,
  sort_order integer not null default 0,
  source_snapshot jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (job_id, owner_id) references public.jobs(id, owner_id) on delete cascade
);

create index job_tasks_owner_status_due_idx on public.job_tasks(owner_id, status, due_date);

create table public.revision_portals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null,
  token_hash text not null unique check (char_length(token_hash) = 64),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  last_submission_at timestamptz,
  unique (owner_id, job_id),
  unique (id, owner_id),
  foreign key (job_id, owner_id) references public.jobs(id, owner_id) on delete cascade
);

create table public.revision_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null,
  portal_id uuid,
  source text not null check (source in ('portal', 'manual')),
  source_channel text check (source_channel is null or source_channel in ('kakao', 'kmong', 'soomgo', 'instagram', 'discord', 'phone', 'other')),
  client_label text check (client_label is null or char_length(client_label) <= 100),
  body text not null check (char_length(body) between 2 and 4000),
  reference_url text check (reference_url is null or char_length(reference_url) <= 2048),
  status text not null default 'new' check (status in ('new', 'seen', 'done', 'extra_scope', 'void')),
  idempotency_key uuid not null,
  request_hash text not null check (char_length(request_hash) = 64),
  submitted_at timestamptz not null default now(),
  seen_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(void_reason) <= 500),
  unique (owner_id, idempotency_key),
  unique (id, owner_id),
  foreign key (job_id, owner_id) references public.jobs(id, owner_id) on delete restrict,
  foreign key (portal_id, owner_id) references public.revision_portals(id, owner_id) on delete no action
);

create index revision_requests_owner_job_submitted_idx on public.revision_requests(owner_id, job_id, submitted_at desc);
create index revision_requests_portal_submitted_idx
  on public.revision_requests(portal_id, submitted_at desc)
  where portal_id is not null;

-- Request evidence is immutable. Trusted RPCs may advance lifecycle fields,
-- but the original source, body, URL, identity and timestamps never change.
create or replace function public.protect_revision_request_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.owner_id is distinct from old.owner_id
    or new.job_id is distinct from old.job_id
    or new.portal_id is distinct from old.portal_id
    or new.source is distinct from old.source
    or new.source_channel is distinct from old.source_channel
    or new.client_label is distinct from old.client_label
    or new.body is distinct from old.body
    or new.reference_url is distinct from old.reference_url
    or new.idempotency_key is distinct from old.idempotency_key
    or new.request_hash is distinct from old.request_hash
    or new.submitted_at is distinct from old.submitted_at then
    raise exception 'revision request evidence is immutable';
  end if;
  return new;
end;
$$;

create trigger revision_requests_protect_evidence
  before update on public.revision_requests
  for each row execute procedure public.protect_revision_request_evidence();

create table public.revision_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null,
  source_request_id uuid not null,
  target_event_id uuid,
  event_type text not null check (event_type in ('use', 'revert')),
  delta integer not null check (delta in (-1, 1)),
  idempotency_key uuid not null,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, idempotency_key),
  check (
    (event_type = 'use' and delta = 1 and target_event_id is null)
    or
    (event_type = 'revert' and delta = -1 and target_event_id is not null)
  ),
  foreign key (job_id, owner_id) references public.jobs(id, owner_id) on delete cascade,
  foreign key (source_request_id, owner_id) references public.revision_requests(id, owner_id) on delete restrict,
  foreign key (target_event_id, owner_id) references public.revision_events(id, owner_id) on delete restrict
);

create unique index revision_events_one_use_per_request_idx
  on public.revision_events(source_request_id)
  where event_type = 'use';

create unique index revision_events_one_revert_per_use_idx
  on public.revision_events(target_event_id)
  where event_type = 'revert';

-- Composite foreign keys enforce ownership. This trigger additionally binds
-- every event to the same job/request and permits reverting only its use event.
create or replace function public.validate_revision_event_chain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.revision_requests%rowtype;
  v_target public.revision_events%rowtype;
begin
  select rr.* into v_request
  from public.revision_requests rr
  where rr.id = new.source_request_id and rr.owner_id = new.owner_id;

  if not found or v_request.job_id <> new.job_id then
    raise exception 'revision event must match its request owner and job';
  end if;

  if new.event_type = 'revert' then
    select re.* into v_target
    from public.revision_events re
    where re.id = new.target_event_id and re.owner_id = new.owner_id;

    if not found
      or v_target.event_type <> 'use'
      or v_target.job_id <> new.job_id
      or v_target.source_request_id <> new.source_request_id then
      raise exception 'revert must target the matching use event';
    end if;
  end if;

  return new;
end;
$$;

create trigger revision_events_validate_chain
  before insert on public.revision_events
  for each row execute procedure public.validate_revision_event_chain();

create table public.addon_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null,
  source_request_id uuid,
  title text not null,
  amount_krw integer check (amount_krw is null or amount_krw between 0 and 1000000000),
  status text not null default 'draft' check (status in ('draft', 'offered', 'accepted', 'declined', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (job_id, owner_id) references public.jobs(id, owner_id) on delete cascade,
  foreign key (source_request_id, owner_id) references public.revision_requests(id, owner_id) on delete restrict
);

create table public.activity_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid,
  kind text not null,
  actor text not null check (actor in ('owner', 'client', 'system')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (job_id, owner_id) references public.jobs(id, owner_id) on delete cascade
);

create table public.notification_preferences (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  timezone text not null default 'Asia/Seoul',
  digest_time time not null default '09:00',
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00',
  due_offsets smallint[] not null default array[2,1,0]::smallint[],
  waiting_highlight_offsets smallint[] not null default array[2,5]::smallint[],
  job_due_enabled boolean not null default true,
  task_due_enabled boolean not null default true,
  waiting_enabled boolean not null default true,
  revision_enabled boolean not null default true,
  show_detail boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_notification_settings (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null,
  enabled boolean not null default true,
  job_due_enabled boolean not null default true,
  task_due_enabled boolean not null default true,
  waiting_enabled boolean not null default true,
  payment_enabled boolean not null default false,
  revision_enabled boolean not null default true,
  primary key (owner_id, job_id),
  foreign key (job_id, owner_id) references public.jobs(id, owner_id) on delete cascade
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  endpoint_hash text not null check (char_length(endpoint_hash) = 64),
  endpoint_ciphertext text not null,
  p256dh_ciphertext text not null,
  auth_ciphertext text not null,
  user_agent text,
  last_success_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create unique index push_subscriptions_active_endpoint_idx
  on public.push_subscriptions(endpoint_hash)
  where revoked_at is null;

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('daily_digest', 'test', 'revision_request')),
  local_date date not null,
  slot text not null,
  scheduled_for timestamptz not null,
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'stale', 'missed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, kind, local_date, slot)
);

create table public.notification_delivery_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  delivery_id uuid not null,
  item_kind text not null check (item_kind in ('job_due', 'task_due', 'waiting', 'payment', 'revision_request')),
  job_id uuid,
  task_id uuid,
  revision_request_id uuid,
  highlight_threshold smallint,
  item_dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  foreign key (delivery_id, owner_id) references public.notification_deliveries(id, owner_id) on delete cascade,
  foreign key (job_id, owner_id) references public.jobs(id, owner_id) on delete cascade,
  foreign key (task_id, owner_id) references public.job_tasks(id, owner_id) on delete cascade,
  foreign key (revision_request_id, owner_id) references public.revision_requests(id, owner_id) on delete cascade
);

create table public.notification_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  delivery_id uuid not null,
  subscription_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 10),
  sent_at timestamptz,
  clicked_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_id, subscription_id),
  foreign key (delivery_id, owner_id) references public.notification_deliveries(id, owner_id) on delete cascade,
  foreign key (subscription_id, owner_id) references public.push_subscriptions(id, owner_id) on delete cascade
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), '일감체크 사용자'), 80)
  );
  insert into public.notification_preferences (owner_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'service_packages', 'package_tasks', 'service_options', 'option_tasks',
    'notification_preferences', 'job_notification_settings'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',
      table_name || '_owner_all', table_name
    );
  end loop;
end;
$$;

-- Runtime records are readable by their owner, but every mutation crosses a
-- narrow RPC below. In particular, clients cannot forge snapshots, pricing,
-- counters, lifecycle timestamps, task ownership, portal tokens or add-ons by
-- issuing direct PostgREST writes.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'jobs', 'job_options', 'job_tasks', 'revision_portals', 'addon_requests'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))',
      table_name || '_owner_select', table_name
    );
    execute format('revoke insert, update, delete on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

-- Revision evidence and its counter ledger are readable by the owner, but all
-- writes go through narrow security-definer RPCs. In particular, authenticated
-- owners cannot edit/delete the client's original request or forge events.
alter table public.revision_requests enable row level security;
create policy revision_requests_owner_select on public.revision_requests
  for select to authenticated using (owner_id = (select auth.uid()));
revoke insert, update, delete on table public.revision_requests from anon, authenticated;
grant select on table public.revision_requests to authenticated;

alter table public.revision_events enable row level security;
create policy revision_events_owner_select on public.revision_events
  for select to authenticated using (owner_id = (select auth.uid()));
revoke insert, update, delete on table public.revision_events from anon, authenticated;
grant select on table public.revision_events to authenticated;

alter table public.activity_events enable row level security;
create policy activity_events_owner_select on public.activity_events
  for select to authenticated using (owner_id = (select auth.uid()));
revoke insert, update, delete on table public.activity_events from anon, authenticated;
grant select on table public.activity_events to authenticated;

-- Delivery state is written only by service-role workers; users can inspect their own rows.
alter table public.notification_deliveries enable row level security;
create policy notification_deliveries_owner_select on public.notification_deliveries
  for select to authenticated using (owner_id = (select auth.uid()));
alter table public.notification_delivery_items enable row level security;
create policy notification_delivery_items_owner_select on public.notification_delivery_items
  for select to authenticated using (owner_id = (select auth.uid()));
alter table public.notification_attempts enable row level security;
create policy notification_attempts_owner_select on public.notification_attempts
  for select to authenticated using (owner_id = (select auth.uid()));

-- Push secrets are registered/revoked through trusted Edge Functions only.
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_owner_select on public.push_subscriptions
  for select to authenticated using (owner_id = (select auth.uid()));

alter table public.profiles enable row level security;
create policy profiles_owner_all on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create trigger service_packages_updated_at before update on public.service_packages
  for each row execute procedure public.set_updated_at();
create trigger package_tasks_updated_at before update on public.package_tasks
  for each row execute procedure public.set_updated_at();
create trigger service_options_updated_at before update on public.service_options
  for each row execute procedure public.set_updated_at();
create trigger option_tasks_updated_at before update on public.option_tasks
  for each row execute procedure public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs
  for each row execute procedure public.set_updated_at();
create trigger job_tasks_updated_at before update on public.job_tasks
  for each row execute procedure public.set_updated_at();
create trigger addon_requests_updated_at before update on public.addon_requests
  for each row execute procedure public.set_updated_at();
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute procedure public.set_updated_at();
create trigger push_subscriptions_updated_at before update on public.push_subscriptions
  for each row execute procedure public.set_updated_at();
create trigger notification_deliveries_updated_at before update on public.notification_deliveries
  for each row execute procedure public.set_updated_at();
create trigger notification_attempts_updated_at before update on public.notification_attempts
  for each row execute procedure public.set_updated_at();

-- Create one runtime job from owner-controlled templates. Prices, deadlines,
-- revision limits, snapshots and tasks are derived inside the transaction;
-- none of those values are accepted from the browser.
create or replace function public.create_job_from_templates(
  p_package_id uuid,
  p_option_ids uuid[],
  p_client_label text,
  p_start_date date,
  p_title text default null,
  p_contact_url text default null,
  p_work_url text default null,
  p_notes text default '',
  p_idempotency_key uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id uuid := auth.uid();
  v_package public.service_packages%rowtype;
  v_option_ids uuid[] := coalesce(p_option_ids, '{}'::uuid[]);
  v_option_count integer;
  v_price_delta bigint := 0;
  v_duration_delta bigint := 0;
  v_revision_delta bigint := 0;
  v_total_price bigint;
  v_total_duration bigint;
  v_total_revision bigint;
  v_package_snapshot jsonb;
  v_option_snapshot jsonb;
  v_request_hash text;
  v_existing public.jobs%rowtype;
  v_job_id uuid;
  v_duplicate_key text;
begin
  if v_owner_id is null then
    raise exception 'authentication required';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key is required';
  end if;
  if char_length(trim(coalesce(p_client_label, ''))) not between 1 and 100 then
    raise exception 'client label must be 1..100 characters';
  end if;
  if p_start_date is null then
    raise exception 'start date is required';
  end if;
  if p_title is not null and char_length(trim(p_title)) not between 1 and 160 then
    raise exception 'title must be 1..160 characters';
  end if;
  if char_length(coalesce(p_notes, '')) > 10000 then
    raise exception 'notes are too long';
  end if;
  if p_contact_url is not null and
     (char_length(p_contact_url) > 2048 or p_contact_url !~ '^https?://') then
    raise exception 'invalid contact URL';
  end if;
  if p_work_url is not null and
     (char_length(p_work_url) > 2048 or p_work_url !~ '^https?://') then
    raise exception 'invalid work URL';
  end if;
  if cardinality(v_option_ids) > 50 then
    raise exception 'too many options';
  end if;
  if exists (
    select 1 from unnest(v_option_ids) as requested(option_id)
    group by requested.option_id having count(*) > 1
  ) then
    raise exception 'duplicate option';
  end if;

  v_request_hash := encode(digest(convert_to(
    jsonb_build_object(
      'package_id', p_package_id,
      'option_ids', to_jsonb(array(select option_id from unnest(v_option_ids) option_id order by option_id)),
      'client_label', trim(p_client_label),
      'start_date', p_start_date,
      'title', nullif(trim(coalesce(p_title, '')), ''),
      'contact_url', p_contact_url,
      'work_url', p_work_url,
      'notes', coalesce(p_notes, '')
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  select j.* into v_existing
  from public.jobs j
  where j.owner_id = v_owner_id and j.creation_key = p_idempotency_key;

  if found then
    if v_existing.creation_request_hash <> v_request_hash then
      raise exception 'idempotency conflict';
    end if;
    return v_existing.id;
  end if;

  select sp.* into v_package
  from public.service_packages sp
  where sp.id = p_package_id and sp.owner_id = v_owner_id and sp.archived_at is null
  for share;

  if not found then
    raise exception 'package not found';
  end if;

  select count(*),
         coalesce(sum(so.price_delta_krw), 0),
         coalesce(sum(so.duration_delta_days), 0),
         coalesce(sum(so.revision_delta), 0)
    into v_option_count, v_price_delta, v_duration_delta, v_revision_delta
  from public.service_options so
  where so.owner_id = v_owner_id
    and so.archived_at is null
    and so.id = any(v_option_ids);

  if v_option_count <> cardinality(v_option_ids) then
    raise exception 'option not found';
  end if;

  v_total_price := v_package.price_krw::bigint + v_price_delta;
  v_total_duration := v_package.duration_days::bigint + v_duration_delta;
  v_total_revision := v_package.revision_limit::bigint + v_revision_delta;
  if v_total_price not between 0 and 2147483647 then
    raise exception 'calculated price is out of range';
  end if;
  if v_total_duration not between 0 and 3650 then
    raise exception 'calculated duration is out of range';
  end if;
  if v_total_revision not between 0 and 9999 then
    raise exception 'calculated revision limit is out of range';
  end if;

  select jsonb_build_object(
    'id', v_package.id,
    'name', v_package.name,
    'description', v_package.description,
    'price_krw', v_package.price_krw,
    'duration_days', v_package.duration_days,
    'revision_limit', v_package.revision_limit,
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'task_key', pt.task_key,
        'title', pt.title,
        'relative_due_days', pt.relative_due_days,
        'sort_order', pt.sort_order
      ) order by pt.sort_order, pt.task_key)
      from public.package_tasks pt
      where pt.owner_id = v_owner_id and pt.package_id = v_package.id
    ), '[]'::jsonb)
  ) into v_package_snapshot;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', so.id,
    'name', so.name,
    'price_delta_krw', so.price_delta_krw,
    'duration_delta_days', so.duration_delta_days,
    'revision_delta', so.revision_delta
  ) order by so.id), '[]'::jsonb)
  into v_option_snapshot
  from public.service_options so
  where so.owner_id = v_owner_id and so.id = any(v_option_ids);

  -- Reject ambiguous package/option task composition before writing anything.
  with removed_keys as (
    select ot.target_task_key as task_key
    from public.option_tasks ot
    where ot.owner_id = v_owner_id and ot.option_id = any(v_option_ids) and ot.action = 'remove'
  ), candidates as (
    select pt.task_key
    from public.package_tasks pt
    where pt.owner_id = v_owner_id and pt.package_id = v_package.id
    union all
    select ot.task_key
    from public.option_tasks ot
    where ot.owner_id = v_owner_id and ot.option_id = any(v_option_ids) and ot.action = 'add'
  )
  select c.task_key into v_duplicate_key
  from candidates c
  where not exists (select 1 from removed_keys r where r.task_key = c.task_key)
  group by c.task_key having count(*) > 1
  limit 1;

  if v_duplicate_key is not null then
    raise exception 'duplicate composed task key: %', v_duplicate_key;
  end if;

  insert into public.jobs (
    owner_id, creation_key, creation_request_hash, client_label, title,
    start_date, due_date, package_id, package_snapshot, option_snapshot,
    price_krw, revision_limit, contact_url, work_url, notes
  ) values (
    v_owner_id, p_idempotency_key, v_request_hash, trim(p_client_label),
    coalesce(nullif(trim(coalesce(p_title, '')), ''), trim(p_client_label) || ' · ' || v_package.name),
    p_start_date, p_start_date + v_total_duration::integer, v_package.id,
    v_package_snapshot, v_option_snapshot, v_total_price::integer,
    v_total_revision::integer, p_contact_url, p_work_url, coalesce(p_notes, '')
  ) returning id into v_job_id;

  insert into public.job_options (owner_id, job_id, option_id, snapshot)
  select v_owner_id, v_job_id, so.id, jsonb_build_object(
    'id', so.id,
    'name', so.name,
    'price_delta_krw', so.price_delta_krw,
    'duration_delta_days', so.duration_delta_days,
    'revision_delta', so.revision_delta
  )
  from public.service_options so
  where so.owner_id = v_owner_id and so.id = any(v_option_ids);

  with removed_keys as (
    select ot.target_task_key as task_key
    from public.option_tasks ot
    where ot.owner_id = v_owner_id and ot.option_id = any(v_option_ids) and ot.action = 'remove'
  ), candidates as (
    select pt.task_key, pt.title, pt.relative_due_days, pt.sort_order,
           0 as source_rank, v_package.id as source_id, 'package'::text as source_kind
    from public.package_tasks pt
    where pt.owner_id = v_owner_id and pt.package_id = v_package.id
    union all
    select ot.task_key, ot.title, ot.relative_due_days, ot.sort_order,
           1 as source_rank, ot.option_id as source_id, 'option'::text as source_kind
    from public.option_tasks ot
    where ot.owner_id = v_owner_id and ot.option_id = any(v_option_ids) and ot.action = 'add'
  ), filtered as (
    select c.*
    from candidates c
    where not exists (select 1 from removed_keys r where r.task_key = c.task_key)
  )
  insert into public.job_tasks (
    owner_id, job_id, title, due_date, sort_order, source_snapshot
  )
  select v_owner_id, v_job_id, f.title, p_start_date + f.relative_due_days,
         row_number() over (order by f.source_rank, f.sort_order, f.task_key)::integer - 1,
         jsonb_build_object(
           'task_key', f.task_key,
           'relative_due_days', f.relative_due_days,
           'source', f.source_kind,
           'source_id', f.source_id
         )
  from filtered f;

  insert into public.activity_events (owner_id, job_id, kind, actor, payload)
  values (v_owner_id, v_job_id, 'job_created', 'system',
    jsonb_build_object('package_id', v_package.id, 'option_count', v_option_count));

  return v_job_id;
exception
  when unique_violation then
    select j.* into v_existing
    from public.jobs j
    where j.owner_id = v_owner_id and j.creation_key = p_idempotency_key;
    if found and v_existing.creation_request_hash = v_request_hash then
      return v_existing.id;
    end if;
    raise;
end;
$$;

-- Only legal status transitions can update lifecycle timestamps. Direct job
-- UPDATE remains revoked, and the activity actor/kind are fixed by the RPC.
create or replace function public.set_job_status(
  p_job_id uuid,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_previous text;
begin
  if v_owner_id is null then raise exception 'authentication required'; end if;
  if p_status not in ('active', 'waiting', 'completed', 'archived') then
    raise exception 'invalid job status';
  end if;

  select j.status into v_previous
  from public.jobs j
  where j.id = p_job_id and j.owner_id = v_owner_id
  for update;
  if not found then raise exception 'job not found'; end if;

  if v_previous = p_status then return v_previous; end if;
  if not (
    (v_previous in ('active', 'waiting') and p_status in ('active', 'waiting', 'completed', 'archived'))
    or (v_previous = 'completed' and p_status in ('active', 'archived'))
    or (v_previous = 'archived' and p_status = 'active')
  ) then
    raise exception 'invalid job status transition';
  end if;

  update public.jobs
  set status = p_status,
      waiting_since = case when p_status = 'waiting' then coalesce(waiting_since, now()) else null end,
      completed_at = case when p_status = 'completed' then now() else null end
  where id = p_job_id and owner_id = v_owner_id;

  insert into public.activity_events (owner_id, job_id, kind, actor, payload)
  values (v_owner_id, p_job_id, 'job_status_changed', 'owner',
    jsonb_build_object('from', v_previous, 'to', p_status));
  return p_status;
end;
$$;

create or replace function public.set_job_task_status(
  p_task_id uuid,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_task public.job_tasks%rowtype;
begin
  if v_owner_id is null then raise exception 'authentication required'; end if;
  if p_status not in ('todo', 'doing', 'waiting', 'done') then
    raise exception 'invalid task status';
  end if;
  select jt.* into v_task
  from public.job_tasks jt
  where jt.id = p_task_id and jt.owner_id = v_owner_id
  for update;
  if not found then raise exception 'task not found'; end if;

  update public.job_tasks
  set status = p_status,
      waiting_since = case when p_status = 'waiting' then coalesce(waiting_since, now()) else null end,
      completed_at = case when p_status = 'done' then now() else null end
  where id = p_task_id and owner_id = v_owner_id;

  insert into public.activity_events (owner_id, job_id, kind, actor, payload)
  values (v_owner_id, v_task.job_id, 'task_status_changed', 'owner',
    jsonb_build_object('task_id', p_task_id, 'from', v_task.status, 'to', p_status));
  return p_status;
end;
$$;

create or replace function public.update_job_links(
  p_job_id uuid,
  p_contact_url text,
  p_work_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then raise exception 'authentication required'; end if;
  if p_contact_url is not null and
     (char_length(p_contact_url) > 2048 or p_contact_url !~ '^https?://') then
    raise exception 'invalid contact URL';
  end if;
  if p_work_url is not null and
     (char_length(p_work_url) > 2048 or p_work_url !~ '^https?://') then
    raise exception 'invalid work URL';
  end if;
  update public.jobs set contact_url = p_contact_url, work_url = p_work_url
  where id = p_job_id and owner_id = v_owner_id;
  if not found then raise exception 'job not found'; end if;
  insert into public.activity_events (owner_id, job_id, kind, actor, payload)
  values (v_owner_id, p_job_id, 'job_links_updated', 'owner', '{}'::jsonb);
end;
$$;

create or replace function public.append_owner_note(
  p_job_id uuid,
  p_note text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_event_id bigint;
begin
  if v_owner_id is null then raise exception 'authentication required'; end if;
  if char_length(trim(coalesce(p_note, ''))) not between 1 and 1000 then
    raise exception 'note must be 1..1000 characters';
  end if;
  if not exists (
    select 1 from public.jobs j where j.id = p_job_id and j.owner_id = v_owner_id
  ) then
    raise exception 'job not found';
  end if;
  insert into public.activity_events (owner_id, job_id, kind, actor, payload)
  values (v_owner_id, p_job_id, 'owner_note', 'owner',
    jsonb_build_object('note', trim(p_note)))
  returning id into v_event_id;
  return v_event_id;
end;
$$;

-- Generates 256 bits of token entropy and stores only its SHA-256 hash. The
-- raw token is returned once to the authenticated owner.
create or replace function public.rotate_revision_portal(p_job_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id uuid := auth.uid();
  v_token text;
begin
  if v_owner_id is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.jobs j where j.id = p_job_id and j.owner_id = v_owner_id) then
    raise exception 'job not found';
  end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.revision_portals (owner_id, job_id, token_hash, enabled)
  values (
    v_owner_id, p_job_id,
    encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'), true
  )
  on conflict (owner_id, job_id) do update
  set token_hash = excluded.token_hash, enabled = true, rotated_at = now(), last_submission_at = null;
  return v_token;
end;
$$;

create or replace function public.set_revision_portal_enabled(
  p_job_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then raise exception 'authentication required'; end if;
  update public.revision_portals set enabled = p_enabled
  where job_id = p_job_id and owner_id = v_owner_id;
  if not found then raise exception 'revision portal not found'; end if;
  return p_enabled;
end;
$$;

-- Public, no-login revision intake. Tables remain unreadable/unwritable to anon;
-- this narrow RPC is the only public write boundary. The raw token is never stored.
-- BLOCKED_EXTERNAL: source-IP throttling and CAPTCHA require a trusted Edge/WAF
-- layer because a browser-supplied IP is not a trustworthy database input.
create or replace function public.submit_revision_request(
  p_token text,
  p_body text,
  p_reference_url text default null,
  p_idempotency_key uuid default gen_random_uuid(),
  p_website text default null
)
returns table (
  request_id uuid,
  request_status text,
  submitted_at timestamptz,
  revision_used integer,
  revision_remaining integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_portal public.revision_portals%rowtype;
  v_job public.jobs%rowtype;
  v_request public.revision_requests%rowtype;
  v_request_hash text;
  v_delivery_id uuid;
  v_status text;
  v_daily_submission_count integer;
begin
  if coalesce(p_website, '') <> '' then
    raise exception 'invalid submission';
  end if;
  if char_length(coalesce(p_token, '')) < 32 then
    raise exception 'invalid portal';
  end if;
  if char_length(trim(coalesce(p_body, ''))) not between 2 and 4000 then
    raise exception 'request body must be 2..4000 characters';
  end if;
  if p_reference_url is not null and
     (char_length(p_reference_url) > 2048 or p_reference_url !~ '^https?://') then
    raise exception 'invalid reference URL';
  end if;

  select rp.* into v_portal
  from public.revision_portals rp
  join public.jobs j on j.id = rp.job_id and j.owner_id = rp.owner_id
  where rp.token_hash = encode(digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
    and rp.enabled = true
    and j.status in ('active', 'waiting')
  for update of rp;

  if not found then
    raise exception 'invalid or expired portal';
  end if;

  v_request_hash := encode(
    digest(convert_to(trim(p_body) || '|' || coalesce(p_reference_url, ''), 'UTF8'), 'sha256'),
    'hex'
  );

  select rr.* into v_request
  from public.revision_requests rr
  where rr.owner_id = v_portal.owner_id and rr.idempotency_key = p_idempotency_key;

  if found then
    if v_request.portal_id is distinct from v_portal.id
      or v_request.job_id <> v_portal.job_id then
      raise exception 'idempotency conflict';
    end if;
    if v_request.request_hash <> v_request_hash then
      raise exception 'idempotency conflict';
    end if;
    select * into v_job from public.jobs where id = v_request.job_id;
    return query select v_request.id, v_request.status, v_request.submitted_at,
      v_job.revision_used, greatest(0, v_job.revision_limit - v_job.revision_used);
    return;
  end if;

  -- The portal-row lock serializes every non-idempotent submission for this
  -- token. That makes both limits atomic even when many requests arrive at
  -- once. Exact idempotent retries above remain safe and do not consume quota.
  if v_portal.last_submission_at is not null
     and v_portal.last_submission_at > now() - interval '15 seconds' then
    raise exception 'submission rate limit exceeded';
  end if;

  select count(*) into v_daily_submission_count
  from public.revision_requests rr
  where rr.portal_id = v_portal.id
    and rr.submitted_at >= (
      date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
    );

  if v_daily_submission_count >= 40 then
    raise exception 'daily submission limit exceeded';
  end if;

  select * into v_job
  from public.jobs
  where id = v_portal.job_id and owner_id = v_portal.owner_id
  for update;

  -- A concurrent retry may have inserted while this transaction waited for the job lock.
  select rr.* into v_request
  from public.revision_requests rr
  where rr.owner_id = v_portal.owner_id and rr.idempotency_key = p_idempotency_key;
  if found then
    if v_request.portal_id is distinct from v_portal.id
      or v_request.job_id <> v_portal.job_id then
      raise exception 'idempotency conflict';
    end if;
    if v_request.request_hash <> v_request_hash then
      raise exception 'idempotency conflict';
    end if;
    return query select v_request.id, v_request.status, v_request.submitted_at,
      v_job.revision_used, greatest(0, v_job.revision_limit - v_job.revision_used);
    return;
  end if;

  v_status := case when v_job.revision_used < v_job.revision_limit then 'new' else 'extra_scope' end;

  insert into public.revision_requests (
    owner_id, job_id, portal_id, source, client_label, body, reference_url,
    status, idempotency_key, request_hash
  ) values (
    v_job.owner_id, v_job.id, v_portal.id, 'portal', v_job.client_label,
    trim(p_body), p_reference_url, v_status, p_idempotency_key, v_request_hash
  ) returning * into v_request;

  if v_status = 'new' then
    update public.jobs as j set revision_used = j.revision_used + 1 where j.id = v_job.id
      returning * into v_job;
    insert into public.revision_events (
      owner_id, job_id, source_request_id, event_type, delta, idempotency_key
    ) values (
      v_job.owner_id, v_job.id, v_request.id, 'use', 1, p_idempotency_key
    );
  else
    insert into public.addon_requests (owner_id, job_id, source_request_id, title)
      values (v_job.owner_id, v_job.id, v_request.id, '수정 범위 초과 요청');
  end if;

  update public.revision_portals set last_submission_at = now() where id = v_portal.id;
  insert into public.activity_events (owner_id, job_id, kind, actor, payload)
    values (v_job.owner_id, v_job.id, 'revision_requested', 'client',
      jsonb_build_object('request_id', v_request.id, 'status', v_status));

  insert into public.notification_deliveries (
    owner_id, kind, local_date, slot, scheduled_for, dedupe_key
  ) values (
    v_job.owner_id, 'revision_request', (now() at time zone 'Asia/Seoul')::date,
    v_request.id::text, now(), 'revision_request:' || v_request.id::text
  ) returning id into v_delivery_id;
  insert into public.notification_delivery_items (
    owner_id, delivery_id, item_kind, job_id, revision_request_id, item_dedupe_key
  ) values (
    v_job.owner_id, v_delivery_id, 'revision_request', v_job.id, v_request.id,
    'revision_request:' || v_request.id::text
  );

  return query select v_request.id, v_status, v_request.submitted_at,
    v_job.revision_used, greatest(0, v_job.revision_limit - v_job.revision_used);
end;
$$;

-- Authenticated two-track intake for requests received through chat/phone.
-- It shares the same immutable evidence and revision ledger as the portal.
create or replace function public.submit_manual_revision_request(
  p_job_id uuid,
  p_body text,
  p_source_channel text,
  p_reference_url text default null,
  p_client_label text default null,
  p_idempotency_key uuid default gen_random_uuid()
)
returns table (
  request_id uuid,
  request_status text,
  submitted_at timestamptz,
  revision_used integer,
  revision_remaining integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_request public.revision_requests%rowtype;
  v_request_hash text;
  v_status text;
begin
  if v_owner_id is null then raise exception 'authentication required'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key is required'; end if;
  if p_source_channel not in ('kakao', 'kmong', 'soomgo', 'instagram', 'discord', 'phone', 'other') then
    raise exception 'invalid source channel';
  end if;
  if char_length(trim(coalesce(p_body, ''))) not between 2 and 4000 then
    raise exception 'request body must be 2..4000 characters';
  end if;
  if p_client_label is not null and char_length(trim(p_client_label)) > 100 then
    raise exception 'client label is too long';
  end if;
  if p_reference_url is not null and
     (char_length(p_reference_url) > 2048 or p_reference_url !~ '^https?://') then
    raise exception 'invalid reference URL';
  end if;

  v_request_hash := encode(digest(convert_to(
    trim(p_body) || '|' || coalesce(p_reference_url, '') || '|' || p_source_channel,
    'UTF8'
  ), 'sha256'), 'hex');

  select rr.* into v_request
  from public.revision_requests rr
  where rr.owner_id = v_owner_id and rr.idempotency_key = p_idempotency_key;
  if found then
    if v_request.job_id <> p_job_id or v_request.source <> 'manual'
       or v_request.request_hash <> v_request_hash then
      raise exception 'idempotency conflict';
    end if;
    select j.* into v_job from public.jobs j
    where j.id = p_job_id and j.owner_id = v_owner_id;
    return query select v_request.id, v_request.status, v_request.submitted_at,
      v_job.revision_used, greatest(0, v_job.revision_limit - v_job.revision_used);
    return;
  end if;

  select j.* into v_job
  from public.jobs j
  where j.id = p_job_id and j.owner_id = v_owner_id
    and j.status in ('active', 'waiting')
  for update;
  if not found then raise exception 'active job not found'; end if;

  v_status := case when v_job.revision_used < v_job.revision_limit then 'new' else 'extra_scope' end;
  insert into public.revision_requests (
    owner_id, job_id, source, source_channel, client_label, body,
    reference_url, status, idempotency_key, request_hash
  ) values (
    v_owner_id, v_job.id, 'manual', p_source_channel,
    nullif(trim(coalesce(p_client_label, '')), ''), trim(p_body),
    p_reference_url, v_status, p_idempotency_key, v_request_hash
  ) returning * into v_request;

  if v_status = 'new' then
    update public.jobs as j set revision_used = j.revision_used + 1
    where j.id = v_job.id and j.owner_id = v_owner_id returning * into v_job;
    insert into public.revision_events (
      owner_id, job_id, source_request_id, event_type, delta, idempotency_key
    ) values (v_owner_id, v_job.id, v_request.id, 'use', 1, p_idempotency_key);
  else
    insert into public.addon_requests (owner_id, job_id, source_request_id, title)
    values (v_owner_id, v_job.id, v_request.id, '수정 범위 초과 요청');
  end if;

  insert into public.activity_events (owner_id, job_id, kind, actor, payload)
  values (v_owner_id, v_job.id, 'manual_revision_recorded', 'owner',
    jsonb_build_object('request_id', v_request.id, 'status', v_status, 'channel', p_source_channel));

  return query select v_request.id, v_status, v_request.submitted_at,
    v_job.revision_used, greatest(0, v_job.revision_limit - v_job.revision_used);
end;
$$;

create or replace function public.create_addon_request(
  p_job_id uuid,
  p_title text,
  p_amount_krw integer default null,
  p_source_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_addon_id uuid;
begin
  if v_owner_id is null then raise exception 'authentication required'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 160 then
    raise exception 'add-on title must be 1..160 characters';
  end if;
  if p_amount_krw is not null and p_amount_krw not between 0 and 1000000000 then
    raise exception 'add-on amount is out of range';
  end if;
  if not exists (
    select 1 from public.jobs j
    where j.id = p_job_id and j.owner_id = v_owner_id and j.status in ('active', 'waiting')
  ) then
    raise exception 'active job not found';
  end if;
  if p_source_request_id is not null and not exists (
    select 1 from public.revision_requests rr
    where rr.id = p_source_request_id and rr.owner_id = v_owner_id and rr.job_id = p_job_id
  ) then
    raise exception 'source request not found';
  end if;

  insert into public.addon_requests (
    owner_id, job_id, source_request_id, title, amount_krw, status
  ) values (
    v_owner_id, p_job_id, p_source_request_id, trim(p_title), p_amount_krw, 'draft'
  ) returning id into v_addon_id;

  insert into public.activity_events (owner_id, job_id, kind, actor, payload)
  values (v_owner_id, p_job_id, 'addon_created', 'owner',
    jsonb_build_object('addon_id', v_addon_id));
  return v_addon_id;
end;
$$;

create or replace function public.set_addon_status(
  p_addon_id uuid,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_addon public.addon_requests%rowtype;
begin
  if v_owner_id is null then raise exception 'authentication required'; end if;
  if p_status not in ('draft', 'offered', 'accepted', 'declined', 'done') then
    raise exception 'invalid add-on status';
  end if;
  select ar.* into v_addon
  from public.addon_requests ar
  where ar.id = p_addon_id and ar.owner_id = v_owner_id
  for update;
  if not found then raise exception 'add-on not found'; end if;
  if v_addon.status = p_status then return p_status; end if;
  if not (
    (v_addon.status = 'draft' and p_status in ('offered', 'declined'))
    or (v_addon.status = 'offered' and p_status in ('accepted', 'declined'))
    or (v_addon.status = 'accepted' and p_status = 'done')
  ) then
    raise exception 'invalid add-on status transition';
  end if;
  update public.addon_requests set status = p_status
  where id = p_addon_id and owner_id = v_owner_id;
  insert into public.activity_events (owner_id, job_id, kind, actor, payload)
  values (v_owner_id, v_addon.job_id, 'addon_status_changed', 'owner',
    jsonb_build_object('addon_id', p_addon_id, 'from', v_addon.status, 'to', p_status));
  return p_status;
end;
$$;

-- Authenticated owner-only reversal. A reversal is a new immutable ledger row;
-- it never deletes or rewrites the client's request evidence or the use event.
create or replace function public.revert_revision_request(
  p_request_id uuid,
  p_reason text,
  p_idempotency_key uuid default gen_random_uuid()
)
returns table (
  event_id uuid,
  request_status text,
  revision_used integer,
  revision_remaining integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner_id uuid := auth.uid();
  v_request public.revision_requests%rowtype;
  v_job public.jobs%rowtype;
  v_use_event public.revision_events%rowtype;
  v_existing_event public.revision_events%rowtype;
  v_revert_event public.revision_events%rowtype;
begin
  if v_owner_id is null then
    raise exception 'authentication required';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'revert reason must be 1..500 characters';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key is required';
  end if;

  select rr.* into v_request
  from public.revision_requests rr
  where rr.id = p_request_id and rr.owner_id = v_owner_id
  for update;

  if not found then
    raise exception 'revision request not found';
  end if;

  select j.* into v_job
  from public.jobs j
  where j.id = v_request.job_id and j.owner_id = v_owner_id
  for update;

  select re.* into v_use_event
  from public.revision_events re
  where re.owner_id = v_owner_id
    and re.source_request_id = v_request.id
    and re.event_type = 'use'
  for update;

  if not found then
    raise exception 'only a counted revision request can be reverted';
  end if;

  select re.* into v_existing_event
  from public.revision_events re
  where re.owner_id = v_owner_id and re.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_event.event_type <> 'revert'
      or v_existing_event.source_request_id <> v_request.id
      or v_existing_event.target_event_id <> v_use_event.id then
      raise exception 'idempotency conflict';
    end if;

    return query select
      v_existing_event.id,
      v_request.status,
      v_job.revision_used,
      greatest(0, v_job.revision_limit - v_job.revision_used);
    return;
  end if;

  if exists (
    select 1 from public.revision_events re
    where re.target_event_id = v_use_event.id and re.event_type = 'revert'
  ) then
    raise exception 'revision request was already reverted';
  end if;

  if v_job.revision_used <= 0 then
    raise exception 'revision counter is already zero';
  end if;

  insert into public.revision_events (
    owner_id, job_id, source_request_id, target_event_id,
    event_type, delta, idempotency_key, reason
  ) values (
    v_owner_id, v_job.id, v_request.id, v_use_event.id,
    'revert', -1, p_idempotency_key, trim(p_reason)
  ) returning * into v_revert_event;

  update public.jobs as j
  set revision_used = j.revision_used - 1
  where j.id = v_job.id and j.owner_id = v_owner_id
  returning * into v_job;

  update public.revision_requests
  set status = 'void', voided_at = now(), void_reason = trim(p_reason)
  where id = v_request.id and owner_id = v_owner_id
  returning * into v_request;

  insert into public.activity_events (owner_id, job_id, kind, actor, payload)
    values (v_owner_id, v_job.id, 'revision_reverted', 'owner',
      jsonb_build_object(
        'request_id', v_request.id,
        'use_event_id', v_use_event.id,
        'revert_event_id', v_revert_event.id
      ));

  return query select
    v_revert_event.id,
    v_request.status,
    v_job.revision_used,
    greatest(0, v_job.revision_limit - v_job.revision_used);
end;
$$;

revoke all on function public.create_job_from_templates(uuid, uuid[], text, date, text, text, text, text, uuid) from public;
grant execute on function public.create_job_from_templates(uuid, uuid[], text, date, text, text, text, text, uuid) to authenticated;
revoke all on function public.set_job_status(uuid, text) from public;
grant execute on function public.set_job_status(uuid, text) to authenticated;
revoke all on function public.set_job_task_status(uuid, text) from public;
grant execute on function public.set_job_task_status(uuid, text) to authenticated;
revoke all on function public.update_job_links(uuid, text, text) from public;
grant execute on function public.update_job_links(uuid, text, text) to authenticated;
revoke all on function public.append_owner_note(uuid, text) from public;
grant execute on function public.append_owner_note(uuid, text) to authenticated;
revoke all on function public.rotate_revision_portal(uuid) from public;
grant execute on function public.rotate_revision_portal(uuid) to authenticated;
revoke all on function public.set_revision_portal_enabled(uuid, boolean) from public;
grant execute on function public.set_revision_portal_enabled(uuid, boolean) to authenticated;
revoke all on function public.submit_manual_revision_request(uuid, text, text, text, text, uuid) from public;
grant execute on function public.submit_manual_revision_request(uuid, text, text, text, text, uuid) to authenticated;
revoke all on function public.create_addon_request(uuid, text, integer, uuid) from public;
grant execute on function public.create_addon_request(uuid, text, integer, uuid) to authenticated;
revoke all on function public.set_addon_status(uuid, text) from public;
grant execute on function public.set_addon_status(uuid, text) to authenticated;

revoke all on function public.submit_revision_request(text, text, text, uuid, text) from public;
grant execute on function public.submit_revision_request(text, text, text, uuid, text) to anon, authenticated;
revoke all on function public.revert_revision_request(uuid, text, uuid) from public;
grant execute on function public.revert_revision_request(uuid, text, uuid) to authenticated;

comment on table public.push_subscriptions is
  'Endpoint and keys must be encrypted by a trusted server/Edge Function before insert; never write plaintext.';
comment on function public.create_job_from_templates(uuid, uuid[], text, date, text, text, text, text, uuid) is
  'Idempotent owner RPC. Derives immutable job price/deadline/revision/task snapshots from owner templates.';
comment on function public.submit_revision_request(text, text, text, uuid, text) is
  'Narrow anonymous revision intake with atomic per-token 15-second/40-per-UTC-day limits. Edge IP throttling and CAPTCHA remain deployment-layer controls.';
comment on function public.revert_revision_request(uuid, text, uuid) is
  'Owner-only idempotent reversal. Appends one revert event and preserves request evidence.';
