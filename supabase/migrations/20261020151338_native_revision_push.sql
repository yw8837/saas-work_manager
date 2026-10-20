-- Native notification delivery is independent of revision accounting.
-- No production application until local Supabase integration and deployment approval.
create schema if not exists ilgam_private;
revoke all on schema ilgam_private from public, anon, authenticated;
grant usage on schema ilgam_private to authenticated, service_role;

create table public.native_push_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  installation_id uuid not null unique,
  platform text not null check (platform in ('android','ios')),
  token text not null unique check (char_length(token) between 32 and 4096 and token !~ '[[:space:]]'),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create index native_push_devices_owner_idx on public.native_push_devices(owner_id);
create table public.native_revision_outbox (
  request_id uuid primary key references public.workspace_revision_requests(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_key text not null check (char_length(job_key) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.native_push_attempts (
  request_id uuid not null references public.native_revision_outbox(request_id) on delete cascade,
  device_id uuid not null references public.native_push_devices(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent','discarded')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key(request_id,device_id)
);
create index native_push_attempts_due_idx on public.native_push_attempts(next_attempt_at)
  where status in ('pending','sending');
alter table public.native_push_devices enable row level security;
alter table public.native_revision_outbox enable row level security;
alter table public.native_push_attempts enable row level security;
revoke all on public.native_push_devices, public.native_revision_outbox, public.native_push_attempts
  from public, anon, authenticated;
grant all on public.native_push_devices, public.native_revision_outbox, public.native_push_attempts to service_role;

create function ilgam_private.register_native_push_device(p_installation_id uuid,p_platform text,p_token text)
returns void language plpgsql security definer set search_path='' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null or not exists(select 1 from public.profiles where id=v_owner) then
    raise insufficient_privilege using message='authentication_required';
  end if;
  if p_installation_id is null or p_platform is null or p_platform not in ('android','ios')
    or coalesce(char_length(p_token),0) not between 32 and 4096 or p_token ~ '[[:space:]]' then
    raise invalid_parameter_value using message='invalid_native_device';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('native-owner:'||v_owner::text,0));
  perform pg_advisory_xact_lock(hashtextextended('native-installation:'||p_installation_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('native-token:'||p_token,0));
  -- Token/installation are not readable by clients. A new binding gets a new
  -- device ID, cascading all old queued attempts before a new owner can receive.
  delete from public.native_push_devices
    where (installation_id=p_installation_id or token=p_token)
      and (owner_id<>v_owner or installation_id<>p_installation_id);
  if not exists(select 1 from public.native_push_devices where installation_id=p_installation_id)
    and (select count(*) from public.native_push_devices where owner_id=v_owner)>=10 then
    raise invalid_parameter_value using message='native_device_limit';
  end if;
  insert into public.native_push_devices(owner_id,installation_id,platform,token)
    values(v_owner,p_installation_id,p_platform,p_token)
  on conflict(installation_id) do update set
    platform=excluded.platform,token=excluded.token,enabled=true,updated_at=clock_timestamp();
end $$;
create function public.register_native_push_device(p_installation_id uuid,p_platform text,p_token text)
returns void language sql security invoker set search_path='' as $$
  select ilgam_private.register_native_push_device(p_installation_id,p_platform,p_token);
$$;
create function ilgam_private.revoke_native_push_device(p_installation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise insufficient_privilege using message='authentication_required'; end if;
  delete from public.native_push_devices where installation_id=p_installation_id and owner_id=auth.uid();
end $$;
create function public.revoke_native_push_device(p_installation_id uuid)
returns void language sql security invoker set search_path='' as $$
  select ilgam_private.revoke_native_push_device(p_installation_id);
$$;
revoke all on function ilgam_private.register_native_push_device(uuid,text,text),
  ilgam_private.revoke_native_push_device(uuid),public.register_native_push_device(uuid,text,text),
  public.revoke_native_push_device(uuid) from public,anon,authenticated;
grant execute on function ilgam_private.register_native_push_device(uuid,text,text),
  ilgam_private.revoke_native_push_device(uuid),public.register_native_push_device(uuid,text,text),
  public.revoke_native_push_device(uuid) to authenticated,service_role;

create function ilgam_private.enqueue_native_revision_push()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.native_revision_outbox(request_id,owner_id,job_key)
    values(new.id,new.owner_id,new.job_key) on conflict do nothing;
  insert into public.native_push_attempts(request_id,device_id)
    select new.id,d.id from public.native_push_devices d
    where d.owner_id=new.owner_id and d.enabled
    on conflict do nothing;
  return new;
end $$;
revoke all on function ilgam_private.enqueue_native_revision_push() from public,anon,authenticated;
create trigger enqueue_native_revision_push after insert on public.workspace_revision_requests
  for each row execute function ilgam_private.enqueue_native_revision_push();

create function public.claim_native_push_batch(p_limit integer default 10)
returns table(request_id uuid,device_id uuid,lease_id uuid,token text,platform text,job_key text)
language plpgsql security invoker set search_path='' as $$
begin
  if p_limit is null or p_limit not between 1 and 25 then
    raise invalid_parameter_value using message='invalid_batch_limit';
  end if;
  update public.native_push_attempts a set status='discarded',lease_id=null,lease_until=null
    where a.status in('pending','sending') and (
      (a.attempts>=5 and (a.lease_until is null or a.lease_until<clock_timestamp()))
      or not exists(select 1 from public.native_push_devices d
        join public.native_revision_outbox o on o.request_id=a.request_id
        where d.id=a.device_id and d.enabled and d.owner_id=o.owner_id)
    );
  return query
    with due as (
      select a.request_id,a.device_id from public.native_push_attempts a
      join public.native_push_devices d on d.id=a.device_id and d.enabled
      join public.native_revision_outbox o on o.request_id=a.request_id and o.owner_id=d.owner_id
      where a.attempts<5 and (
        (a.status='pending' and a.next_attempt_at<=clock_timestamp())
        or (a.status='sending' and a.lease_until<clock_timestamp()))
      order by a.next_attempt_at
      limit p_limit for update of a skip locked
    ), claimed as (
      update public.native_push_attempts a
        set status='sending',attempts=a.attempts+1,lease_id=gen_random_uuid(),
            lease_until=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp()
      from due where a.request_id=due.request_id and a.device_id=due.device_id
      returning a.request_id,a.device_id,a.lease_id
    )
    select c.request_id,c.device_id,c.lease_id,d.token,d.platform,o.job_key
      from claimed c join public.native_push_devices d on d.id=c.device_id
      join public.native_revision_outbox o on o.request_id=c.request_id;
end $$;

create function public.is_native_push_claim_current(p_request_id uuid,p_device_id uuid,p_lease_id uuid,p_token text)
returns boolean language sql security invoker set search_path='' as $$
  select exists(
    select 1 from public.native_push_attempts a
    join public.native_push_devices d on d.id=a.device_id
    join public.native_revision_outbox o on o.request_id=a.request_id and o.owner_id=d.owner_id
    where a.request_id=p_request_id and a.device_id=p_device_id and a.lease_id=p_lease_id
      and a.status='sending' and a.lease_until>clock_timestamp() and d.enabled and d.token=p_token
  );
$$;

create function public.finish_native_push_attempt(p_request_id uuid,p_device_id uuid,p_lease_id uuid,p_result text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_attempts integer;
begin
  if p_result is null or p_result not in ('sent','retry','invalid','discarded') then
    raise invalid_parameter_value using message='invalid_push_result';
  end if;
  select a.attempts into v_attempts from public.native_push_attempts a
    where a.request_id=p_request_id and a.device_id=p_device_id and a.lease_id=p_lease_id
      and a.status='sending' and a.lease_until>clock_timestamp() for update;
  if not found then return; end if;
  if p_result='invalid' then
    update public.native_push_devices set enabled=false,updated_at=clock_timestamp() where id=p_device_id;
  end if;
  update public.native_push_attempts a set
    status=case when p_result='sent' then 'sent'
      when p_result='retry' and v_attempts<5 then 'pending' else 'discarded' end,
    next_attempt_at=clock_timestamp()+make_interval(secs=>case v_attempts when 1 then 60 when 2 then 300 when 3 then 900 else 3600 end),
    lease_id=null,lease_until=null,updated_at=clock_timestamp()
    where a.request_id=p_request_id and a.device_id=p_device_id;
end $$;
revoke all on function public.claim_native_push_batch(integer),
  public.is_native_push_claim_current(uuid,uuid,uuid,text),
  public.finish_native_push_attempt(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_native_push_batch(integer),
  public.is_native_push_claim_current(uuid,uuid,uuid,text),
  public.finish_native_push_attempt(uuid,uuid,uuid,text) to service_role;
