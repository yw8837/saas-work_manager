# Sites와 분리한 Cloudflare 배포 경로

## 지금 확인한 것

- 운영 주소 `https://ilgam.studioyeolmae.com`은 **자체 도메인이나 현재 호스트는 GPT Sites**다. 도메인 소유와 호스팅 독립은 서로 다르다.
- 저장소의 Next.js 16 앱은 `@opennextjs/cloudflare`로 Worker 번들을 만들 수 있다. 기존 OpenNext 1.20.2는 Next 16.4의 `preview-props.json`을 누락해 로컬 Worker의 모든 경로가 500이었고, 1.20.12로 올려 해결했다. 2026-11-01 별도 작업 폴더에서 `npm ci`, 빌드, Wrangler dry-run, 로컬 Worker `/`·`/guide`·`/demo/r` **각각 HTTP 200**을 확인했다. `/api/health`는 가짜 Supabase 값으로 테스트했으므로 설정 미완료 **503**이다. Google 로그인·DB·고객 흐름의 운영 통과는 아니다.
- Cloudflare CLI는 사용자 계정에 로그인돼 있지만, Worker의 서버 비밀키 등록·Preview 실제 배포·OAuth 허용 주소·운영 DNS 전환은 아직 하지 않았다.
- PR #21의 DB migration과 신청 기능은 독립 배포 경로와 별개의 운영 관문이다. 검증 전에는 함께 배포하지 않는다.

## Claude가 독립적으로 수정·배포하는 순서

1. Claude는 자기 브랜치에 제품을 수정하고 PR을 만든다. 운영 반영은 PR 검사와 리뷰 통과 후 `main` 병합이 기준이다. Sites source remote로 push할 필요가 없다.
2. 별도 worktree에서 `npm ci`, `npm run check:release`를 실행한다. `check:release`의 Sites 전용 검사가 Cloudflare 준비를 대신하지는 않는다.
3. 해당 worktree의 `.env.local`에는 **공개 빌드값만** 넣는다. 최소 `NEXT_PUBLIC_STORAGE_MODE=hosted`, Supabase URL·publishable key, 공개 운영자명·지원 메일, 가입 플래그, `NEXT_PUBLIC_SITE_ORIGIN`이 필요하다. 서버 비밀키는 파일·셸 환경에 두지 않는다. 최초 bootstrap에서 Worker 주소를 아직 모르면 Preview origin에 임시 `https://ilgamcheck-preview.<계정>.workers.dev` 형식을 사용하고, **실제 URL을 확인한 뒤 다시 빌드·배포**한다. 운영은 `https://ilgam.studioyeolmae.com`으로 별도 빌드한다. `.env.local`은 Git에 넣지 않는다.
4. 새 Worker에는 아직 secret을 등록할 수 없다. 최초 한 번만 **신규 가입을 끈 상태**에서 `npm run cloudflare:preview:check` → `npm run cloudflare:preview:bootstrap`으로 별도 `ilgamcheck-preview` Worker를 만든다. 최초 번들은 서버 관리자 키가 없어 전체 기능을 제공하지 못하며 고객에게 배포하는 URL이 아니다. CLI 출력의 정확한 `workers.dev` URL을 확인한 다음 `.env.local`의 `NEXT_PUBLIC_SITE_ORIGIN`을 그 주소로 맞춘다.
5. Worker 서버 비밀키는 Cloudflare에 직접 등록한다. `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name ilgamcheck-preview`를 실행하고 Supabase의 **해당 프로젝트** secret을 대화·파일·명령 인수에 남기지 않는 방식으로 입력한다. 운영 Worker `ilgamcheck`에도 별도 등록해야 한다. Secret 목록은 `npx wrangler secret list --name <worker> --format json`으로 이름만 점검한다. 실제 값은 읽히지 않는다. 그 뒤 `npm run cloudflare:preview:deploy`로 완전한 Preview를 재배포한다. 배포 명령은 secret 존재를 먼저 검사하며, 빌드 때 서버 비밀키가 보이면 중단한다.
6. Supabase Auth의 허용 redirect에 Preview 주소의 `/today`, `/settings`를 **정확한 origin으로** 추가하고 테스트 전용 계정으로 Google 로그인·일감 등록·고객 요청·로그아웃/재로그인을 확인한다. 운영 계정·실제 고객 데이터를 시험에 사용하지 않는다. `npm run smoke:remote -- https://<정확한-preview-workers.dev>`가 health 계약·보안 헤더·PWA 경로를 검증한다. 신규 가입 플래그가 꺼진 최초 bootstrap은 이 검사에 통과하지 않는 게 정상이다. 검사에 실패하면 운영 이전을 중단한다.
7. 운영 Worker: PR 병합 후 깨끗한 `main == origin/main`에서 `npm run cloudflare:production:check`를 실행한다. 아직 `ilgamcheck` Worker가 없다면 **신규 가입을 끄고** 현재 셸에 `ILGAMCHECK_CLOUDFLARE_DEPLOY_ACK=DEPLOY_ilgamcheck_FROM_main`을 둔 뒤 `npm run cloudflare:production:bootstrap`으로 Worker만 만든다. 그 다음 `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name ilgamcheck`로 서버 키를 직접 등록하고, 가입 플래그를 실제 운영값으로 되돌려 `npm run cloudflare:production:deploy`한다. 이미 Worker와 secret이 있으면 bootstrap을 건너뛴다. 두 운영 배포 명령 모두 깨끗한 `main == origin/main`과 위 확인 문구가 없으면 거절된다. Worker URL에서 운영 조건을 먼저 확인한다. 부트스트랩 중 만든 Worker는 관리자 키가 없어 완전한 서비스가 아니며 도메인에 연결하지 않는다.
8. **도메인 전환은 별도 작업**이다. Cloudflare Worker Custom Domain은 대상 도메인의 DNS zone이 Cloudflare에 있어야 한다. 현재 예스닉 DNS에서 Sites를 가리키는 CNAME을 바로 바꾸면 기존 운영이 끊길 수 있다. 도메인 전체의 다른 서비스·메일 레코드·TTL·TLS·롤백을 확인한 뒤 Cloudflare zone 이전과 Custom Domain 연결을 진행한다. DNS 전환 전까지 기존 Sites 주소는 유지한다. 전환 후 Supabase Site URL·redirect, Google 로그인, 모바일 앱 딥링크/공개 링크를 다시 확인한다.

## 장애·롤백

- Preview 실패는 Worker 배포를 중단하고 Sites 운영을 그대로 둔다.
- 운영 Worker 자체는 독립 배포되더라도 DNS를 옮기기 전에는 현재 서비스가 계속 Sites를 사용한다.
- 도메인 전환 직후 장애가 나면 확인한 직전 DNS/CNAME으로 되돌리고 로그인·고객 링크를 재검증한다. DB migration은 DNS 롤백으로 되돌아가지 않으므로 별도 계획이 필요하다.
- `wrangler deploy --keep-vars`를 사용해 기존 Cloudflare Worker secret을 지우지 않는다. `NEXT_PUBLIC_*` 공개값은 해당 빌드와 Worker에 같이 전달한다. server secret을 `NEXT_PUBLIC_*`로 이름 짓지 않는다.

## 아직 완료라고 말할 수 없는 항목

- Cloudflare Preview의 실제 URL·서버 비밀키 연결·Supabase OAuth 복귀·실사용 smoke
- 운영 도메인의 Cloudflare zone 이전·DNS/HTTPS/앱 링크 전환
- PR #21의 동의 상태 재확인, migration·정책·운영자 계정 관문

이 항목이 끝나기 전에는 “Sites와 완전히 분리해 운영 중”이라고 보고하지 않는다. 다만 위 CLI 경로는 Sites API 없이 Claude가 같은 소스의 Preview/운영 Worker 빌드와 배포를 직접 실행할 수 있게 한다.
