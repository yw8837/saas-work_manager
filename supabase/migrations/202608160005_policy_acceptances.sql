-- Immutable evidence of the terms/privacy versions accepted for account use.
-- New hosted sign-ups are closed by default at the Auth configuration layer;
-- invited users and explicitly enabled beta sign-ups share this record path.

create table public.policy_acceptances (
  owner_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null check (char_length(terms_version) between 1 and 80),
  privacy_version text not null check (char_length(privacy_version) between 1 and 80),
  accepted_at timestamptz not null default now(),
  source text not null check (source in ('signup', 'in_app')),
  primary key (owner_id, terms_version, privacy_version)
);

alter table public.policy_acceptances enable row level security;

create policy policy_acceptances_owner_select on public.policy_acceptances
for select to authenticated
using (owner_id = (select auth.uid()));

revoke all on table public.policy_acceptances from anon, authenticated;
grant select on table public.policy_acceptances to authenticated;

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

  if p_terms_version <> '2026-08-16-beta.1'
    or p_privacy_version <> '2026-08-16-beta.1' then
    raise exception using errcode = '22023', message = 'outdated_policy_version';
  end if;

  insert into public.policy_acceptances (
    owner_id,
    terms_version,
    privacy_version,
    source
  ) values (
    v_owner,
    p_terms_version,
    p_privacy_version,
    'in_app'
  )
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
    and new.raw_user_meta_data ->> 'ilgamcheck_terms_version' = '2026-08-16-beta.1'
    and new.raw_user_meta_data ->> 'ilgamcheck_privacy_version' = '2026-08-16-beta.1' then
    insert into public.policy_acceptances (
      owner_id,
      terms_version,
      privacy_version,
      source
    ) values (
      new.id,
      '2026-08-16-beta.1',
      '2026-08-16-beta.1',
      'signup'
    )
    on conflict (owner_id, terms_version, privacy_version) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_record_policy_acceptance on auth.users;
create trigger on_auth_user_record_policy_acceptance
after insert on auth.users
for each row execute procedure public.record_signup_policy_acceptance();

create or replace function public.get_ilgamcheck_runtime_contract()
returns text
language sql
stable
set search_path = ''
as $$
  select '202608160005'::text;
$$;

revoke all on function public.get_ilgamcheck_runtime_contract() from public;
grant execute on function public.get_ilgamcheck_runtime_contract() to anon, authenticated;
