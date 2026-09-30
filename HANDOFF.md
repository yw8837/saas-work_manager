# 인수인계: 일감체크

새 세션을 열면 이 파일부터 읽고 "다음 작업" 1번부터 진행한다. 사람이 첫 메시지로 "HANDOFF.md 보고 다음 작업 진행해"라고만 써도 되게 만든 문서다.

마지막 갱신: 2026-09-27

## 제품 한 줄

패키지형 서비스를 파는 1인 사업자·프리랜서가 고객, 시작일, 패키지, 옵션만 고르면 금액·마감·할 일·수정 한도가 한 번에 준비되는 일감 관리 SaaS. 자세한 정의는 PRODUCT.md.

차별점은 고객용 수정요청 링크다. 그래서 서버(Supabase)는 유지한다. 로컬 전용으로 바꾸지 않는다.

## 지금 상태 (2026-09-27 확인)

### 보안 재점검 — 요청 본문 제한 보완

- 계정 삭제 API가 크기 제한 전 본문을 전부 읽던 자원 소모 위험을 재현했다. Sites·Next 모두 공통 bounded reader로 1,024바이트 초과 즉시 413, 총 업로드 5초 초과 408, 잘못된 UTF-8 400으로 제한했다. 실제 계정 삭제·운영 데이터 변경·DB migration은 없다.
- 신규 회귀 10개 중 수정 전 8개 실패→수정 후 전부 PASS. 전체 94파일/531개 PASS, lint/typecheck PASS. 독립 리뷰 Critical/Important 0건. slow-drip 실제 Node 추가 검사도 5초 제한 확인.
- 운영 RLS 31/31, 함수 권한 계약 23/23 PASS. 익명 저장 401/42501, 가짜 고객 토큰 조회 빈 결과, cross-origin 계정 삭제 403, health 200/ready=true. 의존성 audit0.
- 상세: `docs/verification/2026-09-27-security-review.md`. 최종 배포는 v29이며 아래 영수증이 해당 보고서의 진행 중 표기를 대체한다.
- 남은 CSP unsafe-inline 방어 강화, 정책 finalized=false, 실제 탈퇴/백업 복구 증거, 유료 결제 미구현 상태를 숨기지 않는다. 자동 보안 경고는 보고서에서 의도된 권한과 별도 운영 과제로 구분했다.

#### 2026-09-27 최종 영수증

- 로컬 `check:release` 전체 PASS: 94파일/531 unit, 52 E2E(데스크톱26+모바일26), lint/typecheck/audit0/local+hosted build. Sites 운영 origin 빌드 및 산출물 검사 PASS. 패키징된 Worker에서도 초과 청크 두 번째 읽기 직후 취소·413 확인.
- PR #6 `https://github.com/yw8837/saas-work_manager/pull/6`, head `c7a73ba7f5778ce7b4d7d2d3e869c3bb12627a9b`의 GitHub CI `36300761744` SUCCESS(verify 3m56s) 후 main 병합. 제품 소스 `8c54b6370b8c48381fb6455c2da9b596c0b0a433`.
- Sites v29: 버전 `appgprj_6a8b16a27df88191b5cad3afd63a9366~appgver_7f1be531156881918623e64f592d1052`, 배포 `appgdep_6ab8bbbea2608191804ffb00e6a0e0c3`, succeeded, 2026-09-27 15:46:35 KST. 공개 범위 public, 환경 revision6 유지. 도메인/DNS/DB/Auth 설정 변경 없음.
- 배포 후 새·기존 주소 각각 기본 smoke 9/9 PASS. 각각 1,025바이트 요청 413, 잘못된 UTF-8 400, 합성 무효 토큰 401 확인. Google=true/email=false/다른 provider 없음도 운영 공개 Auth 설정에서 확인. 실제 계정·작업 데이터 생성/삭제 없음.
- 배포 도구의 기존 Windows 경로 패키징 오류는 소스 push·검증 후 발생. 동일 clean main 소스에서 생성한 dist를 tar로 묶어 manifest/Worker 파일 확인 후 native save/deploy 성공. 파일 `C:\Users\최용우\AppData\Local\Temp\ilgam-security-8c54b63.tar`. 도구 오류를 애플리케이션 검사 통과로 둔갑시키지 않는다.
- D: main 최신 제품 소스로 fast-forward 완료. 기존 GATES/설문/과거 보안 문서 및 untracked 자료 보존. PR #1 OPEN 유지, 병합하지 않음. 이 HANDOFF 단독 영수증 갱신은 제품 산출물 변경이 아니므로 재배포하지 않는다.

### 최신 운영 검증 및 최소 권한 보완

- 최종 main CI run `36248973128` SUCCESS (verify 5m3s). 배포 제품 커밋 `4f1d4cc90455ae71d594689e869863bc282a7ebd`의 자동 검증까지 종료했다. 이후 HANDOFF 단독 기록 커밋은 배포 산출물을 바꾸지 않으므로 중복 배포하지 않는다.

- 대표 주소는 `https://ilgam.studioyeolmae.com`. 기존 주소는 심사 링크 호환용이다. DB 최소 권한·일감 삭제 기록 정리 및 빈 일감 화면 정렬을 추가 보완했다. 최종 배포 영수증은 아래에 별도 기록한다.
- 사용자 "전부다 완료하고 보고해" 지시에 따라 운영 검증 전용 일감 1건 생성. 새·기존 고객 링크 각각 접수 성공, 작업자 화면 수정 사용 0→1→2 및 실시간 원문/시각 반영 확인. 기존의 고객 링크 "미검증" 기록은 이 결과로 대체한다.
- 원격 함수 기본 ACL의 anon 직접 EXECUTE를 확인. owner RPC 14개와 trigger 4개의 불필요한 실행 권한만 제거한 migration `20260926140654_rpc_execution_surface` 적용. 고객 bearer RPC 3개와 authenticated/service_role 권한 유지. 독립 리뷰 완료, 실제 권한 회귀 22개 모두 true. 기존 trigger 4개 활성 및 owner 그대로 유지.
- 적용 후 일감 할 일 완료 저장(1/6) 및 고객 요청 접수도 정상. 한도 초과 요청은 추가 작업 검토로 기록. 익명 owner RPC는 HTTP 401/42501로 차단된다.
- 새·기존 주소 smoke 각9개 PASS, DB ACTIVE_HEALTHY. 521 tests/93 files, lint/typecheck, 운영 audit0 PASS. mobile bundle 생성 후 mobile:verify PASS(실기기/스토어 승인 아님).
- PR #5 main 병합 완료: `4f1d4cc90455ae71d594689e869863bc282a7ebd`. 기능 변경 head `882ba84`의 CI run `36248678105` SUCCESS 후 병합했다. 뒤이은 `ccfc5ca`는 검증 문서 문구만 수정했으며 새 PR check가 생성되지 않아 reopen도 시도했다. 최종 동일 tree의 로컬 check:release는 unit521/93파일, E2E52, lint/typecheck/audit0/local+hosted build PASS. main CI run `36248973128` 상태는 최종 영수증 참고. CI Linux의 Windows 전용 npx spawn 1건 skip은 기존 플랫폼 조건이며 Windows 로컬에서는 실행 PASS.
- Sites v28 운영 반영 완료. 버전 `appgprj_6a8b16a27df88191b5cad3afd63a9366~appgver_6ec48b24d9e88191922fe5603328783d`, 배포 `appgdep_6ab7d8b424388191983fb48f30bd4665`, succeeded(2026-09-26 23:37 KST), env revision6/public 유지. 소스는 위 main merge SHA. Sites 공식 workflow가 소스 push/검증은 완료했지만 Windows bash 경로로 packaging 실패하여 검증된 dist를 native tar로 포장해 저장했다. source/build hosting 일치와 worker/manifest 엔트리 검증 완료.
- v28 새·기존 주소 smoke 각각9개 PASS, health200/readytrue/runtime202608250011/digest 동일. runtime:readback CLI는 분리 checkout에 Supabase link가 없어 BLOCKED였으며 성공으로 기록하지 않는다. 대신 양쪽 실제 /api/health 응답의 DB 계약 및 Supabase 연결 도구로 확인했다. 운영 UI의 일감0·저장됨·실시간 연결됨·수정된 빈 목록 정렬 확인. 캡처: `C:\Users\최용우\.gstack\projects\saas-work-manager\designs\design-audit-20260926\screenshots\production-final-v28.png`.
- 외장 D: main도 4f1d4cc로 fast-forward 완료. 분리 worktree `C:\Users\최용우\.codex\worktrees\ilgam-uiux-20260926`를 재사용하며 기존 D: 미커밋/미추적 자료는 모두 보존. PR #1은 OPEN 유지, 병합하지 않았다.
- 사용자 명시 승인 및 확인 클릭 후 `[운영검증 20260926] 삭제가능 테스트` 일감과 요청 3건 정리 완료. 삭제 전 별도 portal/request가 잔존하는 실제 버그를 발견해 migration `20260926141910_workspace_job_revision_cleanup`으로 수정했다. 과거 잔존한 해당 fixture만 owner/job/portal와 정확한 수량으로 제한해 삭제했고 DB portal0/request0 확인. 기존 패키지·계정·다른 데이터는 삭제하지 않았다.
- 삭제 회귀는 임시 합성 계정과 실제 save RPC로 RED→GREEN 검증 후 전부 rollback. 일반 편집·유지 일감·타인·무관한 orphan 보존, 삭제 링크/재등록 거부 및 살아 있는 링크의 제출/중복 재시도 검사 PASS. 최종 유효 권한 23/23 true. document→portal 잠금 순서와 접근 제어 독립 검토 PASS, 대규모 동시 부하 검사는 미수행.
- 빈 목록에서 안내 요소가 한 줄에 붙던 기존 결함은 세로 flex와 gap만 추가했다. 320/1440px 초기·검색 빈 상태 4개 E2E RED→GREEN, 독립 코드 리뷰 및 로컬 실제 모바일/데스크톱 화면 확인 완료. 내용·데이터 로직 변경 없음.
- 미완료: 정책 finalized=false와 실제 법률/계정탈퇴/백업복구 운영 증거. 기록을 꾸미거나 운영 DB를 복원 시험 대상으로 사용하지 않는다. 기존 external-beta orchestration은 Vercel/SMTP/password AMR 전제가 남아 있어 현재 Sites/Google-only와 정렬 필요. 유료 결제는 여전히 준비 중.
- 상세 검증은 PR #5의 `docs/verification/2026-09-26-operational-final.md`에 기록했다. 이하 UI/도메인 절의 "운영 데이터 미생성/고객 링크 미검증"은 과거 기록이다.

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

- 2026-09-30: 법적고지에 사업자 정보를 채웠다. 값은 `src/lib/business-identity.ts`에 있다(상호 열매스튜디오(열매STUDIO), 대표 최용우, 사업자등록번호 665-38-01736, 통신판매업 2026-부산영도-0153, 전화 010-8282-8837, 문의 studioyeolmae.com@gmail.com). 배포 환경변수에 옛 운영자명·이메일이 남아 있으면 그 값이 우선하므로 배포 설정에서 확인할 것.
- 2026-09-30: 1번 보안 업데이트(npm audit fix)는 PR #8로 main에 합쳐졌다. `npm audit --omit=dev` 0건, check:release 통과. 아래 1번은 끝났으니 PR #1 브랜치에 main을 합쳐 CI만 다시 확인하면 된다.

## 다음 작업

### 1. 남은 운영 확인

- 2026-09-27 본문 제한 보안 수정은 PR #6 병합·v29 배포·운영 차단 확인까지 완료. 같은 수정이나 실제 삭제 검사를 중복 수행하지 않는다. 후속은 별도 CSP 강화 설계와 남은 운영 증거 확인이다.

- UI/UX PR #4 배포와 운영 고객 링크 양쪽 조회/제출까지 완료. 정책 게시 확정(`policyPublication.finalized=false`)과 실제 운영 증거는 별도 확인이 필요하다.
- PR #2/#3 병합·운영 배포·배포 후 검증은 완료. 중복 배포하지 않는다.
- PR #5 병합 및 Sites v28 배포 완료. 테스트 일감/요청 정리와 고객 bearer-token 조회/제출 검증도 완료했으므로 같은 테스트 자료를 다시 만들거나 중복 배포하지 않는다.
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
- PR #2/#3 병합 승인과 실제 Google 로그인, 고객 링크 검증 및 테스트 자료 삭제는 완료했다. 예전 삭제 UI 확인 대기 문구는 유효하지 않다.
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
