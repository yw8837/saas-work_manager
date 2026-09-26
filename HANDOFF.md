# 인수인계: 일감체크

새 세션을 열면 이 파일부터 읽고 "다음 작업" 1번부터 진행한다. 사람이 첫 메시지로 "HANDOFF.md 보고 다음 작업 진행해"라고만 써도 되게 만든 문서다.

마지막 갱신: 2026-09-26

## 제품 한 줄

패키지형 서비스를 파는 1인 사업자·프리랜서가 고객, 시작일, 패키지, 옵션만 고르면 금액·마감·할 일·수정 한도가 한 번에 준비되는 일감 관리 SaaS. 자세한 정의는 PRODUCT.md.

차별점은 고객용 수정요청 링크다. 그래서 서버(Supabase)는 유지한다. 로컬 전용으로 바꾸지 않는다.

## 지금 상태 (2026-09-26 확인)

- main 최신 커밋: `cb06b09 docs: record google oauth beta verification`
- 운영 주소: `https://ilgamcheck-beta.bsfire1237.chatgpt.site` (ChatGPT Sites 배포)
- GATES.md의 G1~G8은 2026-08-25 기준 모두 통과로 기록되어 있다.
- `npm audit --omit=dev`가 실패한다. 이 저장소 코드 문제가 아니라 8월 25일 이후 새로 공개된 취약점 권고 때문이다.
  - next 16.3.1: critical, 16.3.6에서 수정
  - wrangler, miniflare, sharp: high (npm audit fix로 해결 가능)
  - qs: moderate (npm audit fix로 해결 가능)
- 열린 PR: #1 `claude/local-backup-restore` (로컬 모드 JSON 백업 불러오기). 코드 검사는 통과했고 audit 때문에만 CI가 빨간색이다. 1번 작업이 main에 합쳐지면 이 PR도 main을 합쳐 CI를 다시 돌리면 된다.

## 다음 작업

### 1. 운영 의존성 보안 업데이트 (먼저)

- 새 브랜치에서 `next`와 `eslint-config-next`를 16.3.6 이상(같은 16.3.x 최신)으로 올린다.
- `npm audit fix`로 wrangler, miniflare, sharp, qs를 갱신한다. package-lock.json은 npm으로만 다시 만든다. 손으로 고치지 않는다.
- Next 업그레이드로 동작이 바뀐 곳은 `node_modules/next/dist/docs/` 안내를 확인하고 고친다. (AGENTS.md 참고)
- 완료 기준: `npm run check:release`의 unit, lint, typecheck, audit, local build, local E2E, hosted build가 모두 통과. `npm audit --omit=dev`가 0건.
- PR 제목: `chore: 운영 의존성 보안 업데이트`
- 합쳐지면 PR #1 브랜치에 main을 merge하고 CI가 초록색이 되는지 확인한다.

### 2. 도메인 연결 (끝까지)

목표 주소: `https://ilgam.studioyeolmae.com` (이름을 바꾸려면 이 줄만 고치고 사용자에게 확인). 기존 chatgpt.site 주소는 당분간 같이 살려 둔다.

1. 코드와 스크립트에서 옛 주소가 하드코딩된 곳을 모두 찾아 목록으로 보여 주고, 운영 주소를 환경변수나 설정 한 곳에서 읽도록 정리한다. (smoke:sites, runtime:readback, 정책 문서 manifest, OG 이미지 주소 등)
2. 고객 수정요청 링크가 새 도메인으로 만들어지고, 옛 도메인으로 이미 보낸 링크도 계속 열리는지 테스트로 확인한다.
3. PR 제목: `feat: 운영 도메인 설정 분리와 새 도메인 준비`. 합쳐지면 ChatGPT Sites에 다시 배포한다.
4. 사용자에게 아래 설정을 순서대로 요청하고, 값이 필요한 곳은 정확한 값을 적어 준다. 사용자가 "했어"라고 하면 다음 단계로 간다.
   - ChatGPT Sites 프로젝트 설정에서 커스텀 도메인 `ilgam.studioyeolmae.com` 추가 → 화면에 나오는 확인용 TXT 값 전달받기
   - DNS(예스닉): CNAME `ilgam` → `custom-domains.chatgpt.site`, 확인용 TXT 레코드 추가
   - Supabase Auth: Site URL을 새 주소로, Redirect URLs에 `https://ilgam.studioyeolmae.com/today`, `/settings` 추가 (옛 주소 항목은 남김)
   - Google Cloud OAuth 클라이언트: 승인된 JavaScript 원본과 리디렉션 URI에 새 주소 추가
5. 연결 확인 (여기까지 해야 끝):
   - `npm run smoke:sites -- https://ilgam.studioyeolmae.com` 통과
   - `npm run runtime:readback -- https://ilgam.studioyeolmae.com` 통과
   - 새 주소에서 Google 로그인 → Today 화면 진입을 사용자가 한 번 확인
   - 옛 주소로 만든 고객 수정요청 링크가 여전히 열림
   - 결과를 GATES.md에 새 게이트로 기록하고 이 파일의 "지금 상태"를 갱신한다.

## 사람이 해야 하는 것 (에이전트가 대신 못 함)

- 도메인 DNS 설정, ChatGPT Sites 커스텀 도메인 연결
- Supabase 대시보드, Google Cloud OAuth 설정
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
