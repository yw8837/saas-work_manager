# 인수인계: 일감체크

새 세션을 열면 이 파일부터 읽고 "다음 작업" 1번부터 진행한다. 사람이 첫 메시지로 "HANDOFF.md 보고 다음 작업 진행해"라고만 써도 되게 만든 문서다.

마지막 갱신: 2026-09-26

## 제품 한 줄

패키지형 서비스를 파는 1인 사업자·프리랜서가 고객, 시작일, 패키지, 옵션만 고르면 금액·마감·할 일·수정 한도가 한 번에 준비되는 일감 관리 SaaS. 자세한 정의는 PRODUCT.md.

차별점은 고객용 수정요청 링크다. 그래서 서버(Supabase)는 유지한다. 로컬 전용으로 바꾸지 않는다.

## 지금 상태 (2026-09-26 확인)

### 최신 UI/UX 배포 완료

- PR #4 `일감체크 첫 사용과 모바일 UI 개선`을 GitHub CI 성공(run 36245469226) 후 병합. 배포 소스는 `c62a2a9b4818e2a16cedc42a1c9397c5054d936b`.
- Sites 버전 27, 배포 `appgdep_6ab7cad2bac481919a6118803dffce96`, 상태 succeeded. 환경 revision 6, 공개 범위 public과 기존 도메인·Google 로그인·DB는 그대로다.
- 첫 일감 시작 안내, 16px 입력·44px 주요 버튼, 가로 패키지 목록, 중립 설문 안내, 정지/재생과 reduced-motion 기본값 개선. 명시적으로 재생을 시작하면 접근성 기본 정지보다 사용자 선택이 우선한다.
- 검증: 93 files/521 unit, 44 E2E, lint/typecheck, 운영 의존성 audit 0, local/hosted build PASS. 독립 리뷰에서 발견한 재생 재시작 문제를 RED→GREEN으로 수정한 뒤 전체 521 tests/정적 검사와 Sites build/output 검사를 다시 통과했다. 최종 PR CI도 전체 게이트 PASS.
- 배포 후 새·기존 주소 각각 smoke 9개 PASS. runtime `202608250011`, public-config digest `sha256:4ee3a0879973859a56df01137cc2e6c3466f90267d33d149a346780bcec0243f` 동일. 양쪽 브라우저에서 같은 로그인 계정, 일감 0건, 저장됨·실시간 연결됨, 새 시작 안내 확인. 검사한 브라우저 오류 로그 없음.
- 실제 작업 흐름은 로컬에서 패키지 저장→일감 생성→1/5 완료→수정 기록/남은 횟수 1→0 확인. 운영 데이터 생성·삭제는 하지 않았다. 새 도메인 390px 화면에서 설문 원문/링크와 첫 일감 CTA 확인, 기존 주소는 데스크톱 확인.
- 외장 D: main도 최신 제품 커밋으로 fast-forward했고 기존 GATES/설문/보안 검증 미커밋 자료 및 untracked 자료는 보존했다. PR #1은 여전히 OPEN이며 병합하지 않았다.
- 상세 사전 검증: `docs/verification/2026-09-26-uiux.md`. 최종 배포 영수증은 이 절이 최신이며, 해당 문서의 배포 전 Pending 표기를 대체한다. 렌더 증거/최종 디자인 보고서: `C:\Users\최용우\.gstack\projects\saas-work-manager\designs\design-audit-20260926\`.
- 남은 경계: 운영 `policyPublication.finalized=false`는 그대로다. UI/기능 검증 통과와 대외 베타 운영 준비 확정을 혼동하지 않는다. 운영 고객 bearer-token 실조회/제출은 테스트 자료 생성 승인이 없어 미검증. 결제 기능도 여전히 준비 중이다.

### 도메인 전환·보안 업데이트 이력
- 작업 기준 main: `b10312b`. 최종 제품 커밋 `5d6abe4c487ca0b09075eed96137cd757e82781c`를 main 병합·Sites 운영 배포 완료. D: 작업 폴더도 이 main으로 전환했으며 기존 설문 수정은 보존했다.
- 보안 커밋: `8de9d8c`, PR #2 `chore: 운영 의존성 보안 업데이트`는 GitHub CI 통과 후 사용자 승인으로 main 병합 완료.
- 새 운영 주소: `https://ilgam.studioyeolmae.com`. 기존 심사 주소 `https://ilgamcheck-beta.bsfire1237.chatgpt.site`도 유지 (ChatGPT Sites 동일 배포).
- GATES.md의 G1~G8은 2026-08-25 기준 모두 통과로 기록되어 있다.
- Next/@next/env/eslint-config-next 16.3.6, Vitest 4.1.11 및 하위 의존성 갱신 완료. 운영·개발 npm audit 모두 0건.
- 최종 작업 소스에서 check:release PASS: 91개 파일/517 unit tests, 44 E2E, lint/typecheck/local+hosted builds. 기본/새 origin Sites build 및 출력 검증도 PASS.
- 독립 리뷰의 와일드카드 Auth hostname 허용 문제를 재현 후 수정했고 기존/새 origin OAuth·고객 링크 테스트를 추가했다. 상세: docs/verification/2026-09-26-security-domain.md.
- 새 도메인 Sites/TLS active, 예스닉 DNS CNAME 1개/TXT 2개 등록 완료. 새/기존 주소 smoke 및 runtime readback PASS. Supabase Site URL은 새 주소, redirect는 기존/새 today/settings 총 4개.
- 사용자가 새 주소에서 Google 로그인 완료, Today/저장됨/실시간 연결됨 확인. 기존 주소도 같은 계정의 Today/실시간 연결 유지. 계정의 일감은 양쪽 모두 0건이어서 실제 고객 token 조회/제출 검증은 수행하지 않았다.
- 도메인 PR #3도 GitHub CI 통과 후 사용자 승인으로 main 병합 완료. Sites 버전 26, 배포 `appgdep_6ab7baeab5a881918eb416461b1ea6f3`, 환경 revision 6, succeeded 확인. NEXT_PUBLIC_SITE_ORIGIN은 새 주소로 설정하고 정확한 제품 커밋으로 재빌드했다.
- 배포 후 양쪽 주소 각각 smoke 9개 PASS, runtime 202608250011 및 public-config digest 동일 확인. Accept:text/html로 /와 /today HTTP 200·새 도메인 메타데이터 확인. 양쪽 브라우저 Today/저장됨/실시간 연결됨도 재확인.
- NEXT_PUBLIC_SITE_ORIGIN 미설정 시 기존 심사 주소 유지. 고객 토큰 재발급이나 DB 이동 없음.
- 외장 드라이브 I/O 지연 때문에 동일 소스의 C: 임시 복사본에서 검증했다. D: npm ci 복원은 exit 0으로 완료 확인했다.
- 열린 PR: #1 `claude/local-backup-restore` (로컬 모드 JSON 백업 불러오기). 보안 업데이트 main을 해당 브랜치에 합친 뒤 CI run 36241965670 SUCCESS. 사용자 지시대로 병합·배포하지 않았다.

## 다음 작업

### 1. 남은 운영 확인

- UI/UX PR #4 배포와 양쪽 주소 확인까지 완료. 정책 게시 확정(`policyPublication.finalized=false`)과 아래 운영 고객 링크 테스트 승인은 별도 확인이 필요하다.
- PR #2/#3 병합·운영 배포·배포 후 검증은 완료. 중복 배포하지 않는다.
- 실제 고객 bearer-token 조회/제출의 새·기존 주소 호환성은 미검증. 현재 로그인 계정의 일감이 0건이다. 검증용 패키지·일감 1건 생성/확인/정리 승인을 질문했으나 아직 답변 없음. 승인 전에는 운영 데이터를 만들지 않는다.
- D: npm ci 복원 완료. UI 작업은 `C:\Users\최용우\.codex\worktrees\ilgam-uiux-20260926`에서 분리 진행하며 D:의 미커밋 설문·검증 자료는 보존한다.
- PR #1은 CI가 통과해도 별도 기능이므로 임의로 main에 합치지 않는다.

### 2. 도메인 연결 (끝까지)

목표 주소: `https://ilgam.studioyeolmae.com` (이름을 바꾸려면 이 줄만 고치고 사용자에게 확인). 기존 chatgpt.site 주소는 당분간 같이 살려 둔다.

1. 코드 정리·회귀 테스트·DNS 등록은 완료. docs/DOMAIN-TRANSITION.md의 기록을 재사용하고 중복 도메인/레코드를 생성하지 않는다.
2. Sites custom domain/TLS active 및 Supabase Site URL/redirect 4개 적용 완료. 기존 today/settings 2개는 유지한다. CLI readback은 관리 토큰이 없어서 대시보드 재조회·실제 로그인으로 확인했다.
3. Google의 callback은 `https://evhkpgxacpweelnmjmqh.supabase.co/auth/v1/callback`이다. 앱의 today/settings를 Google callback으로 대체하지 않는다. 실제 OAuth 구성에 필요할 때만 승인된 JS 원본/브랜딩 URL을 추가한다.
4. NEXT_PUBLIC_SITE_ORIGIN을 새 주소로 설정하고 재빌드·배포 완료. 이후 값을 바꾸면 반드시 재빌드한다. 환경변수 미설정 시 코드 기본값은 기존 주소다.
5. 연결 확인 (여기까지 해야 끝):
   - `npm run smoke:sites -- https://ilgam.studioyeolmae.com` 통과
   - `npm run runtime:readback -- https://ilgam.studioyeolmae.com` 통과
   - 새 주소에서 Google 로그인 → Today 화면 진입을 사용자가 한 번 확인
   - 옛 주소로 만든 고객 수정요청 링크가 여전히 열림
   - 결과를 GATES.md에 새 게이트로 기록하고 이 파일의 "지금 상태"를 갱신한다.

## 사람 확인이 필요한 것

- 사용자가 로그인과 DNS 서비스 확인사항에 동의했고 에이전트가 DNS 등록 완료. 중복 요청하지 않는다.
- PR #2/#3 병합 승인과 실제 Google 로그인은 이미 완료. 고객 링크 검증용 자료 생성·정리 승인만 미응답이다.
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
