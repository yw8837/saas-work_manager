-- 2026-11-10 사용자 결정 "둘 다"(핸디핏 랜딩 + 우리 앱에 유입 경로 기록):
-- 메일·블로그·크몽 등 어느 링크로 가입했는지 계정당 한 번만 남긴다(대시보드에서 경로별 가입을 센다).
-- 수집 항목이 늘어나므로 개인정보처리방침 1절 표에 '유입 경로 확인' 행을 넣고 정책 버전을 2026-11-11-beta.5로 올린다.
-- 동의 RPC·가입 트리거·공개 계약 함수는 20261103160000과 본문이 같고 버전·bundleDigest만 바뀐다.
-- 옛 동의 기록(beta.3·beta.4 행)은 지우지 않는다. 앱은 beta.5 기록이 없는 계정에 동의 화면을 다시 띄운다.
-- 적용 순서(20261103160000과 같음): 이 migration을 먼저 적용하고 곧바로 새 앱을 배포한다.
--   그 사이 옛 앱은 beta.4를 보내므로 아직 동의 기록이 없는 새 가입자만 저장이 막히고, 기존 계정은 그대로 쓴다.

-- 1) 유입 경로 기록. 값은 우리가 링크에 붙인 경로 표시(소문자·숫자·_·- 40자)다.
--    형식만으로 개인정보를 다 막지는 못한다(로마자 이름 등). 그래서 운영 규칙으로 받는 사람을 구분하는 값은 링크에 붙이지 않고,
--    전화번호처럼 숫자가 6자리 이상 이어지는 값은 함수가 받지 않는다.
create table public.signup_sources (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  source text not null check (source ~ '^[a-z0-9_-]{1,40}$'),
  medium text check (medium is null or medium ~ '^[a-z0-9_-]{1,40}$'),
  campaign text check (campaign is null or campaign ~ '^[a-z0-9_-]{1,40}$'),
  recorded_at timestamptz not null default now()
);

comment on table public.signup_sources is '가입 유입 경로(계정당 한 번). 운영 집계 전용: 브라우저는 읽지도 쓰지도 못하고 record_signup_source RPC만 쓴다.';

-- 정책을 하나도 두지 않는다: anon·authenticated는 직접 읽기·쓰기가 모두 막힌다.
alter table public.signup_sources enable row level security;
revoke all on table public.signup_sources from public, anon, authenticated;

-- 약관 동의가 끝난 새 계정(가입 뒤 하루 안)에만 한 번 남긴다. 형식이 틀리거나 조건이 안 맞으면 오류 없이 false.
-- 기존 계정이 나중에 메일 링크를 눌러도 '메일로 가입'으로 잘못 세지 않으려는 것이다.
create function public.record_signup_source(
  p_source text,
  p_medium text default null,
  p_campaign text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_source text := lower(btrim(coalesce(p_source, '')));
  v_medium text := lower(btrim(coalesce(p_medium, '')));
  v_campaign text := lower(btrim(coalesce(p_campaign, '')));
  v_rows integer;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if v_source !~ '^[a-z0-9_-]{1,40}$' or v_source ~ '[0-9]{6,}' then
    return false;
  end if;
  if v_medium !~ '^[a-z0-9_-]{1,40}$' or v_medium ~ '[0-9]{6,}' then
    v_medium := null;
  end if;
  if v_campaign !~ '^[a-z0-9_-]{1,40}$' or v_campaign ~ '[0-9]{6,}' then
    v_campaign := null;
  end if;

  -- 가입 시각은 auth.users에서 본다. profiles.created_at은 본인이 고칠 수 있어 기준으로 쓰지 않는다.
  if not exists (
    select 1 from auth.users as account
    where account.id = v_owner and account.created_at > now() - interval '1 day'
  ) then
    return false;
  end if;

  if not exists (
    select 1 from public.policy_acceptances as acceptance where acceptance.owner_id = v_owner
  ) then
    return false;
  end if;

  insert into public.signup_sources (owner_id, source, medium, campaign)
  values (v_owner, v_source, v_medium, v_campaign)
  on conflict (owner_id) do nothing;
  get diagnostics v_rows = row_count;

  return v_rows = 1;
end;
$$;

revoke execute on function public.record_signup_source(text, text, text) from public, anon;
grant execute on function public.record_signup_source(text, text, text) to authenticated, service_role;

-- 2) 정책 버전 2026-11-11-beta.5
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

  if p_terms_version <> '2026-11-11-beta.5'
    or p_privacy_version <> '2026-11-11-beta.5' then
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
    and new.raw_user_meta_data ->> 'ilgamcheck_terms_version' = '2026-11-11-beta.5'
    and new.raw_user_meta_data ->> 'ilgamcheck_privacy_version' = '2026-11-11-beta.5' then
    insert into public.policy_acceptances (owner_id, terms_version, privacy_version, source)
    values (new.id, '2026-11-11-beta.5', '2026-11-11-beta.5', 'signup')
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
    'bundleDigest', 'sha256:11feb9c1f524ebc45012c9422b598b2bdcc80614a7bed3da5d42a233d2ba322a',
    'termsVersion', '2026-11-11-beta.5',
    'privacyVersion', '2026-11-11-beta.5'
  );
$$;

revoke all on function public.get_ilgamcheck_policy_publication_contract() from public;
grant execute on function public.get_ilgamcheck_policy_publication_contract() to anon, authenticated, service_role;
