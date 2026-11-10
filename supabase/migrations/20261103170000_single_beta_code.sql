-- 버전을 PR #21의 20261104010000 앞에 둔다. 그래야 그 migration을 --include-all 없이 올릴 수 있다.
-- 2026-11-05 사용자 지시: 베타 이용 코드는 범용 코드 BETA2026 하나만 쓴다.
-- 경로별 코드 KMONG2026·SOOMGO2026은 사용 0회라 지우지 않고 만료 처리로 닫는다. 이미 적용된 이용권은 건드리지 않는다.
update public.invite_codes
set expires_at = now()
where code in ('KMONG2026', 'SOOMGO2026')
  and expires_at is null;
