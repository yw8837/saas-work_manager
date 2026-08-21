-- Workspace save receipts only exist to make short-lived client retries
-- idempotent. They are not an audit log and must not grow without a bound.

create index if not exists workspace_save_requests_created_at_idx
  on public.workspace_save_requests(created_at);

create or replace function public.cleanup_workspace_save_requests(
  p_before timestamptz default (clock_timestamp() - interval '30 days'),
  p_batch_size integer default 10000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_before is null
    or p_before > clock_timestamp() - interval '30 days' then
    raise exception using errcode = '22023', message = 'receipt_retention_minimum_30_days';
  end if;

  if p_batch_size is null or p_batch_size not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'invalid_cleanup_batch_size';
  end if;

  with expired as (
    select request.owner_id, request.idempotency_key
    from public.workspace_save_requests as request
    where request.created_at < p_before
    order by request.created_at
    limit p_batch_size
    for update skip locked
  ), deleted as (
    delete from public.workspace_save_requests as request
    using expired
    where request.owner_id = expired.owner_id
      and request.idempotency_key = expired.idempotency_key
    returning 1
  )
  select count(*)::integer into v_deleted from deleted;

  return v_deleted;
end;
$$;

revoke all on function public.cleanup_workspace_save_requests(timestamptz, integer) from public;
revoke all on function public.cleanup_workspace_save_requests(timestamptz, integer) from anon, authenticated;
grant execute on function public.cleanup_workspace_save_requests(timestamptz, integer) to service_role;

create or replace function public.cleanup_workspace_save_requests_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cleanup_workspace_save_requests();
  return null;
end;
$$;

revoke all on function public.cleanup_workspace_save_requests_after_insert() from public;
revoke all on function public.cleanup_workspace_save_requests_after_insert() from anon, authenticated;

drop trigger if exists workspace_save_requests_cleanup_expired
  on public.workspace_save_requests;
create trigger workspace_save_requests_cleanup_expired
after insert on public.workspace_save_requests
for each statement
execute function public.cleanup_workspace_save_requests_after_insert();

create or replace function public.get_ilgamcheck_runtime_contract()
returns text
language sql
stable
set search_path = ''
as $$
  select '202608160004'::text;
$$;

revoke all on function public.get_ilgamcheck_runtime_contract() from public;
grant execute on function public.get_ilgamcheck_runtime_contract() to anon, authenticated;
