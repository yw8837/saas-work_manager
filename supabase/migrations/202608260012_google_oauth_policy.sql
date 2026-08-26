-- Google OAuth-only login changes the published authentication description.
-- Keep the database publication contract in lockstep with the visible policy.

create or replace function public.get_ilgamcheck_policy_publication_contract()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'finalized', false,
    'bundleDigest', 'sha256:5779800438a9fcd031740a8632879a21d499087a7384749e2266548c2cf164c1',
    'termsVersion', '2026-08-24-beta.3',
    'privacyVersion', '2026-08-24-beta.3'
  );
$$;

revoke all on function public.get_ilgamcheck_policy_publication_contract() from public;
grant execute on function public.get_ilgamcheck_policy_publication_contract() to anon, authenticated, service_role;
