-- One account receives one 30-day beta grant in total, regardless of which
-- campaign code is entered. The profile row lock serializes concurrent calls.

create or replace function public.redeem_invite_code(p_code text)
returns table(status text, ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_code public.invite_codes%rowtype;
  v_ends_at timestamptz;
  v_recent integer;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  perform 1 from public.profiles as profile where profile.id = v_owner for update;
  if not found then
    raise exception using errcode = '42501', message = 'profile_not_found';
  end if;

  select count(*)::integer into v_recent
  from public.invite_attempts
  where owner_id = v_owner
    and not succeeded
    and attempted_at > now() - interval '1 hour';

  if v_recent >= 10 then
    return query select 'rate_limited'::text, null::timestamptz;
    return;
  end if;

  -- The account, not the campaign code, owns the one-time grant.
  if exists (
    select 1 from public.invite_redemptions
    where owner_id = v_owner
  ) then
    return query select 'already_redeemed'::text, null::timestamptz;
    return;
  end if;

  select * into v_code
  from public.invite_codes
  where code = upper(btrim(coalesce(p_code, '')))
  for update;

  if not found
    or (v_code.expires_at is not null and v_code.expires_at <= now())
    or v_code.redeemed_count >= v_code.max_redemptions then
    insert into public.invite_attempts (owner_id, succeeded) values (v_owner, false);
    return query select 'invalid'::text, null::timestamptz;
    return;
  end if;

  insert into public.invite_attempts (owner_id, succeeded) values (v_owner, true);
  insert into public.invite_redemptions (code, owner_id) values (v_code.code, v_owner);
  update public.invite_codes
  set redeemed_count = redeemed_count + 1
  where code = v_code.code;

  v_ends_at := now() + make_interval(days => v_code.grant_days);

  insert into public.subscriptions (owner_id, beta_ends_at, updated_at)
  values (v_owner, v_ends_at, now())
  on conflict (owner_id) do update
  set beta_ends_at = greatest(
        coalesce(public.subscriptions.beta_ends_at, '-infinity'::timestamptz),
        v_ends_at
      ),
      updated_at = now();

  return query select 'ok'::text, v_ends_at;
end;
$$;

revoke all on function public.redeem_invite_code(text) from public, anon;
grant execute on function public.redeem_invite_code(text) to authenticated;

create or replace function public.get_ilgamcheck_runtime_contract()
returns text
language sql
stable
set search_path = ''
as $$
  select '202608250011'::text;
$$;

revoke all on function public.get_ilgamcheck_runtime_contract() from public;
grant execute on function public.get_ilgamcheck_runtime_contract() to anon, authenticated, service_role;

create or replace function public.get_ilgamcheck_service_role_contract()
returns text
language sql
stable
set search_path = ''
as $$
  select '202608250011'::text;
$$;

revoke all on function public.get_ilgamcheck_service_role_contract() from public, anon, authenticated;
grant execute on function public.get_ilgamcheck_service_role_contract() to service_role;
