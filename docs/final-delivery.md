# 일감체크 MVP 인수 문서

## 인수 결론

실행 소스 루트는 `01_일감체크/app/`이다. 외부 배포는 실행하지 않았고 실제 Supabase/Vercel/도메인 자격증명도 저장소에 없다.

두 실행 경계가 준비돼 있다.

- `local`: 환경변수 없이 localStorage에 저장되는 단일 브라우저 체험판
- `hosted`: 창업자 Supabase에 migration을 적용한 뒤 이메일 Auth, 사용자별 원격 작업공간, Realtime과 고객 공개 수정요청을 사용하는 경계

도메인만 연결하면 되는 정적 사이트는 아니다. 실제 SaaS로 사용하려면 창업자 소유 Supabase 프로젝트와 Vercel env를 연결하고 [배포 절차](./DEPLOYMENT.md)의 A/B RLS·공개 링크 검증을 통과해야 한다.

## 구현 인수 범위

| 영역 | 구현 상태 | 기준 |
|---|---|---|
| 패키지·옵션·Todo 규칙 편집 | 구현 | 새 일감에는 최신 규칙, 기존 일감에는 생성 당시 스냅샷 유지 |
| 일감 자동합성 | 구현 | 고객·시작일·패키지·옵션 → 가격·원가·마감·수정 한도·Todo |
| Today 업무 처리 | 구현 | Todo, 고객 대기/응답, 일감 완료·재진행 |
| 링크 관리 | 구현 | 연락·작업·Figma·Drive 등 http/https 링크 |
| 수정 요청 투트랙 | 구현 | 고객 공개 폼 자동 카운트 + 작업자 수동 기록, 단일 타임라인 |
| 공개 링크 제어 | 구현 | 일감별 켜기·끄기·재발급, 작업공간의 최신 토큰과 일치하지 않는 이전 토큰 즉시 거부, 완료 일감 잠금 |
| 초과 수정 | 구현 | 원문을 버리지 않고 `extra_scope`로 보존 |
| 추가요청 | 구현 | 초안과 확정을 분리하고 확정 시 금액·마감·Todo 반영 |
| 인앱 알림 | 구현 | 마감·고객 대기·새 수정 요청 계산과 브라우저 테스트 표시 |
| local 저장 | 구현 | localStorage, schema migration, 탭 간 갱신 |
| Hosted Auth | 코드 구현 | 이메일/비밀번호 가입·로그인·로그아웃·재설정 메일/새 비밀번호; 실제 프로젝트 검증 전 |
| Hosted 저장 | 코드 구현 | 사용자별 JSON 문서, optimistic version, idempotency, 계정별 dirty 초안 보존·자동 복구와 충돌 선택 UI |
| Hosted 공개 수정 | 코드 구현 | token hash lookup, 최소 공개 요약, 제한·중복 방지·원자적 증거 저장 |
| Hosted Realtime | 코드 구현 | 작업공간 document 변경 구독 |

## 데이터 인수 경계

Hosted UI의 기준 데이터는 `public.workspace_documents.state` JSON이다. 전체 UI 도메인을 손실 없이 저장하기 위한 MVP 경계다.

- `202608140001_initial.sql`: 프로필, 정규화 업무/수정/알림 기반, owner RLS, 좁은 서버 RPC
- `202608150002_workspace_documents.sql`: 현재 앱의 JSON 작업공간, 저장 receipt, 공개 포털과 증거, Realtime
- `202608160003_runtime_contract.sql`: 기존 Auth 사용자 backfill과 Hosted health용 DB contract RPC
- `202608160004_workspace_save_receipt_retention.sql`: 저장 receipt 최소 30일 보존·batch cleanup과 service-role 운영 함수
- `202608160005_policy_acceptances.sql`: 약관/개인정보 버전 동의 증거와 해당 단계 Hosted runtime contract
- `202608170006_policy_publication_contract.sql`: 배포 privacy/terms manifest·DB 버전/bundle digest 결합, service-role role-only probe, runtime `202608170006`

원격 push receipt는 이 migration들의 파일별 SHA-256 manifest를 기록한다. 한번 receipt에 기록된 migration은 수정·삭제하지 않고, 이후 DB 변경은 새 timestamp migration 파일로만 추가한다.

001의 정규화 업무 테이블은 현재 UI와 이중 쓰기하지 않는다. 향후 리포트나 결제처럼 서버 권한 데이터가 필요할 때 명시적 projection/migration으로 전환해야 한다. 작업공간 JSON의 가격·상태는 업무 편의를 위한 사용자 데이터이지 결제·정산·랭킹·구독 권한의 신뢰 원장이 아니다.

## 보안 인수 경계

- Hosted 요청 시 설정이 없으면 local로 자동 폴백하지 않고 오류로 막는다.
- 브라우저에는 Supabase URL과 anon/publishable key만 사용한다.
- `SUPABASE_SERVICE_ROLE_KEY`는 재인증된 계정 탈퇴 API의 서버 코드에서만 사용하고 클라이언트 코드·Git에 없다.
- Vercel env wrapper는 service-role/secret key의 문자열 형식만 신뢰하지 않는다. exact linked Supabase origin에서 `service_role`만 실행 가능한 무데이터 contract RPC가 해당 키를 받아 현재 contract를 반환한 뒤에만, 검사한 동일 URL·키 사본을 Preview/Production에 등록한다.
- 배포 `/api/health`도 현재 Vercel runtime의 server key로 같은 service-role 전용 무데이터 contract를 다시 확인하며, 누락·오래됨·다른 프로젝트 키면 503으로 막는다. 공개 응답에는 키나 오류 본문 대신 일치 여부 boolean만 노출한다.
- 사용자별 조회는 `auth.uid()` RLS로 제한한다.
- 작업공간과 일감·수정 증거 같은 런타임 table 직접 DML을 막고 검증된 security-definer RPC로 쓴다.
- 저장은 document version과 idempotency key로 충돌·재시도를 처리한다.
- 저장 receipt는 audit log가 아니며 30일 경과 행을 다음 저장 때 batch 정리한다. 유휴 프로젝트는 service-role 전용 cleanup을 운영자가 실행한다.
- 저장 실패 편집은 계정별 로컬 dirty 초안과 기준 버전·기준 상태로 남긴다. 재접속 시 안전한 변경은 자동 병합하고, 같은 필드 충돌은 사용자가 이 기기 편집 또는 서버본을 선택하기 전까지 자동 덮어쓰지 않는다.
- 공개 토큰은 32-byte 난수다. 원문은 owner RLS JSON, lookup은 SHA-256 hash다.
- 공개 조회·제출은 해시뿐 아니라 작업공간 JSON의 현재 토큰도 대조하므로 재발급 저장 직후의 이전 토큰을 거절한다.
- 공개 수정요청은 길이·간격·시간/일 횟수·idempotency를 검증하고 evidence와 JSON을 한 트랜잭션에서 갱신한다. 폼은 성공하기 전 같은 이름+본문 재시도에 같은 요청 UUID를 유지한다.
- 전역 CSP, HSTS(운영), frame 차단, MIME sniff 차단, referrer/permissions 정책을 응답 헤더로 설정한다.
- Vercel wrapper의 release fingerprint는 `src`·`public`·migration·`supabase/config.toml`·`scripts`·배포 설정·`.gitignore`와 존재하는 `.vercelignore`를 묶어 예전/다른 로컬 소스 배포를 찾는 client-side consistency assertion이다. deploy 전후 로컬 지문을 재검사하지만 Vercel이 서명한 암호학적 원격 attestation은 아니며, 배포 권한자의 메타데이터 위조까지 증명하지 않는다.
- Vercel guard/deploy 자식 프로세스에는 저장된 CLI login에 필요한 최소 OS/config 환경만 넘기며 부모의 Vercel token·Supabase 비밀·테스트 비밀번호·일반 secret을 상속하지 않는다.

이 설계와 로컬 검증은 알려진 위험을 줄이는 것이지 “제로데이 0개”를 보증하지 않는다. 실제 운영 프로젝트에서 RLS와 공개 엔드포인트를 재검증하고 의존성 감사·로그 모니터링을 계속해야 한다.

## 외부 권한과 미구현

| 항목 | 상태 | 인수 판단 |
|---|---|---|
| 실제 Supabase migration·A/B RLS·다른 기기 공개 링크 | **BLOCKED_EXTERNAL** | 프로젝트·계정이 없어 아직 운영 증거 없음 |
| Vercel Preview/Production·DNS·HTTPS | **BLOCKED_EXTERNAL** | 창업자 계정과 도메인 준비 후 실행 |
| SMTP 전달성 | **검사 구현 / BLOCKED_EXTERNAL / 첫 외부 초대 전 필수** | provider-neutral DNS/evidence/통합 gate는 구현; custom SMTP·최종 도메인·외부 2개 사업자 실제 전달·반송 증거 필요 |
| 예약 Web Push | **BLOCKED_EXTERNAL + 미구현** | 현재 브라우저 클릭 테스트만 있음; FCM/VAPID·Edge Function·Cron 필요 |
| 실결제·구독 | **BLOCKED_EXTERNAL + 미구현** | PG·서버 checkout·서명 webhook·환불·entitlement 필요 |
| local 데모 → Hosted 계정 이관 | **미구현** | Hosted는 사용자별 cache/원격 문서에서 새로 시작 |
| 데이터 내보내기 | **구현** | 설정에서 공개 링크 bearer token을 제외한 JSON 다운로드; import는 미지원 |
| 계정 탈퇴 | **코드 구현 / 외부 미검증** | 재인증 세션·동일 origin·server-only admin 삭제와 cascade를 Preview에서 실증 필요 |
| 저장 receipt 보존·정리 | **구현** | 30일/batch cleanup 구현; 유휴 데이터 실행과 용량 모니터링은 운영 절차 |
| 관리 백업·복원 훈련 | **BLOCKED_EXTERNAL** | logical dump+manifest wrapper는 구현; 실제 관리 백업/PITR와 recovery 증거 없음 |

## 인수자가 실행할 순서

1. `npm run hosted:env:init`으로 기존 파일을 덮어쓰지 않는 `.env.local` 초안을 만들고 실제 운영자·지원·Supabase 값을 채운다.
2. Supabase Seoul 프로젝트를 생성하고 ref=앱 URL ref=로그인 계정 Seoul project guard와 ref 결합 ACK를 거쳐 migration 001·002·003·004·005·006을 적용한다.
3. 아래 로컬 검증을 깨끗한 `npm ci` 환경에서 다시 실행한다.
4. Vercel에 빈 project를 link하고, project ID 결합 ACK로 Hosted runtime 7개를 Preview 환경에 등록한 뒤 `npm run vercel:preview`로 현재 소스 지문이 포함된 첫 Preview를 만든다. deploy 중 지문이 바뀌어 wrapper가 실패하면 생성된 deployment를 신뢰하지 않고 재배포한다.
5. 그 READY Preview origin만 Supabase Auth config에 push하고 전체 신규 가입 OFF·이메일 로그인 ON과 정확한 `/auth/reset` allow-list 1개를 Dashboard에서 교차 확인한다.
6. 현재 셸에만 `auth_config_read` 권한 PAT를 넣고 `npm run status:domain-ready`를 실행한다. 로컬 receipt뿐 아니라 Vercel project/team·소스 지문, 배포 `/api/health`의 linked Supabase ref·현재 DB contract, Management API의 현재 Auth 설정이 모두 PASS해야 한다. PAT는 즉시 셸에서 제거한다.
7. `npm run check:external-inputs -- --json`으로 최종 도메인·SMTP·A/B·운영 evidence·현재 셸 전용 PAT/ACK와 Supabase/Vercel link/receipt의 입력 위치를 값 노출 없이 한 번에 점검한다. 이 입력 검사는 원격 current-state나 법률 검토를 대신하지 않는다.
8. Preview Auth readback과 custom SMTP·발신 DNS를 먼저 준비하고, 통제된 초대 계정 A/B로 Hosted/Vercel Preview의 격리·공개 링크·Realtime을 실증한다.
9. 관리 백업과 별도 recovery 복원 훈련을 한다.
10. 최종 전환 순서는 `도메인·최종 env 준비 → production env push → npm run vercel:production으로 alias 없는 현재 지문 production 배포·identity 검증·검증된 ID만 promote → 최종 도메인의 READY/HTTPS·/api/health 확인 → Supabase Auth 최종 origin push·Management API readback → Preview에서 연결한 custom SMTP/DNS 재확인 → 최종 origin의 새 외부 두 사업자 invite/reset·반송/운영 evidence → check:external-inputs → check:external-beta의 첫 production domain-ready·중간 검증·마지막 production domain-ready 재검증`으로 고정한다.
11. BLOCKED_EXTERNAL/미구현 항목을 제품 약관과 베타 범위에 맞춰 제한한다.

자세한 명령, 백업·복원, 롤백과 긴급 공개 RPC 차단은 [`DEPLOYMENT.md`](./DEPLOYMENT.md)에 있다. Supabase 함수·권한 계약은 [`supabase/README.md`](../supabase/README.md)에 있다.

## 최종 검증 증거 규칙

Hosted/Auth 변경 이전의 과거 `test-results/*final.log` 숫자를 현재 완료 증거로 재사용하지 않는다. 인수할 소스 snapshot에서 아래 명령을 새로 실행하고 exit code와 원문 로그를 보관한다.

```powershell
npm ci
npm run check:release
```

`check:release`는 unit/lint/typecheck/운영 의존성 audit/local production E2E와 Hosted fail-closed build를 모두 실행한다. 운영 완료 판정에는 로컬 테스트뿐 아니라 다음 외부 증거가 반드시 포함돼야 한다.

- Supabase project ref와 적용 migration 목록
- A/B 테스트 사용자 UUID와 교차 노출 없음 결과
- 다른 기기 공개 링크 접수·Realtime·완료 후 거부 결과
- Git 없는 CLI 배포: Vercel deployment ID, release fingerprint, UTC deployment timestamp
- Git 저장소를 함께 쓴 wrapper 배포: 위 세 값과 commit SHA. Vercel Git 자동 deployment 자체는 fingerprint meta가 없어 현재 검증 경로로 지원하지 않음
- 최종 HTTPS 응답 보안 헤더
- 저장소 밖 SMTP 수동 evidence의 Return-Path domain·외부 사업자 2곳 invite/reset·SPF/DKIM/DMARC pass·최종 landing·controlled bounce/suppression 결과
- 마지막 백업 시각과 recovery 복원 검증 기록

이 증거가 없으면 “코드는 준비됐지만 외부 운영은 미검증”으로 인수한다.
