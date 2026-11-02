# Sites와 분리한 Cloudflare 배포 경로

## 지금 확인한 것

- 운영 주소 `https://ilgam.studioyeolmae.com`은 2026-11-01에 GPT Sites에서 Cloudflare Worker `ilgamcheck` Custom Domain으로 전환했다. 도메인 소유와 호스팅 독립은 서로 다른 개념이며, 현재 이 주소의 호스트는 Worker다.
- 저장소의 Next.js 16 앱은 `@opennextjs/cloudflare`로 Worker 번들을 만들 수 있다. 기존 OpenNext 1.20.2는 Next 16.4의 `preview-props.json`을 누락해 로컬 Worker의 모든 경로가 500이었고, 1.20.12로 올려 해결했다. 2026-11-01 별도 작업 폴더에서 `npm ci`, 빌드, Wrangler dry-run, 로컬 Worker `/`·`/guide`·`/demo/r` **각각 HTTP 200**을 확인했다. `/api/health`는 가짜 Supabase 값으로 테스트했으므로 설정 미완료 **503**이다. Google 로그인·DB·고객 흐름의 운영 통과는 아니다.
- PR #22가 `main`에 병합됐다. `ilgamcheck-preview.bsfire1237.workers.dev`에 Preview Worker를 배포하고 서버 비밀키를 Worker secret에만 등록했다. `/api/health`와 `npm run smoke:remote`가 통과했고, Supabase Auth에 정확한 Preview `/today`·`/settings` 복귀 주소를 추가했다. 기존 Google 계정으로 Preview `/today` 복귀와 저장·실시간 연결 표시를 확인했다. 일감 0건 계정이므로 등록·고객 요청 쓰기 흐름은 아직 검증하지 않았다.
- PR #23(`57a4eff`)으로 운영 bootstrap 플래그 모순을 고쳤다. 운영 Worker `ilgamcheck`에 Supabase 서버 키를 Worker secret으로 등록하고 가입 켬으로 최종 배포했다(버전 `7ce18edc-57ae-41d1-ad6c-2028584d545e`). 운영 및 Preview Worker는 별개다.
- 비공개 원본 백업 `D:/SaaS/01_일감체크/스테이션/회의록/2026-11-01-studioyeolmae-DNS-원본.md`의 28개 레코드를 Cloudflare zone과 대조했다. 네임서버를 Cloudflare로 전환한 뒤 `ilgam` Sites CNAME 한 건만 제거하고 Worker Custom Domain으로 연결했다. 다른 호스트와 Daum MX는 보존했다. 전환 직후 `npm run smoke:remote -- https://ilgam.studioyeolmae.com` 통과, 기존 Google 계정의 `/today` 복귀·계정 저장·실시간 연결·누적 일감 1건 표시 확인. 단, 일감 생성·고객 요청 쓰기 및 모바일 실기기 검증은 아직이다.
- PR #21의 DB migration과 신청 기능은 독립 배포 경로와 별개의 운영 관문이다. 검증 전에는 함께 배포하지 않는다.
- Worker 진입 파일은 `custom-worker.ts`다(2026-11-03). OpenNext가 만든 `.open-next/worker.js`의 fetch 처리기를 감싸 HTML 응답에 `Cache-Control: no-transform`을 붙이고 압축 방식(br, 안 되면 gzip)을 정한다. 운영 주소에 우리 계정에 없는 Cloudflare 분석 스크립트가 끼워져 CSP에 막히던 것을 막기 위해서다(`src/lib/security/html-delivery.ts`). `wrangler.jsonc`의 `main`을 `.open-next/worker.js`로 되돌리면 이 보호가 빠진다.

## Claude가 독립적으로 수정·배포하는 순서

1. Claude는 자기 브랜치에 제품을 수정하고 PR을 만든다. 운영 반영은 PR 검사와 리뷰 통과 후 `main` 병합이 기준이다. Sites source remote로 push할 필요가 없다.
2. 별도 worktree에서 `npm ci`, `npm run check:release`를 실행한다. `check:release`의 Sites 전용 검사가 Cloudflare 준비를 대신하지는 않는다.
3. 해당 worktree의 `.env.local`에는 **공개 빌드값만** 넣는다. 최소 `NEXT_PUBLIC_STORAGE_MODE=hosted`, Supabase URL·publishable key, 공개 운영자명·지원 메일, 가입 플래그, `NEXT_PUBLIC_SITE_ORIGIN`이 필요하다. 서버 비밀키는 파일·셸 환경에 두지 않는다. 최초 bootstrap에서 Worker 주소를 아직 모르면 Preview origin에 임시 `https://ilgamcheck-preview.<계정>.workers.dev` 형식을 사용하고, **실제 URL을 확인한 뒤 다시 빌드·배포**한다. 운영은 `https://ilgam.studioyeolmae.com`으로 별도 빌드한다. `.env.local`은 Git에 넣지 않는다.
4. 새 Worker에는 아직 secret을 등록할 수 없다. 최초 한 번만 **신규 가입을 끈 상태**에서 `npm run cloudflare:preview:check` → `npm run cloudflare:preview:bootstrap`으로 별도 `ilgamcheck-preview` Worker를 만든다. 최초 번들은 서버 관리자 키가 없어 전체 기능을 제공하지 못하며 고객에게 배포하는 URL이 아니다. CLI 출력의 정확한 `workers.dev` URL을 확인한 다음 `.env.local`의 `NEXT_PUBLIC_SITE_ORIGIN`을 그 주소로 맞춘다.
5. Worker 서버 비밀키는 Cloudflare에 직접 등록한다. `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name ilgamcheck-preview`를 실행하고 Supabase의 **해당 프로젝트** secret을 대화·파일·명령 인수에 남기지 않는 방식으로 입력한다. 운영 Worker `ilgamcheck`에도 별도 등록해야 한다. Secret 목록은 `npx wrangler secret list --name <worker> --format json`으로 이름만 점검한다. 실제 값은 읽히지 않는다. 그 뒤 `npm run cloudflare:preview:deploy`로 완전한 Preview를 재배포한다. 배포 명령은 secret 존재를 먼저 검사하며, 빌드 때 서버 비밀키가 보이면 중단한다.
6. Supabase Auth의 허용 redirect에 Preview 주소의 `/today`, `/settings`를 **정확한 origin으로** 추가하고 테스트 전용 계정으로 Google 로그인·일감 등록·고객 요청·로그아웃/재로그인을 확인한다. 운영 계정·실제 고객 데이터를 시험에 사용하지 않는다. `npm run smoke:remote -- https://<정확한-preview-workers.dev>`가 health 계약·보안 헤더·PWA 경로를 검증한다. 신규 가입 플래그가 꺼진 최초 bootstrap은 이 검사에 통과하지 않는 게 정상이다. 검사에 실패하면 운영 이전을 중단한다.
7. 운영 Worker의 **최초 생성 절차는 2026-11-01에 한 번 완료됐다.** 신규 가입 `false` 상태에서 bootstrap으로 Worker를 만든 뒤 Worker secret을 등록하고 가입 `true`로 최종 배포했다. 이미 Worker와 secret이 있으므로 다시 bootstrap하거나 키를 재등록하지 않는다. 이후 배포 절차는 아래 9번을 따른다.
8. **도메인 전환은 완료됐다.** Cloudflare DNS zone 활성화 후 Worker Custom Domain `ilgam.studioyeolmae.com`을 연결했다. 기존 `chatgpt.site` 주소는 별도로 유지한다. 앞으로 Cloudflare zone의 `ilgam` DNS를 임의로 Sites CNAME으로 되돌리지 않는다. Supabase Site URL·redirect는 운영 주소를 유지하며, 모바일 앱 딥링크/공개 링크는 실기기에서 재검증한다.
9. **Claude의 다음 운영 배포:** 제품 브랜치에서 PR 검사·리뷰를 거쳐 `main`에 병합한다. 깨끗한 `main == origin/main` 작업 폴더에서 `npm ci` 후 공개 빌드값만 담은 무시된 `.env.local`을 준비한다. `NEXT_PUBLIC_SITE_ORIGIN=https://ilgam.studioyeolmae.com`, 가입 플래그와 Supabase 공개값을 확인한다. `npm run check:release`와 `npm run cloudflare:production:check`를 통과시킨 뒤 현재 셸에 `ILGAMCHECK_CLOUDFLARE_DEPLOY_ACK=DEPLOY_ilgamcheck_FROM_main`을 설정하고 `npm run cloudflare:production:deploy`를 실행한다. **bootstrap은 재실행하지 않는다.** 배포 뒤 `npm run smoke:remote -- https://ilgam.studioyeolmae.com`와 로그인·핵심 업무 흐름을 확인한다. 서버 키를 `.env.local`, Git, CLI 인수에 넣지 않는다. Worker secret은 이미 등록돼 있고 `wrangler secret list --name ilgamcheck --format json`으로 이름만 확인할 수 있다.

## 장애·롤백

- Preview 실패는 Worker 배포를 중단하고 Sites 운영을 그대로 둔다.
- 운영 Worker 자체는 독립 배포되더라도 DNS를 옮기기 전에는 현재 서비스가 계속 Sites를 사용한다.
- 도메인 전환 직후 장애가 나면 확인한 직전 DNS/CNAME으로 되돌리고 로그인·고객 링크를 재검증한다. DB migration은 DNS 롤백으로 되돌아가지 않으므로 별도 계획이 필요하다.
- `wrangler deploy --keep-vars`를 사용해 기존 Cloudflare Worker secret을 지우지 않는다. `NEXT_PUBLIC_*` 공개값은 해당 빌드와 Worker에 같이 전달한다. server secret을 `NEXT_PUBLIC_*`로 이름 짓지 않는다.

## 아직 완료라고 말할 수 없는 항목

- Preview의 로그인 왕복은 확인했지만 전용 테스트 계정의 일감 등록·고객 수정 요청 쓰기 흐름
- 모바일 앱 딥링크·공개 링크의 전환 후 실기기 확인, 리졸버별 DNS 캐시 전파 완료 확인
- `expat.studioyeolmae.com` 루트의 HTTP 404 원인 확인(이전과 동일한 Sites CNAME은 보존됨)
- PR #21의 동의 상태 재확인, migration·정책·운영자 계정 관문

이 항목이 끝나기 전에는 “Sites와 완전히 분리해 운영 중”이라고 보고하지 않는다. 다만 위 CLI 경로는 Sites API 없이 Claude가 같은 소스의 Preview/운영 Worker 빌드와 배포를 직접 실행할 수 있게 한다.
