# 2026-10-10 서비스 결함·운영 준비 재점검

## 범위와 상태

대표 주소는 https://ilgam.studioyeolmae.com/ 이다. 기존 주소도 심사 링크 호환용으로 유지한다.
2026-10-10 확인 시 Sites v31은 active/public, Supabase `evhkpgxacpweelnmjmqh`는 ACTIVE_HEALTHY였다.
사용자는 이번 수정의 검사 통과 후 PR 병합·배포를 승인했다. Supabase 유료 전환은 승인하지 않았으며 Cloudflare/Firebase 대안을 질문했다. 이전·구독·DNS·실제 계정 삭제는 이번 수정에 포함하지 않는다.

## 발견과 수정

1. **HTML 경로 HEAD 오응답**: 운영 `/today`, `/privacy`, `/terms`에서 Accept:text/html HEAD가 404였다. Sites Worker의 HTML 탐색 판정이 GET에 한정돼 있던 원인이다. HEAD에도 같은 탐색 판정을 적용하고 본문은 기존 공통 보안 응답 처리에서 제거한다. 없는 자산/API의 404는 유지한다. 신규 5개 실패를 먼저 재현한 뒤 37개 Worker 테스트 통과.
2. **검증용 정리 대상이 너무 넓음**: 임시 검증 CLI가 VERIFYA/B 접두어 및 테스트 이메일 패턴으로 과거·동시 실행 데이터를 함께 삭제할 수 있었다. 이번 호출에서 생성 성공한 정확한 user ID/code만 메모리에 기록하고 종료 시 정리하도록 변경했다. 중복 삽입 실패는 기존 데이터 소유권을 얻지 않는다. 정리 실패도 실패로 끝내고 검증 오류를 함께 보존한다. 강제 종료/응답 유실까지 영속 회수를 보장하는 설계는 아니다.
3. **출시 검사와 현재 인증/호스팅 불일치**: 실제 Sites/Google-only인데 Vercel·SMTP·password AMR를 요구하던 검사를 정렬했다. A/B 세션 token pair 전달을 추가하고 환경변수 allowlist/명시적 전용 계정 덮어쓰기 ACK는 유지했다. Google 탈퇴 증거 schema3와 legacy password schema2를 구분한다. 정책 미확정과 미확보 운영 증거를 통과시키지는 않는다.
4. **의존성 보안 업데이트**: Next/@next/env/eslint-config-next 16.3.8, sharp 0.35.5, Wrangler 4.149.0으로 잠금 파일을 갱신했다. 수정 전 운영 audit high 4개 경로, 수정 후 `npm audit --omit=dev` 0건. `npm audit fix --force` 및 Next 14로 강제 하향은 사용하지 않았다.
5. **인증 검사 대상 결합**: 독립 리뷰에서 Auth 검사 대상이 공개 runtime 프로젝트와 달라도 통과할 가능성을 발견했다. 공개 Supabase URL의 project ref와 로컬 연결 ref를 비교하고 누락·불일치면 관리 API 호출 전에 차단한다. 두 회귀 테스트의 RED→GREEN 및 독립 재검토에서 차단과 API 미호출을 확인했다.

## 로컬 검사 결과

- 전체 `check:release` 성공: unit/lint/typecheck/운영 audit/Next production build/로컬 E2E 56개/hosted fail-closed build.
- 마지막 Auth 대상 결합 수정까지 포함한 unit 재실행: **97개 파일, 590개 테스트 통과**.
- `build:sites`와 `verify-sites-output.mjs` 성공. 운영 origin을 지정해 Worker/client 산출물 및 HTML 보안 경계 구조를 확인했다.
- 독립 리뷰: 임시 검증 정리·HEAD 변경 및 최종 Auth 대상 결합 재검토에서 남은 blocking 결함 없음. 검토 범위 밖 모든 결함의 부재를 보장하지 않는다.

## 실제 운영에서 확인한 범위

- Sites public smoke 9/9: health ready/no-store, 공개 설정, root/today/privacy/terms, manifest/service-worker/favicon.
- 공개 Auth 설정: Google=true, email=false, 활성 provider는 Google 하나.
- 격리 Chrome 데스크톱 1440px/모바일 390px의 root/today/privacy/terms **8/8**: HTTP200, 화면 렌더, 가로 넘침 없음, pageerror 없음, Google 버튼 표시.
- 운영 DB의 `rpc_execution_surface.sql`: 유효 권한 **23/23** true.
- 운영 DB의 `workspace_job_deletion.sql`: 합성 소유자의 저장 RPC, 일감 삭제 후 요청 정리, 유지 일감·다른 소유자 보존, 일반 편집, 반복 저장, 고객 요청·재시도, 삭제 링크 거부 모두 PASS. 테스트는 내부 예외 블록에서 롤백했고 합성 사용자가 남지 않는 조건도 확인했다.
- 검사 전후 Auth user 2, workspace 2, verification user 0, verification code 0으로 동일. 기존 사용자 자료를 삭제하거나 복원하지 않았다.
- 최근 7일 error-filter 로그 최대100 조회 결과 42개: 모두 HTTP404/outcome=ok. HEAD 오류와 robots/sitemap 및 자동 탐색 요청이 포함됐다. 이 범위에서 5xx/Worker exception은 없었다. 전 기간 무장애나 공격 흔적 부재의 증명은 아니다.

## 검증의 경계

- 위 DB 합성 검사는 실제 Google 계정의 브라우저 로그인/탈퇴 및 Realtime end-to-end 증거가 아니다.
- `verify:hosted:ephemeral`은 로컬 Supabase CLI의 관리자 자격 증명 읽기 단계에서 실패했다. 계정 생성 전 종료되었으며 Google 로그인 검증 성공으로 기록하지 않는다.
- `runtime:readback`의 로컬 link 누락과 `check:deploy-env`의 로컬 env 누락은 운영 서버 장애가 아니다. 운영 health 및 연결 도구의 현재 상태와 구분한다.
- `policy.finalized=false` 유지. 국외이전 고지·보관기간의 실제 운영 값, 정책 검토, 실제 탈퇴·별도 복구 증거가 확보되지 않은 상태에서 true 또는 완료 증거를 만들지 않았다.
- 개발 전용 ESLint→fast-glob→micromatch→braces의 미패치 advisory GHSA-vfj7-8cjw-p6xm은 5개 경로로 남아 있다. 운영 의존성 audit0과 전체 개발 의존성 audit0은 다르다. 공개 입력을 lint glob으로 받지 않는 로컬/CI 경로이며 강제 하위 버전 전환은 하지 않는다.

## 배포 영수증

PR/CI와 운영 배포 결과는 검사 완료 후 이 문서 또는 HANDOFF 최신 절에 추가한다. 이 절 자체는 배포 완료 증거가 아니다.

## 유휴 정지와 이전 판단

현재 무료 Supabase 조직에는 일감체크와 다른 프로젝트 1개가 있다. 웹은 이미 Sites/Cloudflare Workers 기반이다. 화면 서버만 Cloudflare로 바꿔도 Supabase DB 유휴 정지는 없어지지 않는다.

- 현 구조 보존: Supabase Pro는 기본 $25/월, 추가 Micro 프로젝트 $10/월부터. 별도 단일 프로젝트 조직은 분리 비용·이전 영향 검토가 필요하다.
- Cloudflare D1: SQLite 기반이므로 Postgres 함수/RLS·Supabase Auth/Realtime을 그대로 옮기는 작업이 아니다. 무료 구간 초과 시 DB 쿼리가 거부된다. 신규 Google 인증·권한·실시간 갱신 설계와 데이터 이행 검증이 필요하다.
- Firebase Auth+Firestore: Google 인증과 실시간 SDK가 있지만 문서 구조·Security Rules·서버 처리로 재설계해야 한다. Cloud Functions와 백업/복원 기능은 결제 연결이 필요하다.

즉시 결함 수정과 비용 절감용 백엔드 이전을 분리한다. 이전/구독 결정 전 현재 서비스와 데이터를 유지한다.

공식 근거(2026-10-10 조회):

- https://supabase.com/pricing
- https://supabase.com/docs/guides/deployment/going-into-prod
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://firebase.google.com/docs/firestore/quotas
- https://firebase.google.com/docs/functions/get-started
- https://github.com/advisories/GHSA-3w37-wq28-93x7
- https://github.com/advisories/GHSA-wq5f-xc86-pv6w
