# Supabase Hosted 인계

이 디렉터리에는 Hosted 어댑터가 사용하는 migration이 들어 있다. **실제 Supabase 프로젝트에 적용된 상태는 아니다.** 프로젝트·DB 비밀번호·API 키·사용자 계정은 창업자가 소유하고 관리해야 한다.

## migration과 현재 사용처

여섯 파일을 파일명 순서대로 모두 적용한다.

1. `migrations/202608140001_initial.sql`
   - `auth.users`와 연결된 `profiles` 및 회원 생성 trigger
   - 패키지·옵션·일감·Todo·수정 증거·알림/Push 기반용 정규화 테이블
   - owner RLS와 직접 DML 제한
   - 서버 계산형 일감 생성, 상태·Todo·링크·수정·추가요청용 좁은 RPC
2. `migrations/202608150002_workspace_documents.sql`
   - 현재 UI 전체 상태의 기준 저장소인 `workspace_documents.state`
   - 문서 버전 비교와 idempotency receipt를 사용하는 `save_workspace_document`
   - 공개 수정 포털 hash, 원문 증거와 호출 제한
   - `workspace_documents` Realtime publication 등록
3. `migrations/202608160003_runtime_contract.sql`
   - migration 전에 만들어진 Auth 사용자의 `profiles`·알림 설정 안전 backfill
   - `/api/health`가 원격 DB 적용 상태를 판정하는 버전 고정 runtime contract RPC
4. `migrations/202608160004_workspace_save_receipt_retention.sql`
   - 저장 재시도 receipt의 `created_at` index와 최소 30일 보존 cleanup
   - 새 저장 때 최대 10,000건 opportunistic 정리, service-role 전용 유휴 데이터 정리 함수
5. `migrations/202608160005_policy_acceptances.sql`
   - 약관·개인정보처리방침 버전 동의 증거와 owner 조회 RLS
   - 가입 metadata에서 현재 정책 버전을 확인한 뒤 증거를 기록하고 runtime contract를 갱신
6. `migrations/202608170006_policy_publication_contract.sql`
   - 배포된 privacy/terms manifest의 버전·bundle digest·`finalized` 상태를 데이터 없는 공개 RPC로 고정
   - `/api/health`가 앱 manifest와 현재 DB policy contract의 exact 일치를 검증하도록 runtime contract를 `202608170006`으로 갱신
   - service-role key가 실제 DB `service_role`로 매핑됐는지 데이터 없이 확인하는 role-only contract RPC

현재 앱은 두 번째 migration의 JSON 작업공간을 읽고 쓴다. 첫 번째 migration의 정규화 업무 테이블은 미래 리포트·서버 권한 기능의 기반이며 현재 UI 상태와 이중 쓰기하지 않는다. Hosted health gate는 최신 runtime과 정책 publication contract를 확인하므로 **001·002·003·004·005·006을 모두 적용해야 한다.**

## 브라우저가 호출하는 Hosted 경계

| 작업 | 권한 | 경계 |
|---|---|---|
| 작업공간 조회 | `authenticated` | `workspace_documents_owner_select`가 `auth.uid()`와 같은 행만 반환 |
| 작업공간 저장 | `authenticated` | `save_workspace_document`; 버전·요청 UUID·상태 크기/형태 검증 |
| 공개 포털 동기화 | `authenticated` | `register_workspace_revision_portal`; 자기 문서에 실제 존재하는 일감·토큰만 등록 |
| 공개 요약 | `anon`, `authenticated` | `get_workspace_revision_summary`; 작업 제목·패키지·수정 횟수만 반환 |
| 공개 수정 접수 | `anon`, `authenticated` | `submit_workspace_revision_request`; 증거 행과 JSON 문서를 같은 트랜잭션에서 갱신 |

사용자 브라우저에는 URL과 anon/publishable key만 둔다. 현재 Hosted 어댑터의 작업공간·런타임 기록은 table 직접 쓰기를 허용하지 않고 RPC를 통과한다. 패키지 템플릿·알림 설정과 프로필처럼 owner RLS로 직접 편집 가능한 기반 테이블은 별도 경계다. `service_role`, Supabase secret key와 DB 비밀번호를 `NEXT_PUBLIC_*`에 넣으면 안 된다.

## 공개 수정 링크의 실제 동작

- Hosted 일감 생성 시 브라우저 Web Crypto로 32-byte(256-bit) 원문 토큰을 만든다.
- 복사해야 하는 원문은 소유자 RLS가 적용된 `workspace_documents.state`에 남는다.
- 익명 lookup용 `workspace_revision_portals`에는 SHA-256 hash만 저장한다.
- 제출 본문은 2~4,000자, 표시 이름은 최대 100자다.
- 동일 portal은 최소 3초 간격, 시간당 20건, 서울 날짜 기준 일 100건으로 제한한다.
- 같은 idempotency UUID의 재시도는 같은 receipt를 반환하고 내용이 다르면 거부한다.
- 포함 횟수를 넘은 요청도 버리지 않고 `extra_scope` 증거로 남긴다.
- 일감이 `active`가 아니거나 portal이 꺼지면 공개 조회·제출이 실패한다.
- 작업자는 상세 화면에서 링크를 끄거나 새 256-bit 토큰으로 재발급할 수 있고, 재발급한 뒤 이전 hash 링크는 거부된다.

공개 링크는 bearer secret이다. URL을 아는 사람은 요약을 보고 수정 요청을 제출할 수 있다. 유출되면 일감 상세에서 즉시 링크를 끄거나 재발급한다. 여러 링크를 동시에 막아야 하는 사고는 [배포 문서](../docs/DEPLOYMENT.md#7-장애-롤백과-긴급-차단)를 따른다.

## Auth 설정 원칙

- migration을 먼저 적용하고 그 뒤 테스트 사용자를 만든다. 그래야 회원 생성 trigger가 `profiles`를 함께 만든다.
- 베타 로그인은 Google OAuth만 사용한다. 전역 `[auth] enable_signup=true`, `[auth.email] enable_signup=false`, `[auth.external.google] enabled=true`를 유지하고, 원격 Dashboard와 Management API readback에서도 `disable_signup=false`, `external_google_enabled=true`, `external_email_enabled=false`를 교차 확인한다. 30일 Pro 권한은 로그인 방식이 아니라 설정 화면의 베타 이용 코드로 적용한다.
- 앱 UI는 Google 로그인과 로그아웃만 제공한다. 이메일/비밀번호 가입, 확인 메일, 비밀번호 재설정은 제공하지 않는다.
- Redirect allow list에는 실제 origin의 `/today`와 계정 삭제 재인증 복귀용 `/settings`만 정확히 허용한다. Google Cloud OAuth 클라이언트에는 앱 origin을 JavaScript origin으로, Supabase 프로젝트의 `/auth/v1/callback`을 승인된 리디렉션 URI로 등록한다.

## 출시 전 필수 실증

SQL 문자열 테스트나 로컬 PostgreSQL migration 성공만으로 운영 RLS를 증명할 수 없다. 창업자 소유 Preview 프로젝트에서 아래를 직접 확인한다.

1. 계정 A와 B가 각각 자기 작업공간만 본다.
2. A의 원격 행과 수정 증거를 B 세션으로 조회·변경할 수 없다.
3. authenticated 사용자도 table 직접 DML은 거부되고 허용 RPC만 성공한다.
4. A의 공개 링크를 로그아웃/시크릿 창에서 열어 접수하면 A 화면에 Realtime으로 나타난다.
5. 재시도·동시 접수·호출 제한·완료된 일감의 링크 거부가 예상대로 동작한다.
6. 로그아웃 뒤 A의 캐시가 B 화면에 노출되지 않는다.

CLI 적용, A/B 테스트, 백업·복원과 도메인 연결의 정확한 순서는 [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md)에 있다.

배포 후 `npm run smoke:remote -- https://YOUR_PREVIEW.vercel.app`은 `/api/health`의 감지 버전이 최신 `202608240009`인지, 배포 privacy/terms manifest와 DB policy contract의 버전·bundle digest가 exact 일치하는지, `/privacy`·`/terms`가 redirect 없이 200인지 검사한다. 필수 migration 중 하나가 빠졌거나 RPC가 호출되지 않으면 health가 503을 반환하고 smoke가 실패한다. 공개 정책 본문·버전·`finalized`를 바꾸면 이미 적용된 migration을 수정하지 말고 새 timestamp migration에서 policy·runtime contract를 함께 갱신한다.

## 이 migration이 해결하지 않는 것

- 예약 Web Push: FCM/VAPID, 암호화된 구독 저장, Edge Function, Cron, dedupe/retry가 필요하다.
- 실결제·구독: PG 심사, 서버 checkout, 서명 검증 webhook, 서버 권한형 entitlement가 필요하다.
- 작업공간 JSON 안의 가격은 사용자가 편집 가능한 업무관리 데이터다. 정산·랭킹·구독 권한의 근거로 사용하면 안 된다.
- Supabase 관리 백업/PITR와 복구 훈련은 프로젝트 요금제·운영 정책에 맞춰 별도로 활성화해야 한다.
