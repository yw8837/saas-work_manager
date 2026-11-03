-- 2026-11-03 사용자 결정 "약관도 14일로": 베타 이용 코드 Pro 기간(20261103150000)에 맞춰
-- 약관·개인정보처리방침 문구의 30일을 14일로 고치고, 개인정보처리방침의 호스팅 처리자를 실제 호스팅인
-- Cloudflare로 바로잡고(2026-11-01 전환), 정책 버전을 2026-11-03-beta.4로 올린다.
-- 동의 RPC·가입 트리거·공개 계약 함수를 화면 manifest(src/lib/policy-publication-manifest.json)와 같은 값으로 맞춘다.
-- 옛 동의 기록(policy_acceptances의 beta.3 행)은 지우지 않는다. 앱은 beta.4 기록이 없는 계정에 동의 화면을 다시 띄운다.
-- 런타임 계약 버전(get_ilgamcheck_runtime_contract, 202608250011)은 202608260012처럼 그대로 둔다.
-- 적용 순서: 앱과 이 migration 사이에 틈이 있으면 동의 저장이 'outdated_policy_version'으로 막힌다.
--   - 새 앱 먼저: 그 틈 동안 다시 로그인·새로고침한 모든 계정(새 가입 포함)이 동의 화면에서 저장 실패.
--   - 이 migration 먼저: 옛 앱은 beta.3을 보내므로 아직 동의 기록이 없는 새 가입자만 저장 실패, 기존 계정은 그대로 쓴다.
--   그래서 다른 순서 제약이 없으면 이 migration을 먼저 적용하고 곧바로 새 앱을 배포한다.
--   20261103120000(새 앱 뒤에 적용)과 한 번에 push하면 그 순서를 따를 수밖에 없으니 앱 배포 직후 곧바로 적용한다.

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

  if p_terms_version <> '2026-11-03-beta.4'
    or p_privacy_version <> '2026-11-03-beta.4' then
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

-- 20260926140654와 같은 실행 권한: 로그인 사용자·서버만.
revoke execute on function public.accept_current_policies(text, text) from public, anon;
grant execute on function public.accept_current_policies(text, text) to authenticated, service_role;

create or replace function public.record_signup_policy_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'ilgamcheck_policy_accepted' = 'true'
    and new.raw_user_meta_data ->> 'ilgamcheck_terms_version' = '2026-11-03-beta.4'
    and new.raw_user_meta_data ->> 'ilgamcheck_privacy_version' = '2026-11-03-beta.4' then
    insert into public.policy_acceptances (owner_id, terms_version, privacy_version, source)
    values (new.id, '2026-11-03-beta.4', '2026-11-03-beta.4', 'signup')
    on conflict (owner_id, terms_version, privacy_version) do nothing;
  end if;

  return new;
end;
$$;

-- 트리거 함수는 아무도 직접 실행하지 않는다(20260926140654와 같음).
revoke execute on function public.record_signup_policy_acceptance() from public, anon, authenticated;

create or replace function public.get_ilgamcheck_policy_publication_contract()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'finalized', false,
    'bundleDigest', 'sha256:893f6274790fc040aac49950bc44f7d4f0f58b38c8e1f9060372bcf80020567a',
    'termsVersion', '2026-11-03-beta.4',
    'privacyVersion', '2026-11-03-beta.4'
  );
$$;

revoke all on function public.get_ilgamcheck_policy_publication_contract() from public;
grant execute on function public.get_ilgamcheck_policy_publication_contract() to anon, authenticated, service_role;
