# Release Rules
<!-- last-analyzed: 2026-08-16T13:59:35Z -->

## Version Sources

- `package.json`의 `version`이 유일한 제품 버전 원본이다. 현재 버전은 `0.1.0`이다.
- 별도 version bump 도구나 package registry publish 자동화는 없다.

## Release Trigger

- 현재 배포 기준은 Git tag가 아니라 수동 Vercel Preview 배포다.
- Git 저장소가 연결되면 `.github/workflows/release-gate.yml`이 `main` push와 pull request에서 검증을 실행한다.
- 실제 Supabase migration과 Vercel Preview는 창업자 계정에서 명시적으로 실행한다.

## Test Gate

- 전체 로컬 게이트: `npm run check:release`
- 구성: unit, lint, typecheck, production dependency audit, local production build/E2E, Hosted fail-closed build.
- 외부 게이트: `npm run smoke:remote -- <preview-url>` 및 전용 A/B 계정으로 `npm run verify:hosted`.
- 외부 게이트를 통과하지 않으면 Hosted 무료 베타 완료로 판정하지 않는다.

## Registry / Distribution

- npm/PyPI/Docker registry 배포는 없다.
- 배포 대상은 Vercel의 Next.js 앱과 Supabase Postgres/Auth/Realtime이다.
- `vercel.json`은 `npm ci`와 `npm run check:deploy`를 강제한다.

## Release Notes Strategy

- `CHANGELOG.md`는 아직 없다.
- 초기 `0.1.0` 베타는 `docs/final-delivery.md`를 기능·제약·외부검증 인수 기록으로 사용한다.
- 이후 릴리스부터 사용자 가시 변경을 기능/수정/제약으로 구분해 기록한다.

## CI Workflow Files

- `.github/workflows/release-gate.yml`

## First-Time Setup Gaps

- 이 앱 경로와 상위 `SaaS` 폴더 모두 아직 Git 저장소가 아니며 tag도 없다.
- Git이 없어도 Vercel CLI Preview 경로는 지원한다. 저장소 초기화 위치는 여러 SaaS 운영 구조를 정한 뒤 결정한다.
- 실제 Supabase/Vercel 프로젝트 연결, custom SMTP, 운영 정책 값, 도메인 연결은 외부 계정 단계다.
