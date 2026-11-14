-- 2026-11-13 정책 버전 2026-11-13-beta.6: 메인(/)·둘러보기(/try) 화면에 방문 기록 도구(Microsoft Clarity)를 붙인다.
-- 수집 항목·처리자(Microsoft Corporation, 국외 처리)가 늘어나므로 개인정보처리방침에 항목을 넣고 정책 버전을 올린다.
-- 동의 RPC·가입 트리거·공개 계약 함수는 20261103190000과 본문이 같고 버전·bundleDigest만 바뀐다(새 표·새 권한 없음).
-- 옛 동의 기록(beta.3·beta.4·beta.5 행)은 지우지 않는다. 앱은 beta.6 기록이 없는 계정에 동의 화면을 다시 띄운다.
-- 파일 이름 시각은 지금까지처럼 PR #21의 20261104010000보다 앞에 둔다(HANDOFF.md: --include-all 없이 올리기 위해서).
-- 적용 순서(20261103190000과 같음): 이 migration을 먼저 적용하고 곧바로 새 앱을 배포한다.
--   그 사이 옛 앱은 beta.5를 보내므로 아직 동의 기록이 없는 새 가입자만 저장이 막히고, 기존 계정은 그대로 쓴다.

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

  if p_terms_version <> '2026-11-13-beta.6'
    or p_privacy_version <> '2026-11-13-beta.6' then
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
    and new.raw_user_meta_data ->> 'ilgamcheck_terms_version' = '2026-11-13-beta.6'
    and new.raw_user_meta_data ->> 'ilgamcheck_privacy_version' = '2026-11-13-beta.6' then
    insert into public.policy_acceptances (owner_id, terms_version, privacy_version, source)
    values (new.id, '2026-11-13-beta.6', '2026-11-13-beta.6', 'signup')
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
    'bundleDigest', 'sha256:b65f85f4cd339cabcf3828c6fdbb7306c88b126fe6b062ed85f2560cbc653b54',
    'termsVersion', '2026-11-13-beta.6',
    'privacyVersion', '2026-11-13-beta.6'
  );
$$;

revoke all on function public.get_ilgamcheck_policy_publication_contract() from public;
grant execute on function public.get_ilgamcheck_policy_publication_contract() to anon, authenticated, service_role;
