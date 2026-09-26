# 인수인계: 일감체크

새 세션을 열면 이 파일부터 읽고 "다음 작업" 1번부터 진행한다. 사람이 첫 메시지로 "HANDOFF.md 보고 다음 작업 진행해"라고만 써도 되게 만든 문서다.

마지막 갱신: 2026-09-26

## 제품 한 줄

패키지형 서비스를 파는 1인 사업자·프리랜서가 고객, 시작일, 패키지, 옵션만 고르면 금액·마감·할 일·수정 한도가 한 번에 준비되는 일감 관리 SaaS. 자세한 정의는 PRODUCT.md.

차별점은 고객용 수정요청 링크다. 그래서 서버(Supabase)는 유지한다. 로컬 전용으로 바꾸지 않는다.

## 지금 상태 (2026-09-26 확인)

- 작업 기준 main: `b10312b chore: add handoff instructions` (2026-09-26 origin/main pull 완료).
- 보안 커밋: `8de9d8c`, PR #2 `chore: 운영 의존성 보안 업데이트`는 GitHub CI 통과 후 사용자 승인으로 main 병합 완료.
- 운영 주소: `https://ilgamcheck-beta.bsfire1237.chatgpt.site` (ChatGPT Sites 배포)
- GATES.md의 G1~G8은 2026-08-25 기준 모두 통과로 기록되어 있다.
- Next/@next/env/eslint-config-next 16.3.6, Vitest 4.1.11 및 하위 의존성 갱신 완료. 운영·개발 npm audit 모두 0건.
- 최종 작업 소스에서 check:release PASS: 91개 파일/517 unit tests, 44 E2E, lint/typecheck/local+hosted builds. 기본/새 origin Sites build 및 출력 검증도 PASS.
- 독립 리뷰의 와일드카드 Auth hostname 허용 문제를 재현 후 수정했고 기존/새 origin OAuth·고객 링크 테스트를 추가했다. 상세: docs/verification/2026-09-26-security-domain.md.
- 새 도메인 Sites/TLS active, 예스닉 DNS CNAME 1개/TXT 2개 등록 완료. 새/기존 주소 smoke 및 runtime readback PASS. Supabase Site URL은 새 주소, redirect는 기존/새 today/settings 총 4개.
- 사용자가 새 주소에서 Google 로그인 완료, Today/저장됨/실시간 연결됨 확인. 기존 주소도 같은 계정의 Today/실시간 연결 유지. 계정의 일감은 양쪽 모두 0건이어서 실제 고객 token 조회/제출 검증은 수행하지 않았다.
- 도메인 PR #3은 #2 병합 후 base를 main으로 변경했다. 사용자는 이번 두 PR의 검사 통과 후 병합·배포를 승인했으며 기존 기능 PR #1의 병합은 제외했다.
- NEXT_PUBLIC_SITE_ORIGIN 미설정 시 기존 심사 주소 유지. 고객 토큰 재발급이나 DB 이동 없음.
- 외장 드라이브 I/O 지연 때문에 동일 소스의 C: 임시 복사본에서 검증했다. D: npm ci 복원 상태는 작업 종료 시 확인할 것.
- 열린 PR: #1 `claude/local-backup-restore` (로컬 모드 JSON 백업 불러오기). 코드 검사는 통과했고 audit 때문에만 CI가 빨간색이다. 1번 작업이 main에 합쳐지면 이 PR도 main을 합쳐 CI를 다시 돌리면 된다.

## 다음 작업

### 1. PR 병합 및 배포 마무리

- PR #2는 병합 완료. PR #3의 최신 CI 성공 후 승인 범위 내에서 병합한다.
- 정확히 검증한 커밋으로 Sites 소스 push, 버전 저장/배포, 원격 smoke를 수행한다. 로컬 검증 성공을 운영 배포 완료로 해석하지 않는다.
- PR #2가 합쳐지면 기존 PR #1 브랜치에 main을 merge하고 CI를 다시 확인한다. #1은 별도 기능이므로 임의로 운영에 합치지 않는다.

### 2. 도메인 연결 (끝까지)

목표 주소: `https://ilgam.studioyeolmae.com` (이름을 바꾸려면 이 줄만 고치고 사용자에게 확인). 기존 chatgpt.site 주소는 당분간 같이 살려 둔다.

1. 코드 정리·회귀 테스트·DNS 등록은 완료. docs/DOMAIN-TRANSITION.md의 기록을 재사용하고 중복 도메인/레코드를 생성하지 않는다.
2. Sites custom domain/TLS active 및 Supabase Site URL/redirect 4개 적용 완료. 기존 today/settings 2개는 유지한다. CLI readback은 관리 토큰이 없어서 대시보드 재조회·실제 로그인으로 확인했다.
3. Google의 callback은 `https://evhkpgxacpweelnmjmqh.supabase.co/auth/v1/callback`이다. 앱의 today/settings를 Google callback으로 대체하지 않는다. 실제 OAuth 구성에 필요할 때만 승인된 JS 원본/브랜딩 URL을 추가한다.
4. NEXT_PUBLIC_SITE_ORIGIN을 새 주소로 설정하려면 반드시 재빌드한다. 실제 인증 흐름 확인 전에는 기존 기본값을 유지한다.
5. 연결 확인 (여기까지 해야 끝):
   - `npm run smoke:sites -- https://ilgam.studioyeolmae.com` 통과
   - `npm run runtime:readback -- https://ilgam.studioyeolmae.com` 통과
   - 새 주소에서 Google 로그인 → Today 화면 진입을 사용자가 한 번 확인
   - 옛 주소로 만든 고객 수정요청 링크가 여전히 열림
   - 결과를 GATES.md에 새 게이트로 기록하고 이 파일의 "지금 상태"를 갱신한다.

## 사람 확인이 필요한 것

- 사용자가 로그인과 DNS 서비스 확인사항에 동의했고 에이전트가 DNS 등록 완료. 중복 요청하지 않는다.
- 공유 main 병합 결정, 계정 추가 승인 화면이 나오면 해당 승인, 실제 Google 로그인 후 Today 진입 확인.
- 결제 기능은 아직 없다. 요금 표현은 PRODUCT.md "가입과 베타 이용 코드"를 따른다.

## 자주 쓰는 명령

```bash
npm ci
npm test            # vitest
npm run typecheck
npm run lint
npm run audit:prod
npm run check:release   # 출시 전 전체 검사
npm run build:sites && node scripts/verify-sites-output.mjs
```

## 작업 규칙 (모든 세션 공통)

- 답은 한국어로, 쉬운 말로, 이모지 없이 한다. 확인한 사실만 말하고, 확인하지 못한 것은 "미검증"으로 따로 적는다.
- 이 저장소의 AGENTS.md, GATES.md, PRODUCT.md, README.md 규칙을 먼저 읽고 따른다.
- main에 바로 커밋하지 않는다. 새 브랜치에서 작업하고 끝나면 PR로 올린다. (이 HANDOFF.md 갱신만 예외)
- 키, 토큰, 비밀번호를 코드와 커밋에 넣지 않는다. 필요한 값이 없으면 멈추고 무엇이 필요한지 알려 준다.
- 테스트를 건너뛰거나 끄지 않는다. 실패하면 원인을 고친다.
- 작업이 끝나면 바꾼 것, 돌린 검사와 결과, 남은 일을 짧게 보고하고, 이 파일의 "지금 상태"와 "다음 작업"을 갱신한다.
