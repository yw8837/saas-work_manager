# 일감체크

일감체크는 1인 사업자가 고객·시작일·패키지·옵션만 고르면 금액, 마감, 수정 한도와 Todo를 한 번에 만들고 Today에서 처리하도록 돕는 모바일 우선 업무관리 SaaS MVP다.

## 여기서부터 이어서 하면 된다

```bash
npm ci      # node_modules가 없을 때만
npm run dev # http://localhost:3000
```

환경변수 없이 로컬 모드로 바로 뜬다. Hosted로 붙이려면 `.env.hosted.example`을 `.env.local`로 복사한다.

### 요금제 (확정)

| 플랜 | 가격 | 동시 진행 | 누적 생성 | 패키지 | 옵션 |
|---|---|---|---|---|---|
| Free | ₩0 | 2 | 10 | 5 | 10 |
| Basic | ₩14,900/월 | 5 | 무제한 | 무제한 | 무제한 |
| Pro | ₩24,900/월 | 무제한 | 무제한 | 무제한 | 무제한 |

첫 일감을 만들면 7일 Pro 체험이 자동 시작된다. 초대 코드(`KMONG2026`·`SOOMGO2026`·`BETA2026`)는 30일 Pro를 연다.
베타 종료 뒤 계속 쓰는 참여자에게는 Basic을 월 ₩9,900으로 12개월 유지하는 파운더 혜택을 제안한다. 현재는 결제 기능이 없으므로 자동 청구나 플랜 변경은 일어나지 않는다.
숫자의 단일 출처는 `src/lib/domain/entitlements.ts`와 DB의 `plan_limits` 두 곳이고, 화면 문구는 전부 여기서 읽어 쓴다. 앱 내 광고는 넣지 않는다.

### 출시 전 확인 순서

1. Supabase migration 목록이 `20260926141910_workspace_job_revision_cleanup`까지 적용됐는지 확인한다(9월 RPC 권한 최소화·삭제 portal/request 정리 포함).
2. Google Cloud OAuth 웹 클라이언트를 만들고 Supabase Google provider에 연결한다.
3. Auth Site URL을 운영 origin으로, 허용 redirect를 명시한 현재·이전 origin의 `/today`와 `/settings`로만 설정한다.
4. Sites 환경변수를 설정하고 새 버전을 배포한 뒤 Google 로그인, 계정 격리, 수정 요청 링크, 계정 삭제를 실사용 흐름으로 확인한다.
5. 설문 링크는 `NEXT_PUBLIC_FEEDBACK_FORM_URL`로 연결한다. 결제 기능은 아직 없으므로 베타에서 과금하지 않는다.

### 알고 있어야 할 사실

- **"개인정보를 안 받는다"는 정확하지 않다.** 내 개인정보는 이메일뿐이지만, 사용자의 *고객* 이름·연락 링크·금액·수정 요청 원문은 서버에 저장된다. 개인정보처리방침에 그대로 공시돼 있다. 위험을 피한 게 아니라 최소화하고 공시한 상태다.
- **초대 코드는 비밀이 아니다.** 브라우저 번들에서 읽을 수 있다. 어차피 크몽·숨고 사용자에게 뿌릴 코드이고, 실제 통제는 서버의 500회·1인 1회·30일 제한이다. 유료 전환 시 `max_redemptions = 0`으로 내린다.
- **`/api/health`는 인증이 없고 Supabase 계약을 확인한다.** 고장난 배포가 잠시 정상으로 보이지 않도록 캐시하지 않는다. 비정상 호출은 Sites 앞단 rate limit과 운영 모니터링으로 막는다.
- **정책 문서 manifest는 `finalized: false`다.** 운영자 신원을 확정하기 전에는 외부 사용자를 초대하지 않는다는 뜻이다.

## 지금 가능한 것

| 실행 모드 | 실제 범위 |
|---|---|
| `local` | 환경변수 없이 실행되는 단일 브라우저 데모. 데이터는 localStorage에 저장되며 다른 기기와 공유되지 않는다. |
| `hosted` 코드 | Supabase Google OAuth, 사용자별 JSON 작업공간, dirty 초안 복구·버전 충돌 선택, Realtime 갱신, 익명 고객 수정요청 RPC가 연결돼 있다. |
| 실제 외부 운영 | Supabase 프로젝트와 Sites 배포를 사용한다. migration, Google OAuth, 운영 URL, RLS·공개 링크를 배포 환경에서 함께 검증해야 한다. |

Hosted 모드에서 앱이 실제로 읽고 쓰는 기준 데이터는 `workspace_documents.state`다. `202608140001_initial.sql`의 정규화 테이블은 향후 리포트·서버 권한 기능을 위한 기반이고, 현재 UI 데이터를 두 모델에 동시에 쓰지 않는다. `202608160003_runtime_contract.sql`이 배포 health 계약을 도입했고, 후속 필수 migration이 값을 갱신해 현재 기대 버전은 `202608250011`이다. 006은 배포 privacy/terms manifest 버전·bundle digest와 DB의 일치를, 007은 서버측 요금제 한도와 초대 코드를 담당하고, 008은 기존 Solo 데이터를 Basic으로 안전하게 옮긴다. 011은 계정당 베타 1회와 최신 health 계약, 012는 Google-only Auth 정책이며 9월 두 migration은 RPC 권한 및 일감 삭제의 portal/request 정리를 보완한다. runtime 계약과 service-role 계약은 같은 상수와 비교되므로 **둘을 함께 올려야 한다**(한쪽만 올리면 정상 배포가 `/api/health`에서 503을 받는다).

## 로컬 실행

Node.js 20 이상이 필요하다. Hosted 운영의 `supabase:backup` logical dump까지 실행하려면 Supabase CLI의 `pg_dump` 컨테이너를 구동할 Docker Desktop 또는 호환 컨테이너 런타임도 필요하다.

```bash
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 `바로 시작`을 누르면 된다. 별도 데모 모드는 없고 첫 화면부터 실제 사용 흐름이다.

| 명령 | 확인 범위 |
|---|---|
| `npm test` | 자동합성·수정 기록·저장소·Hosted 계약 단위테스트 |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run build` | Next.js 프로덕션 빌드 |
| `npm run test:e2e` | 데스크톱·모바일 핵심 흐름 |
| `npm run audit:prod` | 운영 의존성 취약점 감사 |
| `npm run check:deploy` | Hosted 필수 환경변수 검사와 프로덕션 빌드 |
| `npm run check:release` | unit/lint/typecheck/audit/local E2E/Hosted build 전체 출시 게이트 |
| `npm run hosted:env:init` | 기존 파일을 절대 덮어쓰지 않고 `.env.local` 초안 1회 생성 |
| `npm run hosted:bootstrap` | 현재 연결 단계를 읽고 비밀값 출력 없이 다음 Supabase 행동을 안내하는 재개 명령 |
| `npm run smoke:sites -- URL` | Sites 배포의 health·DB 계약·보안 헤더·PWA를 확인 |
| `npm run supabase:auth:readback` | 현재 셸의 `auth_config_read` PAT로 Site URL·정확한 `/today`, `/settings`·Google 로그인 ON·이메일 로그인 OFF를 읽기 전용 확인 |
| `npm run runtime:readback -- URL` | 배포 `/api/health`가 DB runtime `202608250011`, policy manifest/DB contract, 현재 server key의 service-role 전용 contract를 exact 감지하는지 확인 |
| `npm run smoke:remote -- URL` | Preview health·DB/policy contract·`/privacy`·`/terms`·보안 헤더·PWA 확인 |
| `npm run verify:hosted` | 전용 A/B 계정의 RLS·공개 수정·token rotate·Realtime 실증 |
| `npm run supabase:config:push` | Sites 운영 URL, Google 로그인 ON, 이메일 로그인 OFF, redirect 2개를 원격 Auth에 적용 |
| `npm run policy:manifest:verify` | 공개 privacy/terms 본문·버전·본문/bundle digest의 단일 manifest 일치 확인 |
| `npm run operational:evidence:verify` | 저장소 밖 정책·탈퇴·backup/recovery 운영 evidence 검증 |
| `npm run check:external-beta` | 기본 Sites/Google-only: source/archive identity → Auth readback → OAuth 운영 evidence → Sites smoke/finalized runtime → Google A/B → fresh identity recheck를 fail-fast 실행. 실제 입력과 미완료 사항은 docs/OPERATIONAL-EVIDENCE.md 참고 |
| `npm run supabase:backup -- --output-dir ...` | 저장소 밖 암호화 경로에 public logical dump+hash manifest 생성 |
| `npm run supabase:restore:verify:dry` | 전용 recovery 프로젝트 검증 전 fail-closed 환경 점검 |

## 핵심 기능

- Basic / Standard / Deluxe와 옵션을 편집하고 새 일감에 스냅샷으로 적용한다.
- 패키지·옵션 선택만으로 금액·예상원가·마감·수정 한도·Todo·업무별 기한을 합성한다.
- Today에서 Todo, 고객 대기, 답변 받음, 완료·재진행을 바로 처리한다.
- 카카오·디스코드·작업 사이트·Figma·Drive 링크를 일감에 저장한다.
- 고객용 `/r/[token]` 폼과 작업자 수동 기록을 하나의 수정 타임라인과 카운터로 관리한다.
- 공개 수정 링크를 일감별로 켜고 끄거나 재발급하며, 작업공간에 새 토큰이 저장되는 순간 이전 링크를 거부한다.
- Hosted 로그인은 Google 계정만 사용한다. 별도 이메일 비밀번호나 재설정 메일은 없다.
- 추가요청은 초안으로 기록하고 확정할 때만 금액·마감·Todo에 반영한다.
- 앱을 열어 둔 동안 마감·고객 대기·새 수정 요청을 인앱 알림으로 계산한다. 앱 종료 뒤 예약 Web Push는 아직 없다.

## Hosted 환경변수

로컬 `.env.local` 또는 Sites 환경변수에 공개 설정과 서버 전용 탈퇴 키를 구분해 둔다.

```dotenv
NEXT_PUBLIC_STORAGE_MODE=hosted
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUPABASE_BROWSER_SAFE_ANON_OR_PUBLISHABLE_KEY
NEXT_PUBLIC_OPERATOR_NAME=PUBLIC_LEGAL_OR_BUSINESS_OPERATOR_NAME
NEXT_PUBLIC_SUPPORT_EMAIL=support@YOUR_DOMAIN
NEXT_PUBLIC_BETA_SIGNUP_ENABLED=true
SUPABASE_SERVICE_ROLE_KEY=SERVER_ONLY_SECRET
```

`NEXT_PUBLIC_*` 값은 브라우저 번들에 공개된다. `SUPABASE_SERVICE_ROLE_KEY`는 `/api/account/delete` 서버에서만 읽고 절대 `NEXT_PUBLIC_*`로 만들지 않는다. DB 비밀번호, SMTP 비밀번호, FCM 서비스 계정, VAPID private key와 PG webhook secret도 공개 변수에 넣지 않는다. Supabase URL을 바꾸면 CSP와 브라우저 번들이 함께 바뀌므로 반드시 다시 빌드·배포한다.

`SUPABASE_ACCESS_TOKEN`은 배포 환경변수가 아니다. Supabase Management API의 현재 Auth 설정을 읽을 때만 현재 PowerShell 세션에 넣고 확인 직후 제거한다. `.env.local`, Sites, Git, 명령행 인수에는 저장하지 않는다. 현재 상태 PASS는 linked Supabase ref, 배포 `/api/health` ref, DB contract와 정확한 Auth redirect allow-list가 모두 일치해야 한다.

## Hosted 보안 경계

- 사용자별 작업공간 조회는 `auth.uid()` RLS로 격리한다.
- 클라이언트의 직접 INSERT/UPDATE/DELETE는 막고, 저장은 인증된 `save_workspace_document` RPC로만 수행한다.
- 저장 RPC는 문서 버전 비교와 idempotency key를 사용해 조용한 덮어쓰기를 막는다.
- idempotency receipt는 audit log가 아니다. 30일이 지난 행은 다음 저장 때 최대 10,000건씩 자동 정리되고, 유휴 프로젝트는 service-role 전용 cleanup 함수를 운영자가 실행한다.
- 서버 저장 실패 편집은 사용자별 dirty 초안으로 보존한다. 재접속 시 안전한 변경은 자동 복구하고 같은 필드 충돌은 `이 기기 편집`과 `서버본` 중 사용자가 고르기 전까지 덮어쓰지 않는다.
- Hosted 일감의 공개 링크 토큰은 브라우저에서 256-bit 난수로 만든다. 복사용 원문은 소유자만 읽을 수 있는 작업공간 JSON에 있고, 공개 포털 조회 테이블에는 SHA-256 hash만 저장된다.
- 공개 조회·제출은 해시와 작업공간 JSON의 현재 토큰을 함께 대조해 재발급 전 토큰과 그 idempotent 재시도까지 차단한다.
- 공개 RPC는 링크 소지자에게 작업 제목·패키지·수정 횟수만 보여주고, 본문 길이·중복 제출·호출 빈도를 제한한다. 폼은 같은 이름+본문의 응답 유실 재시도에 같은 요청 UUID를 유지한다. 링크 자체가 접근 권한이므로 메신저 공개방이나 검색 가능한 문서에 올리면 안 된다.
- 금전과 연결되는 값은 작업공간 JSON을 신뢰하지 않는다. 요금제 한도·체험·초대 코드는 `202608230008`까지의 `subscriptions`/`plan_limits`/`workspace_job_ledger`가 근거이며, 저장 RPC가 프로필 잠금 안에서 한도를 검사한다. 일감 ID는 브라우저가 만들므로 원장이 은퇴한 ID의 재사용을 새 생성으로 세어 누적 한도 우회를 막는다.
- PG 결제와 서명 검증 webhook은 아직 없다. 결제를 붙일 때도 같은 원칙으로 서버에서만 권한을 갱신한다.
- 베타 로그인은 Google OAuth만 사용한다. 원격 Auth는 신규 OAuth 사용자 생성을 허용하고 이메일·비밀번호 provider는 끈다. `/today`는 일반 로그인 복귀, `/settings`는 계정 삭제 전 재인증 복귀에만 사용하며 다른 redirect는 허용하지 않는다.

## 아직 완료라고 주장하지 않는 것

| 항목 | 상태 |
|---|---|
| 실제 Supabase 프로젝트에서의 A/B 계정 격리·다른 기기 공개 링크 | **배포 후 최종 실증 필요** |
| Google OAuth | **코드 구현 / 운영 OAuth 클라이언트 연결 후 실증 필요** |
| 앱 종료 뒤 예약 Web Push | **BLOCKED_EXTERNAL + 미구현** — FCM/VAPID, 구독 저장, Edge Function, Cron, retry/dedupe, 실기기 검증 필요 |
| 서버측 요금제 한도 | **구현** — `plan_limits`/`subscriptions`/`workspace_job_ledger`로 동시·누적·패키지·옵션 한도를 저장 RPC에서 강제. 실 Supabase 프로젝트 적용은 미완 |
| 초대 코드 | **구현** — 코드당 500회·1인 1회·30일, 실패 시도 시간당 10회 제한. 코드는 브라우저 번들에도 있으므로 비밀이 아니다 |
| 실결제·구독 결제 | **미구현** — 포트원 가입, 서버 checkout, 서명 검증 webhook, 환불·중복 처리 필요 |
| local → Hosted 가져오기 | **부분 구현** — 첫 로그인 시 이 브라우저 저장본을 그대로 올린다. 다만 무료 한도(동시 2·누적 10)를 넘으면 첫 저장이 거부되므로, 일감을 정리하거나 초대 코드를 넣어야 한다. 일부만 골라 옮기는 화면은 없다 |
| 데이터 내보내기 | **구현** — 설정에서 공개 링크 bearer token을 제외한 JSON 다운로드, import는 미지원 |
| 계정 탈퇴 | **코드 구현 / 외부 미검증** — 재인증된 세션만 server-only admin API로 Auth 사용자와 cascade owner 데이터를 삭제; 실제 Preview에서 재검증 필요 |
| 관리 백업·복원 훈련 | **BLOCKED_EXTERNAL** — logical dump wrapper는 있지만 실제 Supabase 관리 백업/PITR와 별도 recovery 복원 증거는 없음 |

실행 순서, 백업·복원, RLS/공개 링크 검증과 롤백 절차는 [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md), 정책·탈퇴·복원 기록은 [`docs/OPERATIONAL-EVIDENCE.md`](./docs/OPERATIONAL-EVIDENCE.md)에 있다. Supabase 구현 계약은 [`supabase/README.md`](./supabase/README.md), 인수 범위는 [`docs/final-delivery.md`](./docs/final-delivery.md)를 참고한다.
