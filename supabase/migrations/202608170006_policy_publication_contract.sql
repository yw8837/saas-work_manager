-- Bind the deployed public privacy/terms publication to the database policy
-- versions. Future changes to either public document, version or finalized
-- state require a new append-only migration; never edit an applied file.

create or replace function public.get_ilgamcheck_policy_publication_contract()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'finalized', false,
    'bundleDigest', 'sha256:02f684b3febd9ec637dac82cf161212d788bd9ef130a083fd609363bf13e1349',
    'termsVersion', '2026-08-16-beta.1',
    'privacyVersion', '2026-08-16-beta.1'
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
  select '202608170006'::text;
$$;

revoke all on function public.get_ilgamcheck_runtime_contract() from public;
grant execute on function public.get_ilgamcheck_runtime_contract() to anon, authenticated, service_role;

-- A dedicated, data-free role probe proves that a configured server key is
-- mapped to service_role instead of merely being accepted by the gateway.
create or replace function public.get_ilgamcheck_service_role_contract()
returns text
language sql
stable
set search_path = ''
as $$
  select '202608170006'::text;
$$;

revoke all on function public.get_ilgamcheck_service_role_contract() from public, anon, authenticated;
grant execute on function public.get_ilgamcheck_service_role_contract() to service_role;
