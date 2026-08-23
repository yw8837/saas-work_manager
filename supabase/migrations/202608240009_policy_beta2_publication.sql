-- The public beta policy wording and versions changed together. Keep the
-- acceptance path and the database publication contract in lockstep.

create or replace function public.accept_current_policies(
  p_terms_version text,
  p_privacy_version text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_accepted_at timestamptz;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if p_terms_version <> '2026-08-24-beta.2'
    or p_privacy_version <> '2026-08-24-beta.2' then
    raise exception using errcode = '22023', message = 'outdated_policy_version';
  end if;

  insert into public.policy_acceptances (owner_id, terms_version, privacy_version, source)
  values (v_owner, p_terms_version, p_privacy_version, 'in_app')
  on conflict (owner_id, terms_version, privacy_version) do nothing;

  select acceptance.accepted_at
  into v_accepted_at
  from public.policy_acceptances as acceptance
  where acceptance.owner_id = v_owner
    and acceptance.terms_version = p_terms_version
    and acceptance.privacy_version = p_privacy_version;

  return v_accepted_at;
end;
$$;

revoke all on function public.accept_current_policies(text, text) from public;
grant execute on function public.accept_current_policies(text, text) to authenticated;

create or replace function public.record_signup_policy_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'ilgamcheck_policy_accepted' = 'true'
    and new.raw_user_meta_data ->> 'ilgamcheck_terms_version' = '2026-08-24-beta.2'
    and new.raw_user_meta_data ->> 'ilgamcheck_privacy_version' = '2026-08-24-beta.2' then
    insert into public.policy_acceptances (owner_id, terms_version, privacy_version, source)
    values (new.id, '2026-08-24-beta.2', '2026-08-24-beta.2', 'signup')
    on conflict (owner_id, terms_version, privacy_version) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.get_ilgamcheck_policy_publication_contract()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'finalized', false,
    'bundleDigest', 'sha256:008eb53debda8410ee4c262a0a188cfd859a23a9729700933782ab49f88f46be',
    'termsVersion', '2026-08-24-beta.2',
    'privacyVersion', '2026-08-24-beta.2'
  );
$$;

revoke all on function public.get_ilgamcheck_policy_publication_contract() from public;
grant execute on function public.get_ilgamcheck_policy_publication_contract() to anon, authenticated, service_role;

create or replace function public.get_ilgamcheck_runtime_contract()
returns text
language sql
stable
set search_path = ''
as $$
  select '202608240009'::text;
$$;

revoke all on function public.get_ilgamcheck_runtime_contract() from public;
grant execute on function public.get_ilgamcheck_runtime_contract() to anon, authenticated, service_role;

create or replace function public.get_ilgamcheck_service_role_contract()
returns text
language sql
stable
set search_path = ''
as $$
  select '202608240009'::text;
$$;

revoke all on function public.get_ilgamcheck_service_role_contract() from public, anon, authenticated;
grant execute on function public.get_ilgamcheck_service_role_contract() to service_role;
