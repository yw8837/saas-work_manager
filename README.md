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
| Solo | ₩9,900/월 | 5 | 무제한 | 무제한 | 무제한 |
| Pro | ₩24,900/월 | 무제한 | 무제한 | 무제한 | 무제한 |

첫 일감을 만들면 7일 Pro 체험이 자동 시작된다. 초대 코드(`KMONG2026`·`SOOMGO2026`·`BETA2026`)는 30일 Pro를 연다.
숫자의 단일 출처는 `src/lib/domain/entitlements.ts`와 DB의 `plan_limits` 두 곳이고, 화면 문구는 전부 여기서 읽어 쓴다. 앱 내 광고는 넣지 않는다.

### 출시 전 남은 일

전부 외부 계정 작업이고, 코드 쪽은 막힌 게 없다.

1. **Supabase 프로젝트 생성 후 migration 적용** — 이걸 안 하면 서버 한도가 없는 상태라 배포 게이트가 막는다.
   `npm run supabase:login` → `supabase:link` → `supabase:push:dry` → `supabase:push`
   중간에 길을 잃으면 `npm run hosted:bootstrap`이 현재 단계와 다음 행동만 알려준다.
2. **구글 폼 생성** — `NEXT_PUBLIC_FEEDBACK_FORM_URL`과 entry ID 4개. 없으면 `/feedback`에서 제출이 안 된다. 자유서술·이메일은 설계상 URL에 넣지 않으므로 entry ID도 받지 않는다.
3. **포트원 가입** — 결제 코드는 아직 없다. 가입하면 붙일 수 있는 상태까지만 되어 있다.
   계약 전에 **빌링키(정기결제)도 영중소 우대수수료율이 적용되는지 서면 확인**할 것. 1.65% 대 3.23%면 ₩9,900에서 마진이 두 배 차이난다.
4. **초대 코드 배포 전 확인** — 프로덕션 Supabase에 `enable_signup = false`가 실제로 적용됐는지. `supabase/config.toml`은 `npm run supabase:config:push`를 돌려야 원격에 반영된다.

### 알고 있어야 할 사실

- **"개인정보를 안 받는다"는 정확하지 않다.** 내 개인정보는 이메일뿐이지만, 사용자의 *고객* 이름·연락 링크·금액·수정 요청 원문은 서버에 저장된다. 개인정보처리방침에 그대로 공시돼 있다. 위험을 피한 게 아니라 최소화하고 공시한 상태다.
- **초대 코드는 비밀이 아니다.** 브라우저 번들에서 읽을 수 있다. 어차피 크몽·숨고 사용자에게 뿌릴 코드이고, 실제 통제는 서버의 500회·1인 1회·30일 제한이다. 유료 전환 시 `max_redemptions = 0`으로 내린다.
- **`/api/health`는 인증이 없고 요청마다 Supabase로 3회 나간다.** 결과를 캐시하면 고장난 배포가 잠시 정상으로 보여 배포 게이트가 뚫리므로 캐시하지 않았다. 증폭이 걱정되면 Vercel 쪽 rate limit으로 막는다.
- **정책 문서 manifest는 `finalized: false`다.** 운영자 신원을 확정하기 전에는 외부 사용자를 초대하지 않는다는 뜻이다.

## 지금 가능한 것

| 실행 모드 | 실제 범위 |
|---|---|
| `local` | 환경변수 없이 실행되는 단일 브라우저 데모. 데이터는 localStorage에 저장되며 다른 기기와 공유되지 않는다. |
| `hosted` 코드 | Supabase 이메일/비밀번호 Auth, 사용자별 JSON 작업공간, dirty 초안 복구·버전 충돌 선택, Realtime 갱신, 익명 고객 수정요청 RPC가 연결돼 있다. |
| 실제 외부 운영 | 창업자 소유 Supabase 프로젝트에 migration을 적용하고 Vercel Preview에서 두 계정 RLS·공개 링크를 검증한 뒤 도메인을 연결해야 한다. 아직 이 저장소에는 실제 프로젝트·계정·도메인이 없다. |

Hosted 모드에서 앱이 실제로 읽고 쓰는 기준 데이터는 `workspace_documents.state`다. `202608140001_initial.sql`의 정규화 테이블은 향후 리포트·서버 권한 기능을 위한 기반이고, 현재 UI 데이터를 두 모델에 동시에 쓰지 않는다. `202608160003_runtime_contract.sql`이 배포 health 계약을 도입했고, 후속 필수 migration이 값을 갱신해 현재 기대 버전은 `202608200007`이다. 006은 배포 privacy/terms manifest 버전·bundle digest와 DB의 일치를, 007은 서버측 요금제 한도와 초대 코드를 담당한다. runtime 계약과 service-role 계약은 같은 상수와 비교되므로 **둘을 함께 올려야 한다**(한쪽만 올리면 정상 배포가 `/api/health`에서 503을 받는다).

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
| `npm run hosted:bootstrap` | 현재 연결 단계를 읽고 비밀값 출력 없이 다음 Supabase/Vercel 행동을 안내하는 재개 명령 |
| `npm run check:external-inputs -- --json` | 도메인·SMTP·A/B·운영 evidence·현재 셸 ACK/PAT·Supabase/Vercel link 입력 위치를 값 노출 없이 한 번에 점검 |
| `npm run status:domain-ready` | ref·Seoul·Vercel project/team·배포 소스 지문, 현재 `/api/health` DB 계약, Management API의 현재 Auth 설정을 재확인 |
| `npm run supabase:auth:readback` | 현재 셸의 `auth_config_read` PAT로 Site URL·정확한 `/auth/reset` 1개·전체 신규 가입 OFF·이메일 로그인 ON을 읽기 전용 확인 |
| `npm run runtime:readback -- URL` | 배포 `/api/health`가 DB runtime `202608200007`, policy manifest/DB contract, 현재 Vercel server key의 service-role 전용 contract를 exact 감지하는지 확인 |
| `npm run smoke:remote -- URL` | Preview health·DB/policy contract·`/privacy`·`/terms`·보안 헤더·PWA 확인 |
| `npm run verify:hosted` | 전용 A/B 계정의 RLS·공개 수정·token rotate·Realtime 실증 |
| `npm run supabase:config:push` | Preview/운영 URL과 폐쇄 베타 가입 OFF를 원격 Auth에 적용 |
| `npm run beta:invite -- --email ...` | 확인값을 요구하고 `/auth/reset`으로 보내는 폐쇄 베타 초대 1건 전송 |
| `npm run vercel:env:push:preview` | 정확한 linked project 확인값 뒤 Hosted runtime 7개를 stdin으로 Preview에 등록 |
| `npm run vercel:preview` | linked project를 재검증하고 현재 배포 소스 SHA-256 지문을 메타데이터에 넣어 Preview 배포 |
| `npm run smtp:dns:verify` | 실제 Return-Path의 SPF 1개·From domain의 DKIM public key·DMARC 정책 확인 |
| `npm run smtp:evidence:verify` | 저장소 밖 수동 JSON의 외부 2개 사업자 전달·인증·최종 링크·반송 억제 확인 |
| `npm run policy:manifest:verify` | 공개 privacy/terms 본문·버전·본문/bundle digest의 단일 manifest 일치 확인 |
| `npm run operational:evidence:verify` | 저장소 밖 정책·탈퇴·backup/recovery 운영 evidence 검증 |
| `npm run check:external-beta` | 원격 대상 → 운영 evidence → SMTP → 최종 도메인 smoke → Hosted A/B를 fail-fast 실행 |
| `npm run supabase:backup -- --output-dir ...` | 저장소 밖 암호화 경로에 public logical dump+hash manifest 생성 |
| `npm run supabase:restore:verify:dry` | 전용 recovery 프로젝트 검증 전 fail-closed 환경 점검 |

## 핵심 기능

- Basic / Standard / Deluxe와 옵션을 편집하고 새 일감에 스냅샷으로 적용한다.
- 패키지·옵션 선택만으로 금액·예상원가·마감·수정 한도·Todo·업무별 기한을 합성한다.
- Today에서 Todo, 고객 대기, 답변 받음, 완료·재진행을 바로 처리한다.
- 카카오·디스코드·작업 사이트·Figma·Drive 링크를 일감에 저장한다.
- 고객용 `/r/[token]` 폼과 작업자 수동 기록을 하나의 수정 타임라인과 카운터로 관리한다.
- 공개 수정 링크를 일감별로 켜고 끄거나 재발급하며, 작업공간에 새 토큰이 저장되는 순간 이전 링크를 거부한다.
- Hosted 로그인 화면에서 재설정 메일을 요청하고 `/auth/reset`에서 새 비밀번호를 저장한다.
- 추가요청은 초안으로 기록하고 확정할 때만 금액·마감·Todo에 반영한다.
- 앱을 열어 둔 동안 마감·고객 대기·새 수정 요청을 인앱 알림으로 계산한다. 앱 종료 뒤 예약 Web Push는 아직 없다.

## Hosted 환경변수

`.env.local` 또는 Vercel Project Settings에 공개 설정과 서버 전용 탈퇴 키를 구분해 둔다.

```dotenv
NEXT_PUBLIC_STORAGE_MODE=hosted
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUPABASE_BROWSER_SAFE_ANON_OR_PUBLISHABLE_KEY
NEXT_PUBLIC_OPERATOR_NAME=PUBLIC_LEGAL_OR_BUSINESS_OPERATOR_NAME
NEXT_PUBLIC_SUPPORT_EMAIL=support@YOUR_DOMAIN
NEXT_PUBLIC_BETA_SIGNUP_ENABLED=false
SUPABASE_SERVICE_ROLE_KEY=SERVER_ONLY_SECRET
```

`NEXT_PUBLIC_*` 값은 브라우저 번들에 공개된다. `SUPABASE_SERVICE_ROLE_KEY`는 `/api/account/delete` 서버에서만 읽고 절대 `NEXT_PUBLIC_*`로 만들지 않는다. DB 비밀번호, SMTP 비밀번호, FCM 서비스 계정, VAPID private key와 PG webhook secret도 공개 변수에 넣지 않는다. Supabase URL을 바꾸면 CSP와 브라우저 번들이 함께 바뀌므로 반드시 다시 빌드·배포한다.

`SUPABASE_ACCESS_TOKEN`은 배포 환경변수가 아니다. `status:domain-ready`가 Supabase Management API의 현재 Auth 설정을 읽을 때만 `auth_config_read` 권한 PAT를 현재 PowerShell 세션에 넣고, 확인 직후 제거한다. `.env.local`, Vercel, Git, 명령행 인수에는 저장하지 않는다. 로컬 migration/Auth receipt는 30일 이내 실행 이력일 뿐이며, 현재 상태 PASS는 linked Supabase ref와 배포 `/api/health` ref, DB contract, 정확한 Auth redirect allow-list, Vercel project/team과 현재 소스 지문이 모두 일치해야 한다.

## Hosted 보안 경계

- 사용자별 작업공간 조회는 `auth.uid()` RLS로 격리한다.
- 클라이언트의 직접 INSERT/UPDATE/DELETE는 막고, 저장은 인증된 `save_workspace_document` RPC로만 수행한다.
- 저장 RPC는 문서 버전 비교와 idempotency key를 사용해 조용한 덮어쓰기를 막는다.
- idempotency receipt는 audit log가 아니다. 30일이 지난 행은 다음 저장 때 최대 10,000건씩 자동 정리되고, 유휴 프로젝트는 service-role 전용 cleanup 함수를 운영자가 실행한다.
- 서버 저장 실패 편집은 사용자별 dirty 초안으로 보존한다. 재접속 시 안전한 변경은 자동 복구하고 같은 필드 충돌은 `이 기기 편집`과 `서버본` 중 사용자가 고르기 전까지 덮어쓰지 않는다.
- Hosted 일감의 공개 링크 토큰은 브라우저에서 256-bit 난수로 만든다. 복사용 원문은 소유자만 읽을 수 있는 작업공간 JSON에 있고, 공개 포털 조회 테이블에는 SHA-256 hash만 저장된다.
- 공개 조회·제출은 해시와 작업공간 JSON의 현재 토큰을 함께 대조해 재발급 전 토큰과 그 idempotent 재시도까지 차단한다.
- 공개 RPC는 링크 소지자에게 작업 제목·패키지·수정 횟수만 보여주고, 본문 길이·중복 제출·호출 빈도를 제한한다. 폼은 같은 이름+본문의 응답 유실 재시도에 같은 요청 UUID를 유지한다. 링크 자체가 접근 권한이므로 메신저 공개방이나 검색 가능한 문서에 올리면 안 된다.
- 금전과 연결되는 값은 작업공간 JSON을 신뢰하지 않는다. 요금제 한도·체험·초대 코드는 `202608200007`의 `subscriptions`/`plan_limits`/`workspace_job_ledger`가 근거이며, 저장 RPC가 프로필 잠금 안에서 한도를 검사한다. 일감 ID는 브라우저가 만들므로 원장이 은퇴한 ID의 재사용을 새 생성으로 세어 누적 한도 우회를 막는다.
- PG 결제와 서명 검증 webhook은 아직 없다. 결제를 붙일 때도 같은 원칙으로 서버에서만 권한을 갱신한다.
- 폐쇄 베타는 UI 플래그와 원격 Supabase Auth의 **전체 신규 가입 OFF**를 함께 유지하되, 초대·기존 계정 로그인을 위해 이메일 로그인 제공자는 ON으로 둔다. Preview에서 custom SMTP·발신 DNS를 먼저 준비한 뒤 통제된 전용 A/B만 `npm run beta:invite -- --email ...`로 초대해 격리를 검증한다. Production/최종 Auth 전환 뒤에는 최종 origin의 외부 두 사서함 invite/reset·반송 evidence를 새로 만들고 `check:external-beta`까지 통과한 뒤에만 실제 베타 사용자를 초대한다.

## 아직 완료라고 주장하지 않는 것

| 항목 | 상태 |
|---|---|
| 실제 Supabase 프로젝트에서의 A/B 계정 격리·다른 기기 공개 링크 | **BLOCKED_EXTERNAL** — 프로젝트와 테스트 계정이 없어 미검증 |
| SMTP 전달성 | **검사 구현 / BLOCKED_EXTERNAL** — public DNS·수동 증거·통합 gate는 있으나 최종 도메인/custom SMTP/실제 수신·반송 증거가 없음 |
| 앱 종료 뒤 예약 Web Push | **BLOCKED_EXTERNAL + 미구현** — FCM/VAPID, 구독 저장, Edge Function, Cron, retry/dedupe, 실기기 검증 필요 |
| 서버측 요금제 한도 | **구현** — `plan_limits`/`subscriptions`/`workspace_job_ledger`로 동시·누적·패키지·옵션 한도를 저장 RPC에서 강제. 실 Supabase 프로젝트 적용은 미완 |
| 초대 코드 | **구현** — 코드당 500회·1인 1회·30일, 실패 시도 시간당 10회 제한. 코드는 브라우저 번들에도 있으므로 비밀이 아니다 |
| 실결제·구독 결제 | **미구현** — 포트원 가입, 서버 checkout, 서명 검증 webhook, 환불·중복 처리 필요 |
| local → Hosted 가져오기 | **부분 구현** — 첫 로그인 시 이 브라우저 저장본을 그대로 올린다. 다만 무료 한도(동시 2·누적 10)를 넘으면 첫 저장이 거부되므로, 일감을 정리하거나 초대 코드를 넣어야 한다. 일부만 골라 옮기는 화면은 없다 |
| 데이터 내보내기 | **구현** — 설정에서 공개 링크 bearer token을 제외한 JSON 다운로드, import는 미지원 |
| 계정 탈퇴 | **코드 구현 / 외부 미검증** — 재인증된 세션만 server-only admin API로 Auth 사용자와 cascade owner 데이터를 삭제; 실제 Preview에서 재검증 필요 |
| 관리 백업·복원 훈련 | **BLOCKED_EXTERNAL** — logical dump wrapper는 있지만 실제 Supabase 관리 백업/PITR와 별도 recovery 복원 증거는 없음 |

실행 순서, 백업·복원, RLS/공개 링크 검증과 롤백 절차는 [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md), SMTP 외부 베타 증거는 [`docs/SMTP-RUNBOOK.md`](./docs/SMTP-RUNBOOK.md), 정책·탈퇴·복원 기록은 [`docs/OPERATIONAL-EVIDENCE.md`](./docs/OPERATIONAL-EVIDENCE.md)에 있다. Supabase 구현 계약은 [`supabase/README.md`](./supabase/README.md), 인수 범위는 [`docs/final-delivery.md`](./docs/final-delivery.md)를 참고한다.
