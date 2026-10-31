# 인수인계: 일감체크

새 세션을 열면 이 파일부터 읽고 "다음 작업" 1번부터 진행한다. 사람이 첫 메시지로 "HANDOFF.md 보고 다음 작업 진행해"라고만 써도 되게 만든 문서다.

마지막 갱신: 2026-10-31

## 제품 한 줄

패키지형 서비스를 파는 1인 사업자·프리랜서가 고객, 시작일, 패키지, 옵션만 고르면 금액·마감·할 일·수정 한도가 한 번에 준비되는 일감 관리 SaaS. 자세한 정의는 PRODUCT.md.

차별점은 고객용 수정요청 링크다. 그래서 서버(Supabase)는 유지한다. 로컬 전용으로 바꾸지 않는다.

## 지금 상태

### 2026-10-31 개발 의존성 감사 17개 → 0개 (재배포 불필요)

- 원인 권고 2개: GHSA-g3hv-75wg-m249(minimatch <11.0.1, 2026-10-30 공개, 11.0.1만 패치)와 GHSA-mrhx-c7xc-m3w5(zod <4.6.6). 17개 중 15개는 minimatch를 쓰는 eslint 쪽 연쇄 표시였다.
- zod: `eslint-plugin-react-hooks`만 쓰고 허용 범위가 `^3.25.0 || ^4.0.0`이라 override `"zod": "^4.6.6"` → 4.6.7.
- minimatch: 업스트림 최신판도 아직 3.x·10.x다(eslint/eslint#21463, typescript-eslint#13125 열린 상태. 3.x 영향 범위 정정 제안 github/advisory-database#10807도 미병합). 11은 함수가 아니라 객체를 내보내고 `makeRe`를 없애 그대로 바꾸면 eslint가 깨진다. 그래서:
  - 3.x 사용처 6곳(eslint, @eslint/eslintrc, @eslint/config-array, eslint-plugin-import·react·jsx-a11y) → `vendor/minimatch-v3-compat`(3.x 호출 모양 + 패치된 11.0.3 엔진). 3.1.5의 `pattern.trim()`과 Windows `\` 처리를 그대로 맞췄다. override `"minimatch@<10": "$minimatch"` + 루트 devDependency `file:` (상대 경로 file: override는 npm이 각 패키지 기준으로 풀어 링크가 깨지므로 `$` 참조를 쓴다).
  - 10.x 사용처(typescript-estree, `minimatch(path, pattern)`만 씀) → override `"minimatch@>=10 <11.0.1": "11.0.3"`.
- 검증: 진짜 3.1.5와 래퍼를 실제 경로 458 × 패턴 51(공백·`\` 변형 포함) × 옵션 7 × 일반/부분 = 327,012번 비교 → 일반 일치 차이 0, 부분 일치 64건은 모두 11.0의 의도된 `**` 수정이며 eslint가 쓰는 `dot:true`에선 `..` 경로뿐. eslint 결과 교체 전후 같은 328개 파일·지적 0(+새 테스트 파일 1). npm 10.9.9·11.12.1 깨끗한 `npm ci` 성공·감사 0. `check:release` 전체 PASS(unit 132파일/827, E2E 74), PGlite 권한 24 PASS. `scripts/minimatch-v3-compat.test.mjs` 17개는 옛 잠금 파일·공백 처리 제거로 일부러 망가뜨리면 실패함을 확인. Sites 빌드 결과 136파일이 v36 배포본과 해시까지 같아 재배포하지 않았다. Codex 읽기 전용 독립 리뷰 지적(Windows `\`·trim, 테스트 프리릴리스 비교·항진식) 반영.
- 업스트림이 11.0.1 이상으로 올리면 `vendor/minimatch-v3-compat`, devDependency `minimatch`, override 두 줄, `eslint.config.mjs`의 `vendor/**`를 함께 지운다.

### 2026-10-31 PR #19 운영 Sites v36 배포 완료 — 실제 고객 링크에 작업자 이름·마감·진행 단계

- 사용자 "배포부터 마쳐" 지시. 소스 main `78f9e34`(PR #19 병합), 트리 `0a38884662fb22bc95f6962b0c523f5f0b3a8ac2`.
- 운영 DB migration `20261031110217_public_revision_view`(Supabase apply_migration이 적용 시각으로 버전을 기록해 파일 이름을 맞췄다). `get_workspace_revision_view(text)`: anon·authenticated·service_role 실행 true, PUBLIC 없음, 가짜 토큰 0행.
- Sites 버전 36: `appgprj_6a8b16a27df88191b5cad3afd63a9366~appgver_ebd4b36fc5488191a6efeee755d931c5`, 배포 `appgdep_6ae5edee2c448191ad59b38b392db618`, `succeeded` 2026-10-31 22:32:51 KST. helper commit `78f9e34`, 136파일, 로컬 tar SHA256 `a2460066b1f86aef6bc73719da3b5dbcdf4d7e76f551e65b7c98c41bc07cc65f`, 서버 tar SHA256 `b2e4d0bac37d6b36a261553f2e3ac2ba0086e468308ebdc70f327a2cc8132598`. public·환경 revision 7 유지.
- 확인: 두 주소 JS `index-BYKeBOXl.js`(로컬 빌드와 같은 이름)에 `get_workspace_revision_view`·`publicWorkerName` 포함, `/ /today /guide /demo/r /settings` 200, health `ready=true`·`publicConfigDigest` 변화 없음, `smoke:sites` 두 주소 PASS. 브라우저로 `/r/<가짜 토큰>`을 열면 `rpc/get_workspace_revision_view` 200(옛 함수로 되돌아간 호출 없음). 실제 작업자 데이터로 이름·마감·단계가 보이는지는 사용자 계정으로 확인할 일이다.
- **배포 요령(Windows):** Codex workspace-write 샌드박스는 `.git`과 분리한 git 폴더까지 쓰기를 막아 공식 helper 커밋이 불가능하다 → 사용자 허락으로 전체 권한 1회. helper를 tty로 띄울 때 Store판 `WindowsApps\pwsh.exe`면 os error 5 → 셸을 `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe`로 지정. 샌드박스 git의 schannel 오류는 배포 복사본 `.git/config`에 `http.sslBackend=openssl`과 CA 사본. 운영 확인 curl은 `Accept: text/html` 헤더가 있어야 화면 HTML(없으면 404).

### 2026-10-31 PR #18 운영 Sites v35 배포 완료

- 사용자 "배포까지 진행" 승인에 따라 공식 Sites 스킬의 source helper → save_site_version → deploy_site_version 절차로 배포했다. 아래 2026-10-30 리뉴얼·설명서·체험 링크 절의 "미배포"는 당시 기록이며 PR #18 내용은 이번 v35에 반영됐다.
- 소스 SHA `42ab4aac6304a468c9849c2f6d384f2723238fb4`. 원본 main HEAD·제품 파일은 그대로다. 별도 `../sites-deploy-20261031-pr18` 복사본에서 공식 helper로 기존 Sites 원격만 push했고 새 커밋·GitHub push는 하지 않았다.
- Sites 버전 35: `appgprj_6a8b16a27df88191b5cad3afd63a9366~appgver_e439a89885588191be6ad55d7eaded68`. 배포 `appgdep_6ae556af42908191aa5baa94f0bce12d`, 최종 `succeeded`, 2026-10-31 11:47:25.301 KST (`2026-10-31T02:47:25.301101+00:00`). 기존 public·환경 revision 7 유지.
- `npm ci` → `npm run build:sites` → `node scripts/verify-sites-output.mjs` 모두 exit 0. 공식 helper 패키징 성공, 수동 tar 대체 없음. manifest project_id·Worker `dist/server/index.js`·셸 payload·설명서 이미지 확인 완료.
- 로컬 `../ilgamcheck-pr18-20261031.tar.gz`: 파일 136개, 6,118,815바이트, SHA256 `a671ba2d79960087e7b014e8d555a63638c478e0b95cf7f0ae430b1413353b09`. Sites 저장 영수증 tar: 파일 136개, 6,963,200바이트, SHA256 `1f0643a1abed3c6c312058ab1eae2567db9e539fcf0c064a4d26a6d11ba8ac5d`. 각각 로컬 압축 파일과 서버 저장 영수증의 값이다.
- 새 주소·기존 chatgpt.site 주소 `smoke:sites` 각각 13개 PASS/0개 FAIL, exit 0. `/guide` GET 200, `/demo/r` GET 200 및 `X-Robots-Tag: noindex, nofollow, noarchive`, `/today?invite=TEST` GET 200 및 `Referrer-Policy: no-referrer`. 마지막 확인 2026-10-31 11:49:08 KST. 실제 응답의 JS·CSS 파일명도 이번 빌드와 일치했다.
- `npm run runtime:readback -- https://ilgam.studioyeolmae.com`: 미완료(exit 1). 첫 시도는 복사본에 `supabase/.temp/project-ref`가 없어 BLOCKED. Claude가 project-ref만 넣어 다시 돌리자 `FAIL /api/health: 배포 public config가 현재 로컬 환경값과 일치하지 않습니다` — 복사본에 `.env.local`이 없어 비교 대상이 비어 있기 때문이며, 비밀값 파일은 복사하지 않았다. 대신 새·기존 주소 `/api/health`의 `publicConfigDigest`가 둘 다 `sha256:855a25e6…b737a`로 10/23 v34 영수증 값과 같음을 확인했다(환경 미변경 근거).
- 별도 읽기 전용 `/api/health`: HTTP 200, `ready=true`, hosted, project ref `evhkpgxacpweelnmjmqh`, DB runtime expected/detected `202608250011`, `serviceRoleContractCurrent=true`, 정책 `databaseMatches=true`. 기존 `policyPublication.finalized=false`는 그대로다. 이 보조 조회는 CLI PASS나 external-beta 완료를 뜻하지 않는다.
- 경고: `npm ci`의 전체 감사(개발 의존성 포함)는 17개(중간 16·높음 1)다. 출시 게이트의 운영 의존성 감사 `npm audit --omit=dev`는 0개다(PR #18의 `6fb2130`·`c3496fa`에서 body-parser·qs·undici·glob를 고쳐 CI 통과). 빌드에는 Vite native config의 확장자 없는 import·500 kB 초과 chunk 경고가 있었다. 의존성·제품 코드는 변경하지 않았다.
- 원시 출력은 별도 복사본의 `npm-ci.log`, `build-sites.log`, `verify-sites.log`, `smoke-custom-domain.log`, `smoke-original-domain.log`, `runtime-readback.log`, `*-headers.log`, `health-readback.log`에 보존했다. 로그인·계정/일감 생성·DB 쓰기·환경변수/공개 범위/도메인/slug/메타데이터 변경·예약 생성 없음. HANDOFF 기록은 Claude가 검증을 덧붙여 main에 단독 커밋했다(HANDOFF 예외 규칙).

### 2026-10-30 "바로 쓸 수 있게" 리뉴얼 (미배포)

- 같은 브랜치 `claude/guide-demo-link` 위에 커밋만 했다. push·PR·배포·운영 DB/Auth/환경변수 변경 없음. 스키마·마이그레이션·RPC 변경 없음.
- 일감 저장 직후(`?created=1`, 체크리스트에서 오면 `?send=1`) 상세 맨 위 "이제 고객에게 보내세요" 띠: 링크 복사·카톡 문구 복사·고객 화면 미리보기, 복사가 막히면 주소 칸 선택. 닫으면 주소에서 표시만 지운다.
- 고객 링크 화면: 남은 수정 큰 숫자, 접수 뒤 "다음에 일어나는 일", 꺼진 링크의 다음 행동, 개인정보 안내 접기(문구 그대로). 작업자 이름·마감·진행 단계 칩은 **서버가 안 내려 줘서 실제 `/r/{token}`에는 안 나오고 `/demo/r`에서만** 보인다(사용자 결정 필요).
- 오늘 화면 빈 상태 → 첫 실행 체크리스트 3단계(업종 예시 고르기·패키지 확인 → 첫 일감 → 링크 보내기). 진행 표시는 브라우저 `ilgamcheck:first-run:v1`에만 남기고, 일감·고객 요청 데이터로도 판단한다.
- 업종 예시(웹/디자인/영상/촬영): 일감 0건·누적 0건일 때 사용자가 고를 때만. 손대지 않은 예시만 보관(삭제 아님), 사용자 것은 그대로. `src/lib/store/industry-starters.ts`.
- 랜딩 보조 버튼 "가입 없이 고객 화면 체험", CTA 아래 안심 줄, 미리보기 첫 장면 고객 화면. `/guide` 맨 위 6칸 띠·단계별 "직접 해보기". 설명서 그림 02·04 다시 찍음.
- 검증 기록·안 한 것: `D:/SaaS/01_일감체크/스테이션/과제/2-MVP/범위-리뉴얼-2026-10-30.md`.
- 2026-10-31 사용자 결정 반영: 초대 링크 `/today?invite=CODE` → 주소에서 바로 지우고 sessionStorage `ilgamcheck:pending-invite`에 Google 로그인 왕복 동안만 보관 → 약관 동의 뒤 베타 관문이 기존 `activateInviteCode`로 자동 적용(성공하면 건너뜀, 실패하면 코드를 채운 기존 화면+오류). 코드 없는 가입자의 베타 관문은 그대로다. 무료 한도는 그대로다. DESIGN.md에 코드 실제값(주 버튼 먹색, 파랑은 기본 층 링크·정보, 산호 등 마케팅 전용, 모서리·바탕)을 적었고 코드 색은 바꾸지 않았다(리뉴얼에서 새로 만든 `--blue-line`만 작업 화면에서 중립 별칭으로 덮음).

### 2026-10-30 그림 사용설명서·고객 화면 체험 링크 (미배포)

- 브랜치 `claude/guide-demo-link`(origin/main `89543f8` 기준, 작업 트리 `D:/SaaS/01_일감체크/app-wt-guide`). push·PR·배포·운영 DB/Auth 변경 없음.
- `/demo/r`: 로그인 없이 여는 고객 수정요청 체험. 실제 `/r/[token]`과 같은 `PublicRevisionView`를 쓰고, 요청은 메모리에서만 차감(새로고침하면 초기화). `X-Robots-Tag`·meta noindex. Next 루트 레이아웃과 Sites 셸 모두 `/demo/r`·`/guide`에서는 WorkspaceProvider를 띄우지 않는다(`src/lib/standalone-routes.ts`).
- `/guide`: 6단계 그림 설명서. 이미지 `public/guide/*.webp`는 `npx playwright test -c playwright.guide.config.ts`(로컬 모드 가짜 예시 데이터)로 다시 찍는다. 랜딩·로그인 화면에 설명서·체험 링크 추가.
- 검증 기록·남은 한계: `D:/SaaS/01_일감체크/스테이션/과제/2-MVP/범위-설명서-체험링크-2026-10-30.md`.

### 2026-10-24 앱 복귀 주소 등록·실기기 외 운영 점검

- 사용자가 앱 callback 등록을 명시 승인했다. `com.yeolmaestudio.ilgamcheck://auth/callback` 등록 후 새로고침·재조회로 정확한 문자열을 확인했다. 기존 새/이전 웹 `/today`, `/settings` 4개 유지, 총 5개. Site URL도 그대로다. 입력 중 일시적으로 잘못 저장된 새 문자열 1개는 즉시 제거했고 최종 목록에는 없다. 아래 과거의 callback 승인 대기는 해소됐다.
- 현재 브랜치 `codex/beta-ops-20261024`. 복구 검증 도구의 legacy smoke·비밀번호 전제 오류를 Sites/Google 세션으로 수정했다. 실제 restore/계정삭제/기기 검증을 수행한 것은 아니다. `docs/verification/2026-10-24-beta-operations.md`의 최종 영수증을 확인한다.
- 공개 사이트 2곳 각각 13개 smoke, native API 8개 PASS. Google=true/email=false/phone=false. ready=true·DB/runtime 계약 일치. 푸시 Edge v3 ACTIVE, cron 1개 활성, 조회 직전 1시간 60회 성공, 기기·발송시도·대기요청 0개.
- 정책은 finalized=false 유지. `docs/BETA-REMAINING-OPERATIONS.md`에 공개 전 문구 검토, 실제 탈퇴/복구 입력, Android 연결 절차를 정리했다. 운영 고객 데이터 export/delete/restore와 비용·법적 승인 상태는 변경하지 않았다.
- 실기기는 이번 사용자 요청에서 제외. Android APK는 2026-10-23 내부 검증용 그대로이며 SHA256 재확인. iPhone 서명 환경도 그대로 미준비다. 결과/화면: `D:/SaaS/01_일감체크/release-artifacts/2026-10-24-beta-operations`.

### 2026-10-23 모바일 베타 운영 보완

- 현재 분리 폴더 브랜치는 `codex/sites-head-stream-20261023`이다. PR14(모바일·디자인·운영)와 PR15(HEAD500 수정)를 각각 최신 CI 통과 후 main에 병합했다. main `9fe139f47345db2aa0092cf16cbbf61179a1ebb8`로 fast-forward했으며, 이어지는 보고서 갱신은 제품 산출물 변경이 아니다. PR #1은 병합하지 않았다.
- 로그인 계정 전환 즉시 이전 owner·화면·저장 권한을 무효화하고 이전 비동기 완료를 generation으로 차단했다. Today 일감 범위는 URL로 유지한다. Next 16.4.2/Vite 8.3.5/Vitest 4.1.12로 갱신했다.
- FCM 발송 전용 키와 dispatch key는 Supabase 서버/Vault에만 보관한다. Edge `native-revision-push` v3, HMAC 90초·일회성 nonce를 적용했다. 공개/무효 호출 401, GET405, 유효 서명200, 재사용409. 실제 pg_net→Edge 200·발송0 확인 후 1분 cron 활성화.
- pg_net 관리자 소유 큐는 프로젝트 REVOKE로 제한되지 않는다. 실패한 ACL 시도도 원격 이력과 함께 보존한다. 최종 해법은 큐에 장기 키를 넣지 않는 서명 호출이며, DB 로그인 역할의 큐 조작/DoS까지 해결했다고 표현하지 않는다.
- 운영 migration: `20261023112855_native_push_scheduler`, `20261023113041_native_push_queue_acl`(ACL 효과 없음), `20261023113840_native_push_signed_dispatch`. nonce RPC는 service_role 전용, 실제 dispatcher와 nonce table은 postgres 전용 확인.
- 이번 작업에서 표준 Supabase CLI 로그인을 수행하여 **기본 CLI 계정이 일감체크 계정으로 바뀌었다**. 기존 ‘전역 인증 교체 금지’ 인수인계와 달리 실행된 사항이다. 다른 프로젝트 데이터는 변경하지 않았다. 이후 다른 프로젝트 작업 전 계정/조직을 반드시 다시 확인한다.
- Android 새 APK 빌드·서명 통과, SHA256 `7c8035114841925e1666c359d848759d7a9f159639d96af6406fc27c1f8b3616`. 실기기는 연결0대. iOS는 Mac/Apple Developer/APNs가 없어 서명·TestFlight 미완료.
- 외부 배포 승인은 별도다. `docs/MOBILE-BETA-OPERATIONS.md`에 개인정보 추가 초안, 삭제/복구·기기 검증표를 작성했다. 정책 finalized=false는 유지한다. 현재 앱 callback 추가의 액션 시점 승인과 실기기 확인이 남아 있다.
- GitHub/Sites 배포 영수증 및 최종 자동 검사 수치는 `docs/verification/2026-10-23-mobile-beta-operations.md`에 기록한다.
- 최종 운영은 Sites34, 제품소스 `4153f62d895a36a6583dabb2b9323eb3519432cc`, deployment `appgdep_6adb4ccef24c81919b4dda6eee39b460`, succeeded(21:02 KST), public/env7 유지. CI39949497164: 116파일719PASS/1플랫폼skip·E2E58PASS·lint/typecheck/운영audit0/build PASS. 새·기존 주소 smoke 각각13/13, native API8/8, HEADtoday200. Worker 빈 HEAD 스트림 재사용500을 실제 재현 후 수정했다.
- 내부 설치 파일과 최종 보고서: `D:/SaaS/01_일감체크/release-artifacts/2026-10-23-mobile-beta`. 외부 베타는 정책·실제 탈퇴/복구 증거·앱 callback 승인·Android 실기기·iOS 서명 환경 조건이 남아 있어 공개 보류. Supabase Free 유휴정지 위험도 유료전환 없이 없애지 않았다.

### 2026-10-21 작업 화면 디자인 — 모바일 구현 이후 별도 브랜치

- 현재 같은 분리 폴더의 브랜치는 `codex/mobile-workspace-design`이다. `codex/mobile-linked-mvp` 및 PR #13의 head `6c75674`는 그대로 보존했다. UI 변경을 기존 PR에 몰래 추가하지 않는다.
- 사용자 요구: 파랑·초록·베이지와 AI 생성형 SaaS 느낌 배제, 실제 참고 자료 조사 후 메인이 디자인 선택. 흰색·흑연색 작업 목록과 제한된 체리색 주의 표시로 결정했다.
- 일감별 Today 범위 선택, 동일 고객 주문 구분, 모바일 수정 잔여 표시와 목록·버튼·패키지·설정 스타일 정리. `.appFrame` 범위만 변경하고 랜딩·공개 폼·운영 데이터는 보존한다.
- 단위 712개 / 브라우저 58개, Next/Sites 빌드·lint/typecheck·모바일 sync·Android 빌드·APK v2 서명 통과. 독립 리뷰 지적 5개 UI 항목을 수정하고 25개 화면을 다시 확인했다. 최종 판정·문서·해시는 `docs/verification/2026-10-21-workspace-design.md`를 확인한다.
- 디자인 검증 APK와 화면은 `D:/SaaS/01_일감체크/release-artifacts/2026-10-21-workspace-design`에 있다. 이전 모바일 APK는 보존했다. 이 디자인 브랜치는 아직 push/운영 배포하지 않았다.
- 로컬 미리보기 `http://127.0.0.1:4121/today`는 C: 검증 복사본을 실행한다. D: 분리 폴더가 편집 원본이다. 운영 반영과 실기기 검증 완료로 혼동하지 않는다.

### 2026-10-21 모바일 연동 MVP

- 작업 원본은 `D:/SaaS/01_일감체크/.worktrees/mobile-mvp`, 브랜치는 `codex/mobile-linked-mvp`. 원본 app의 사용자 변경과 index.lock은 보존했다.
- 웹·Android·iOS 공통 계정/일감, 보안 PKCE 저장, 앱 복귀, 수정 요청 푸시 outbox/발송기, 계정 전환·삭제 보호, 오프라인 읽기 전용 화면을 구현했다.
- 독립 리뷰 첫 구현 `704257c`의 Important 4건·Minor 2건을 메인이 재현·수정했다. 최종 자동 검사 708개/115파일, E2E 56개, typecheck/lint, Next/Sites, 운영 audit 0 통과. Android debug APK 빌드·서명 검사 통과. 상세는 `docs/verification/2026-10-21-mobile-mvp.md`.
- 사용자가 검사 통과 후 운영 DB/Auth callback/최소권한 FCM 키/예약 호출/PR 병합/웹 API 배포를 승인했다. 무료 Firebase 등록, native push DB migration `20261020162521`, 호출 secret으로 보호된 Edge Function v1 배포 완료. FCM 전송 권한 한 개의 전용 계정 준비. Auth callback/키/예약 호출/웹 배포는 검증 기록과 함께 갱신할 것. 기존 데이터 삭제·유료 전환·아가톡 변경·모집 연락은 제외.
- Supabase CLI 기본 계정은 다른 프로젝트 목록을 반환한다. 일감체크 `evhkpgxacpweelnmjmqh`를 지원하는 연결 도구/올바른 대시보드를 사용하고, 다른 계정의 전역 인증을 교체하지 않는다.
- 실기기 0대, Apple Developer/Mac 없음. Android 설치/OAuth/백그라운드 알림 및 iOS 서명·TestFlight 완료로 표현하지 않는다.

### 과거 운영 이력 — 이하 날짜 당시의 기록

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

- 2026-09-30: 코드의 기본 운영 주소를 `https://ilgam.studioyeolmae.com`으로 바꿨다(링크 미리보기 등). DNS는 연결됨. 남은 일: ChatGPT Sites에 다시 배포, 새 주소 HTTPS·로그인 확인, Supabase Auth Site URL/Redirect URLs를 supabase/config.toml과 같게 맞추기.

## 다음 작업

### 배포 후 남은 확인 (2026-10-31)

1. PR #18 v35 배포는 완료됐다. 동일 소스로 중복 배포하지 말고 위 버전·배포 영수증을 재사용한다.
2. runtime:readback CLI는 복사본의 로컬 Supabase 연결 정보 부재로 BLOCKED다. 검증된 기존 연결 checkout과 필요한 공개 설정을 확보한 뒤 읽기 전용 재검증한다. 이번 health 보조 조회를 CLI PASS로 적지 않는다.
3. 개발 의존성 포함 전체 감사 17개(운영 의존성 0개)는 별도 검토 과제다. 배포 승인 범위를 넓혀 자동 수정하지 않는다. 정책 finalized=false와 아래 실기기·운영 증거 과제는 미완료 상태를 유지한다.

### 0. 모바일 MVP 운영 연결과 실기기 게이트

1. PR14·15의 CI/병합·DB/FCM/예약 호출·웹/API 운영 반영은 완료했다. 위 2026-10-23 영수증을 재사용하고 키·cron·배포를 중복 생성하지 않는다.
2. 앱 callback 등록·재조회는 2026-10-24 완료. 중복 등록하거나 기존 웹 주소를 삭제하지 않는다.
3. 실기기는 2026-10-24 요청에서 제외했다. 사용자가 폰 연결 후 검증 재개를 요청하면 Android APK 설치, Google 로그인 복귀, 웹↔앱 저장, 잠금화면/앱 종료 푸시, 계정 전환을 확인한다.
4. iPhone 네이티브 배포는 Apple Developer와 Mac/Xcode 준비가 필요하다. 비용 승인이나 계정 가입을 임의로 진행하지 않는다.
5. `docs/BETA-REMAINING-OPERATIONS.md`에 따라 개인정보 안내 검토·게시 승인, 전용 Google A/B 계정, 별도 recovery 환경·암호화 export 위치를 확보한다. 현재 external-beta gate를 통과로 표시하지 않는다. 실제 계정 삭제·운영 데이터 export는 정확한 대상 승인 없이 실행하지 않으며 운영 DB에는 복원하지 않는다.
6. 사용자 연락은 하지 않는다. 검증 복사본·APK·증거는 보존하며 자동 정리하지 않는다. 작업 원본은 D:의 `.worktrees/mobile-mvp`이고 기본 Supabase CLI 계정 변경 사실을 먼저 확인한다.

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
