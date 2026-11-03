-- 2026-11-03 사용자 지시: 베타 이용 코드가 여는 Pro 기간을 30일에서 14일로 줄인다.
-- 이미 적용된 이용권(beta_grants 등)의 만료일은 건드리지 않는다. 앞으로 적용하는 코드만 14일이다.
alter table public.invite_codes alter column grant_days set default 14;

update public.invite_codes
set grant_days = 14
where grant_days = 30;
