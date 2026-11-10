# 인수인계: 일감체크

새 세션을 열면 이 파일부터 읽고 "다음 작업" 1번부터 진행한다. 사람이 첫 메시지로 "HANDOFF.md 보고 다음 작업 진행해"라고만 써도 되게 만든 문서다.

마지막 갱신: 2026-11-05 (벤치마킹 적용 2가지, PR #36)

## 제품 한 줄

패키지형 서비스를 파는 1인 사업자·프리랜서가 고객, 시작일, 패키지, 옵션만 고르면 금액·마감·할 일·수정 한도가 한 번에 준비되는 일감 관리 SaaS. 자세한 정의는 PRODUCT.md.

차별점은 고객용 수정요청 링크다. 그래서 서버(Supabase)는 유지한다. 로컬 전용으로 바꾸지 않는다.

## 지금 상태

### 2026-11-10 메일 받은 사람용 둘러보기(/try) · 약관 화면 오류 · 코드 칸 (브랜치 `claude/try-page`)
- **/try (새 공개 페이지, 로그인 없이)**: 콜드메일에 넣는 링크 1개. 소개 한 줄 → 4단계 체험(패키지 고르기 → 카톡 문구 → 고객 수정 요청 → 수정 완료 때 1회 차감, 예시 데이터만·저장/전송 없음) → `Google로 시작하기`(`/today?invite=BETA2026`) → 만든 곳(상호·대표·사업자등록번호·문의). 멘토 피드백 4번(동적 시뮬레이션 설명서)과 3번(코드는 맨 아래 한 줄, 단계별 지시 대신 링크 1개)을 반영. 숫자는 `sample-order.ts` 예시 패키지만 쓴다. 단독 경로·사이트맵 등록.
- **약관·개인정보처리방침 React 418(운영에서 확인)**: 원인은 `policy-page.tsx` 머리의 `<Link href="/"><Brand /></Link>`. `Brand`가 이미 홈 링크라 a 안에 a가 생겨 브라우저가 HTML을 고쳐 버렸다. 로그인 연결 모드 운영 빌드에서 재현 → 고친 뒤 /terms·/privacy·/guide·/·/today 오류 0. 시험 `policy-page.test.tsx`(고치기 전 실패 확인).
- **코드 칸**: 베타 관문·설정의 코드 입력에 `autoCapitalize="characters"`·`autoCorrect="off"`·`spellCheck={false}`. 초대 링크 자동 적용은 가짜 서버 응답으로 /try → 시작 → 로그인 → 약관 동의 → `redeem_invite_code("BETA2026")` → 오늘 화면까지 휴대폰·PC 확인(실제 계정·운영 DB로는 안 해 봄).
- **설명서 8번 그림**: 미리보기 칸 안쪽 스크롤 때문에 고객 링크가 잘리던 것을 그림에서만 칸을 펼쳐 다시 찍음(750×838).
- **남은 판단**: 고객 화면 단계 규칙은 받을 자료가 남아 있으면 수정 기록이 있어도 '자료 받는 중'으로 보인다(체험 /demo/r에서 '시안 전' 문구와 '수정 완료 1회차'가 같이 보임). 같은 규칙이 DB 함수 `get_workspace_revision_view`에도 있어 바꾸려면 migration이 필요하다. 문의 메일은 아직 `studioyeolmae.com@gmail.com`(사용자 새 주소 yeolmae@studioyeolmae.com로 바꿀지 결정 필요).
- **운영 메모**: 배포용 깨끗한 main 폴더(`%TEMP%/ilgam-cloudflare-deploy-20261101`)에서 추적 파일 406개와 `.env.local`이 11-05~11-10 사이에 사라짐(오늘 작업 전부터). Windows 임시 폴더 정리로 추정. 다음 배포는 Temp 밖에 새 폴더를 받아서 쓴다.

### 2026-11-05 베타 코드 하나로 · PR #36 운영 배포
- **베타 코드**(PR #37, main `6190656`): 사용자 지시로 범용 `BETA2026` 하나만 쓴다. `KMONG2026`·`SOOMGO2026`은 사용 0회라 지우지 않고 `expires_at`으로 닫았다. migration `20261103170000_single_beta_code` 운영 적용 완료(16:41). 적용 뒤 운영 DB에서 `BETA2026`만 열림, 사용 1/500을 읽어 확인했다.
- migration 버전은 PR #21의 `20261104010000`보다 앞에 두려고 일부러 11-03으로 잡았다. `--include-all` 없이 올리기 위해서다.
- 앱의 로컬 모드 코드 목록 변경은 다음 앱 배포 때 나간다. 운영의 코드 확인은 서버 함수라 migration만으로 이미 적용됐다.
- 경로별 코드가 없어져서 어느 경로로 왔는지 코드로 구분할 수 없다. 코드 하나의 한도는 500명이다.
- **PR #36 운영 배포**: main `ccbd6e6`, Worker 버전 `1b00449d`. `check:release`·`cloudflare:production:check`·`smoke:remote` 통과. 시험 계정의 `?starter=` 왕복은 운영에서 안 해 봤다.

### 2026-11-05 벤치마킹 적용: 홈 첫 문구 · 업종별 예시 페이지 (PR #36, 브랜치 `claude/benchmark-apply`, origin/main `f0dad51` 기준, DB 변경 없음)

- **홈 첫 문구**: 고객 무가입 링크는 경쟁 서비스(모아로 등)에도 있어 앞세우지 않고, 주문 때 정한 포함 수정 횟수와 그 뒤 처리 기록을 앞세운다. 제목 3줄 "수정 몇 번까지였는지," / "다시 찾지" / "않아도 돼요.". 수정 횟수는 작업자가 '수정 완료'를 누를 때 1회 쓰고 회차가 남는다(`completeRevision`의 `sequence`, 일감 화면 'n회차').
- 제목이 어느 폭에서든 지정한 3줄로 나오게 `.heroLine`을 880px 이하에서도 줄 단위로 두고, 데스크톱 글자 크기를 `clamp(40px, 3.8vw, 54px)`로, 휴대폰 자간을 DESIGN.md 제목 토큰 `-.035em`으로 바꿨다. 휴대폰 크기 `clamp(38px, 10.8vw, 46px)`는 글꼴 정책 시험(`scripts/typography-policy.test.mjs`)이 고정한 값이라 그대로 두고, 그 값으로 첫 줄이 안 들어가는 360px 미만만 33px로 뒀다.
- **공개 페이지 `/examples`**(`src/components/industry-examples.tsx`): 데이터는 `INDUSTRY_ORDER`·`INDUSTRY_LABELS`·`INDUSTRY_STARTERS`만 쓴다. 업종별 패키지(이름·설명·예시 금액·기간·포함 수정·받을 자료), 옵션 묶음 '범위 밖·추가 작업은 이렇게 더해요', 버튼 '이 예시로 시작하기' → `/today?starter=<업종>`. 작업공간을 띄우지 않는 독립 경로이고(`standalone-routes.ts`, Sites 경로에도 추가) 사이트맵에 넣었다. 진입은 홈 히어로 아래 링크 1곳, 설명서 바닥글 1곳.
- **`/today?starter=<업종>`**(`src/lib/starter-link.ts`, `src/components/starter-link-notice.tsx`): 초대 링크와 같은 방식. 주소에서 바로 지우고 sessionStorage `ilgamcheck:pending-starter`에 Google 로그인 왕복 동안 보관한다. 오늘 화면이 작업공간을 다 불러온 뒤 한 번 꺼내, 일감 0건·누적 0건·손대지 않은 예시 패키지일 때만 업종 칩과 같은 `applyIndustryStarter`를 부른다. 일감이나 고친 패키지가 있으면 아무것도 안 바꾸고 짧게 안내한다. 잘못된 키는 조용히 버린다.
- hallmark 점검에서 나온 4곳도 같이 고쳤다(사용자 지시 '같이 고쳐'): 입력칸 테두리 새 토큰 `--field-line #7f8a96`(흰 면 3.5:1, 기존 1.46:1), 고객 화면 작은 글자 10~11px → 12~13px, 첫 화면 버튼 줄바꿈 금지(폭이 모자라면 버튼이 다음 줄로), 고객 화면 맨 위 '수정 요청 바로 남기기' 링크(실제 링크·체험 공통). 못 고친 지적: 첫 화면 미리보기 안 글자 9~10px, 가짜 브라우저 창, 'All rights reserved', 가운뎃점 링크 줄.
- 코드 리뷰 지적 반영: 로그아웃·계정 삭제 때 받아 둔 업종을 지운다, 잘못된 starter 값은 이전 값도 지운다, 실제 제공자로 돌리는 순서 시험(`starter-link-race.test.tsx`) 추가. 남긴 지적: 링크 자동 적용이 보관한 예시를 되살리는 경우, `/jobs?starter=`도 값을 받는 점, 안내 문구가 넓은 경우, 공개 페이지 점검 목록에 `/examples` 없음.
- 검증(로컬 모드): `npx tsc --noEmit` 0, 바꾼 파일 eslint 0, `npx vitest run --maxWorkers=3` 160파일 1343개 통과, `npm run build` 0. 홈·`/examples`·`/today?starter=design`을 375×812·1280×800에서 캡처해 가로 넘침 0·콘솔 오류 0(`qa-screenshots/benchmark-apply/`, git 제외). 실제 브라우저로 버튼 클릭 적용·새로 고침 재적용 없음·고친 패키지·실제 일감·잘못된 키도 확인했다.
- **미검증**: 진짜 Google 로그인 왕복과 로그인 상태의 적용. 가짜 Supabase 주소로 로그인 화면까지 값이 남는 것과 쿼리 없는 `/today`로 다시 들어와도 남는 것만 확인했고, 로그인 뒤 적용은 단위 시험(작업공간 흉내)뿐이다. 이 흉내 환경의 React #418은 starter 없는 `/today`에서도 똑같이 나서 이번 변경 때문이 아니다(서버는 로컬 모드로 그리고 브라우저만 로그인 모드로 바꾼 시험 환경 탓으로 추정).
- **안 고친 옛 문구**: 공유 이미지 `public/og/ilgamcheck-social.png`와 `scripts/build-social-card.mjs`에 옛 제목이 남아 있다(배경 원본 이미지가 저장소에 없어 다시 못 만듦). `PRODUCT.md` '카피 후보'도 그대로다. 검색 설명(`LANDING_DESCRIPTION`)은 '남은 수정 횟수를 한곳에서'라 새 문구와 충돌하지 않아 두었다. `public/llms.txt`에는 `/examples`를 넣지 않았다.

### 2026-11-04 약관 beta.4 · 그림 설명서 한 장씩 보기 (PR #34, main `8cbae5f` 병합·01:47 운영 배포 Worker `9abc1729`·migration `20261103160000` 적용)

- 사용자 결정(2026-11-03): 약관도 14일로, 개인정보처리방침 처리자 'OpenAI Sites'를 실제 호스팅 Cloudflare로 바로잡기, 예전에 동의한 계정엔 '약관이 바뀌었어요' 제목. 정책 버전 `2026-11-03-beta.4`(digest `sha256:893f6274…`).
- 배포 순서: 검사 통과 뒤 migration `20261103160000_policy_beta4_14_days` 먼저(01:46:03) → 곧바로 앱 배포(01:47:37). 틈 약 1분 30초 동안 새 가입자만 동의 저장이 막힐 수 있었다(기존 계정은 옛 앱 그대로). 원격 smoke 13개 PASS, health가 새 digest를 돌려준다.
- 운영 확인(2026-11-04 01:50): `/terms` 14일 5곳·30일 0, `/privacy` Cloudflare 14곳·OpenAI 0, 시험 계정 `/today`에 '약관이 바뀌었어요 · 베타 이용 코드 Pro 기간 14일 · 호스팅 사업자 Cloudflare로 표기'(동의 버튼은 누르지 않음 — 사용자가 직접), `/guide` '1 / 10'·다음 → `#step-2`.
- 그림 설명서(/guide): 사용자 지적("직관적이지 않아, 색 때문에 눈에 안 들어오고, 뒤로 갔다가 다음 장 눌러야 해서 불편") → 한 화면 한 단계(10단계), 진행 막대·큰 '다음'·밀기·←→ 키·`#step-n` 주소, 그림은 한 화면 안으로 잘라 다시 찍고 누를 곳은 주황 표시. '직접 해 보기'·장 목록 띠 제거, 시작·체험 버튼은 마지막 단계에만.
- 안드로이드 내부 시험용 APK는 옛 웹 화면(beta.3)을 담고 있어 그 앱으로 새로 가입하면 동의 저장이 안 된다. 앱 묶음을 다시 만들 때 함께 맞춘다.

### 2026-11-03 디자인 A · 외주 작업자 불편 고치기 묶음 (PR #33, main `12899b8` 병합·2026-11-04 00:28 운영 배포 Worker `5c3dfcc8`·migration `20261103120000`·`20261103150000` 적용)

- 사용자 지시 요지(2026-11-03): "외주작업자가 되었다는 느낌으로 불편사항을 해결", "돈 주고 사용할 이유를 만들어라", "사용설명서·흐름도", "화면 디자인도 신경써줘", "앱 외에 웹 디자인도", 레퍼런스(Mobbin·핀터레스트·디자인md·디자인 갤러리 100곳)에서 "우리 서비스에 찰떡인 디자인". 2차 멘토링(2026-11-05 16:30) 과제와 연결.
- **디자인 A '단정한 금융앱형'**: 세 방향(A 금융앱형·B 따뜻한 작업실·C 차분한 프로)을 실제 화면에 입혀 비교한 뒤 사용자가 고르기를 맡겨 A로 정했다. canvas `#f2f4f6` 위 흰 카드, 행동색 파랑 `#2563eb` 하나, 상태색은 지연·기다림·끝남에만(대비비 모두 4.5:1 이상). 기준은 `DESIGN.md`. 레퍼런스 조사 원본은 저장소 밖 Claude 세션 임시 폴더 `scratchpad/refs/group-A~E.md`(102곳 중 96곳 확인, 세션이 끝나면 사라질 수 있음), 비교 캡처는 `E:/ilgamcheck-work/ux-walk/.design-preview/sheets/`.
  - 앱: 오늘 화면 맨 위 '받을 돈' 카드(진행 중 금액 − 진행 중 수수료, 이번 달 완료는 따로, 처음부터 펼침), 일감 목록·오늘 줄 왼쪽 날짜 칸(D-day, 지연 빨강·2일 이내 주황), 상태 칩 통일(`lib/job-chips.ts`), 데스크톱 흰 사이드바 + canvas 본문, 고객 링크 화면 같은 토큰.
  - 웹: 첫 화면·설명서·약관·개인정보에 같은 토큰(강조 글자 파랑, 구획 canvas/흰색 번갈아, 마지막 가입 띠 연한 파랑). 설명서 맨 위 주 버튼은 '무료로 시작하기'. 설명서 그림 9장을 새 화면으로 다시 찍었다.
- **받은 곳별 떼이는 비율(수수료)**: - 설정 '받은 곳별 떼이는 비율'(크몽·숨고·소개·직접 문의·기타, 0~100·소수점 한 자리, 기본값 전부 비움). 새 일감을 만들 때 그 받은 곳 비율을 `Job.feeRate`로 남기고(받은 곳을 고치면 그때 비율로 다시 남김), `margin`(남는 돈)은 수수료까지 뺀 값이다. 예전 일감은 0으로 본다.
  - 새 일감 미리보기·아래 띠, 일감 화면 돈 카드, 월별 정리(합계·받은 곳별)에 '수수료 빼고 받는 돈'(비율 0이면 숨김). CSV는 '일감'·'패키지' 중복 열을 합치고 '추가요청 금액'·'수수료(원)'·'수수료 뺀 금액' 열을 더했다. 세금(원천징수)은 계산하지 않는다.
  - 저장: 작업공간 JSON 문서의 선택 칸 `Job.feeRate`·`AppSettings.feeRates`만 더했다. DB migration 없음(PGlite 시험 `supabase/tests/workspace_fee_fields.sql`).
- **고객 링크**: 완료된 일감은 '작업이 완료됐어요' 화면, 고객이 남긴 요청 상태(접수됨·반영됨·추가 작업 검토·반려), '자료 받는 중' 단계, 확인 대기가 남은 수정보다 많으면 안내. **DB migration `20261103120000_public_revision_status.sql`은 새 앱 배포 뒤에 운영에 적용한다(순서 중요).**
- **일감 화면**: '추가 작업으로'를 누르면 원문이 채워진 추가요청 초안이 열림, 추가 작업 요청엔 '수정 완료' 숨김, '추가 작업 안내'(금액·기간·진행할까요) 칩, 완료 뒤 '납품 안내' 칩이 맨 앞, 시작 카톡 문구 순서(받을 자료·질문 먼저), 체크리스트 날짜순, '남은 것만 문구 복사', 저장 중에도 고객 링크를 문구에 유지(문구 높이가 흔들려 화면이 22px 밀리던 문제).
- **패키지·새 일감·오늘**: 저장 안 한 패키지 변경 확인, 저장 알림을 저장 버튼 옆에, 금액 칸 쉼표, 착수 전 질문을 질문마다 칸으로, '보관'→'패키지 삭제·옵션 삭제'(보이는 이름만, 저장은 숨김 처리 그대로), 새 일감 받은 곳은 비워 두고 '지난번: 크몽' 힌트, 오늘 화면 일감별 한 줄·'자료 대기' 칸·체크 되돌리기, 사이드바 '새 일감'.
- **그 밖**: 베타 이용 코드 Pro 기간 30일→14일(`BETA_GRANT_DAYS`, migration `20261103150000_beta_grant_14_days.sql`), 계정 탈퇴 화면의 '그만두는 이유 설문' 제거, 웹 로그인 때 Google 계정 고르기 창을 항상 띄움, 설명서·첫 화면에 '주문 하나가 끝나기까지' 흐름도. **약관(정책 문서) 문구는 아직 30일**이다(정책 버전을 올리면 DB 함수·재동의가 따라와서 사용자 결정 대기).
- 검증(병합 전, 로컬 모드): `npx tsc --noEmit` 0, 바꾼 파일 eslint 0, `npx vitest run --maxWorkers=3` 155파일 1268개 통과, `npm run build` 0, 휴대폰 375·데스크톱 1280 실제 화면 캡처에서 가로 넘침 0·콘솔 오류 0(오늘·설명서, 앱 17화면, 공개 7화면 중 약관·개인정보의 기존 React #418 제외).

### 2026-11-03 HTML 에지 변형 막기 · 검색 등록 (PR #30, 2026-11-03 main `682442a` 병합·02:47 운영 배포 Worker `9d1bb21f`)

- 문제: 운영 주소의 HTML마다 Cloudflare Web Analytics 스크립트(`static.cloudflareinsights.com/beacon.min.js`, 토큰 `32918b1a…`)가 끼워져 CSP에 막히며 콘솔 오류를 남겼다. 우리 Cloudflare에는 끌 설정이 없었다: 도메인 RUM `off`, 계정 Web Analytics 사이트는 `yeolmaeapps.kr`뿐(토큰 다름), 감사 로그(2026-08-16부터)에 RUM 기록 없음. workers.dev, 옛 chatgpt.site, ChatGPT Sites에 남은 다른 주소(www·expat·home)에는 없다. 누가 넣는지는 확정하지 못했다.
- 조치(사용자 선택 "코드로 막기"): `wrangler.jsonc`의 `main`을 `custom-worker.ts`로 바꿨다. OpenNext 처리기를 감싸 HTML 응답에 `Cache-Control: no-transform`을 붙여 에지가 본문을 못 고치게 하고(Cloudflare 문서상 no-transform이면 분석 스크립트 자동 삽입과 에지 압축이 꺼짐), 압축은 Content-Encoding을 정해 Workers 런타임에 맡긴다(br 먼저, 그다음 gzip). 압축 방식은 에지가 바꿔 넘긴 Accept-Encoding이 아니라 브라우저가 보낸 원래 값(`request.cf.clientAcceptEncoding`)으로 고른다. 코드 `src/lib/security/html-delivery.ts`.
- 배포 뒤 운영 측정(headless Chromium·curl):
  - 공개 화면 5곳의 분석 스크립트가 1개씩 → 0개가 됐다.
  - `Cache-Control: s-maxage=31536000, no-transform`이 붙는다.
  - 압축은 br로 온다. gzip만 받으면 gzip, 압축을 안 받으면 압축 없이 온다.
  - 콘솔 오류는 합계 7개 → 2개가 됐다. 남은 2개는 `/privacy`·`/terms`의 React #418인데, workers.dev에서도 나는 앱 자체 문제라서 별도 세션이 고친다.
- 검색 등록: 구글 Search Console('URL 접두어', HTML 태그 확인, PR #29 `a5f53a9` 2026-11-02 운영 배포 Worker `3ce81d4a`)과 사이트맵 성공. Bing 웹마스터는 Search Console 가져오기로 일감체크 하나만 추가했고(2026-11-03) 사이트맵이 따라 들어와 처리 중이다. 네이버 서치어드바이저는 Claude 브라우저에서 안전 제한으로 막혀 사용자가 사이트를 등록했고(2026-11-03), 'HTML 태그' 값을 `SITE_VERIFICATION.other`의 `naver-site-verification`에 넣었다(PR #31, main `aeec2fd`, 2026-11-03 03:28 운영 배포 Worker `c13232ed`). 운영 첫 화면 HTML에 태그가 있는 것을 확인했다. '소유확인'과 사이트맵 제출은 사용자가 서치어드바이저에서 한다.
- Cloudflare 'Always Use HTTPS'를 켰다(2026-11-02, `http://` 요청이 301로 https 이동). 프록시하지 않는 다른 호스트는 영향 없다.

### 2026-11-02 작업 집중 묶음 A~D (PR #28, 2026-11-02 main `a918865` 병합·21:25 운영 배포 Worker `214d1e10`)

- 사용자 지시 요지(2026-11-02): "서비스 완성도 최고로 — 돈 내고 쓸 핵심 기능에 집중, 인터뷰 사항(세금·최소단가·클라이언트 소통) 반영, 외주 작업에만 집중, 흩어진 외주 통합, 사용설명서는 글보다 이미지 위주, 전부 진행". 설계 `docs/superpowers/specs/2026-11-02-work-focus-design.md`, 계획 `docs/superpowers/plans/2026-11-02-work-focus.md`. 조사 원본(시장·레퍼런스, 디자인 감사, SEO)은 저장소 밖 `E:/ilgamcheck-work/research-2026-11-02/`.
- 담은 것: `PRODUCT.md` '기능 상태'의 이 브랜치 항목(A 무기 3개 쉽게, B 받은 곳·상황별 보낼 말, C 한 건 최소 남길 돈 경고·월별 정리 CSV, D 그림 위주 설명서, 디자인 감사 꼭 고칠 것 10개, 시장조사 반영, 검색 노출 정리, 설문 띠 기간 말 빼기).
- 데이터: DB 변경·migration 없음. 작업공간 문서에 선택 칸 `Job.source`·`Job.completedAt`·`Job.startSharedAt`, `AppSettings.minMarginPerJob`을 더했다. 일감의 `startSharedAt`·`completedAt`은 두 기기가 따로 남기면 먼저 것으로 합치고, 그 밖은 기존 3갈래 합치기 그대로다.
- 검증(배포 전): 단위 시험 전체 통과, 로컬 모드 빌드로 실제 화면 측정(휴대폰·데스크톱 첫 화면 기준 12개 통과, 첫 카톡 문구까지 누르기 5번, 콘솔 오류 0), 리뷰 3갈래(Codex 읽기 전용·표준 축·스펙 축) 지적 반영. `check:release`·원격 smoke 결과는 PR 본문과 배포 기록에 적는다.
- 배포 뒤 할 일: 구글 폼 '써본 기능' 2개 추가, 구글·Bing 검색 등록, 'Always Use HTTPS'는 끝냈다(위 2026-11-03 항목). 남은 것: 카카오톡에서 고객 링크 공유 미리보기('수정 요청 링크') 실제 확인, 네이버 등록, 네이티브 앱의 CSV 내려받기 확인.

### 2026-11-02 MVP 무기 3개 고정 · 착수 전 질문 · 프로필 메뉴 (PR #27, 2026-11-02 main `e6b750f` 병합·09:26 운영 배포 Worker `22e58b24`)

- 사용자 결정: MVP는 무기 3개(주문 30초 등록 / 시작 안내 한 방 / 수정 범위 정리)로 고정하고 나머지는 콜드메일 첫 결과 전까지 동결. 근거는 `PRODUCT.md` 'MVP 무기 3개'·'기능 상태'.
- 착수 전 질문: 패키지마다 최대 5개(기본 3개 버튼). 일감에 복사되고, 작업자는 '답 받음' 체크·선택 메모만 한다. 아직 못 받은 자료·답 못 받은 질문은 '고객에게 보내기' 카톡 문구에 들어가고, 일감 화면에서 남은 것만 다시 보낼 문구를 복사할 수 있다. DB 변경 없음. 고객 링크에는 아직 질문을 안 보인다.
- 프로필 메뉴: 상단바 계정 표시를 누르면 계정·요금제·설정·로그아웃(설정과 같은 signOut)이 보인다.
- 역할 분담(사용자 2026-11-02): 서비스 개발·운영은 Claude, 서비스 밖 마케팅·홍보는 Codex. 운영 DB migration은 깨끗한 main에서 `npx --yes supabase db push --project-ref evhkpgxacpweelnmjmqh --skip-vault --dry-run --yes`로 대상 확인 뒤 `--dry-run`을 빼고 적용한다(`db reset`·`migration repair`·`--include-all` 금지).

### 2026-11-01 Cloudflare 운영 전환

- PR #23의 bootstrap 플래그 수정이 CI 통과 후 `main`에 병합됐다(`57a4eff`). 깨끗한 `main`에서 운영 Worker `ilgamcheck`를 생성하고 Supabase 서버 키를 Worker secret에만 등록했다. 가입 플래그를 켠 최종 배포 버전은 `7ce18edc-57ae-41d1-ad6c-2028584d545e`다.
- `studioyeolmae.com`의 예스닉 DNS 28개를 비공개 스테이션 기록과 대조해 Cloudflare로 옮겼다. 예스닉 네임서버를 `arvind.ns.cloudflare.com`·`violet.ns.cloudflare.com`으로 변경했고 Cloudflare zone 활성화를 확인했다. `ilgam`의 이전 Sites CNAME **한 건만** Cloudflare zone에서 제거하고 운영 Worker Custom Domain에 `ilgam.studioyeolmae.com`을 연결했다. 다른 Sites·Pages·Tistory·Daum MX 레코드는 유지했다.
- `npm run smoke:remote -- https://ilgam.studioyeolmae.com`이 health, 주요 경로, 보안 헤더, PWA 파일을 통과했다. Google 로그인은 기존 운영자 Google 계정으로 `/today` 복귀, 실시간 연결·저장됨, 누적 생성 1건을 확인했다. 포트폴리오·www·블로그·Pages 하위 주소와 Daum MX는 확인했다. `expat` 루트는 404여서 별도 확인이 필요하다. 전용 테스트 계정의 일감 생성·고객 요청 쓰기와 모바일 실기기는 아직 검증하지 않았다.
- 배포·DNS·롤백 절차와 남은 검증은 `docs/CLOUDFLARE-INDEPENDENT-DEPLOY.md` 참조. Cloudflare 대시보드에서 수동 배포가 아니라 저장소의 명령으로 Claude도 `main` 기준 재배포할 수 있다. 도메인 캐시는 리졸버별로 전파 시간이 다르다.

### 2026-11-01 수정 완료 때 차감·시작 전 받을 자료 (PR #26, 2026-11-02 main `7d4d063` 병합·운영 배포 Worker `8d411269`·migration `20261101140000` 적용 완료)

- 계기: 외주 경험자 대화(디스코드)와 Codex 인계(스테이션 `우편함/Codex→Claude/2026-11-01-2000-제품작업용-핵심인계.md`), 사용자 지시 "반영해서 소비자맞춤서비스로 만들어". 사용 검증 아님.
- **수정 횟수는 이제 작업자가 '수정 완료'를 누를 때 1회를 쓴다.** 고객 링크·수동 기록은 '확인 대기'로 들어오고, 작업자가 수정 완료·추가 작업으로·반려 중 하나를 고른다. 이미 고친 뒤 적는 수동 기록은 '수정 완료로 기록'. 되돌려도 추가 작업 요청을 저절로 포함 수정으로 바꾸지 않는다. 기존 `used` 기록은 그대로 둔다. 상세·결정 현황(D1~D9)은 `docs/design/revision-count-and-customer-link.md`.
- **시작 전 받을 자료:** 패키지에 목록(최대 10개)을 적으면 일감에 복사되고, 작업자가 받음을 체크하며, 아직 못 받은 것은 고객 링크에 이름만 보인다. 업종 예시 패키지에는 아직 넣지 않았다(예시 '손대지 않음' 판정이 바뀌는 문제 때문).
- 운영 DB: migration `20261101140000_revision_pending_and_intake.sql`(제출을 확인 대기로, 원장 `usage`에 `pending` 허용, 고객 조회 함수에 대기 건수·받을 자료 추가). **이 건은 새 앱을 먼저 배포하고 곧바로 migration을 적용한다**(옛 앱은 새 DB의 확인 대기 영수증을 '추가 작업'으로 잘못 안내함, 새 앱은 옛 DB와도 맞음). 배포 전에 열어 둔 고객 탭은 순서와 상관없이 migration 뒤 같은 오안내가 날 수 있다(데이터는 맞고, 새로 고치면 바로잡힘). DB 시험 `supabase/tests/revision_pending_submit.sql`(`node scripts/test-native-push-db.mjs`).
- 새 요청 웹 알림은 설계만 했다(`docs/design/new-request-notification.md`, 기존 푸시 대기열 재사용 제안). 외부 키 발급·운영 DB 변경이 필요해 사용자 승인 대기.
- 고객 링크·카톡 문구·랜딩·가이드·체험 화면·예시 데이터를 새 규칙으로 바꿨다. 가이드 그림을 다시 찍었다.
- 링크 열람은 기록되지 않는다. 실제 주문의 링크 사용은 스테이션 `과제/2-MVP/실측기록표-고객링크-2026-11-01.md`로 적고, 운영 숫자는 같은 폴더의 읽기 전용 집계 SQL로 본다.
- 보안·DB: '수정 완료'는 작업자 문서 저장 경로로 처리하고 버전 잠금·3갈래 합치기로 고객 제출과 겹쳐도 둘 다 살린다(시험 있음). 두 기기 동시 완료로 한도 초과·회차 중복이 새로 생기면 자동 저장을 멈추고, 큐에서 기다린 저장은 실행 시점 화면 상태를 보내 다른 기기의 완료를 되돌리지 않는다(링크 동기화·재시도 저장 실패 포함). '이 기기 편집으로 재시도'도 횟수 위반은 저장하지 않는다(실제 저장 큐 시험 있음). 기존 한계(미수정): 링크 토큰 원문이 작업공간 문서 JSON에 남음, 안 쓰는 옛 공개 제출 함수에 익명 실행 권한이 남음. 설계 문서 5절.

### 2026-11-01 Cloudflare Preview 검증 (운영 전환 전)

- `docs/CLOUDFLARE-INDEPENDENT-DEPLOY.md`와 `scripts/cloudflare-deploy.mjs`에 Claude도 실행할 수 있는 OpenNext→Cloudflare Worker Preview/운영 배포 경로를 추가했다. Preview와 production은 서로 다른 Worker 이름을 쓰며, 기본 명령은 배포 없는 dry-run이다. 운영 적용은 깨끗한 `main == origin/main`과 명시적 ACK를 요구한다.
- PR #22를 CI 통과 후 `main`에 병합했다(`5ff7eaa`). 별도 깨끗한 clone에서 `ilgamcheck-preview.bsfire1237.workers.dev` Worker를 실제 배포하고 서버 비밀키를 Preview Worker secret에만 등록했다. 가입 플래그를 켠 재배포 후 `/api/health`와 `npm run smoke:remote` 통과. Supabase Auth에 정확한 Preview `/today`·`/settings` 복귀 주소를 더했고 기존 Google 계정으로 Preview `/today` 복귀, 저장·실시간 연결 표시를 확인했다. 이 계정의 일감은 0건이라 일감 생성·고객 요청 저장까지 통과한 것은 아니다. 자체 도메인의 실제 호스트는 여전히 Sites다. 준비/이전/롤백 순서는 위 문서 참조.
- 운영 Worker 최초 생성에서 배포 스크립트가 가입 `false`와 `true`를 동시에 요구하는 모순을 발견했다. `codex/cloudflare-bootstrap-flag` 브랜치에서 회귀 테스트를 실패→통과로 고쳤다. PR·CI 통과 후 clean `main`에서만 운영 Worker를 만든다. 운영 secret 등록은 사용자 승인, DNS 전환은 전체 레코드 대조 후 승인 범위 안에서만 진행한다.
- `claude/guide-demo-link`는 PR #18로 병합 완료. #19·#20도 병합. 열린 #1·#17·#21 중 즉시 병합 대상은 없다. #21은 광고 동의의 과거 확인 링크 상태 안내가 최신 이력과 다를 수 있어 수정·재검증이 필요하다. 클로드 공유 우편함에 재현 순서를 전달했다.

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

### 벤치마킹 적용 배포 대기 (2026-11-05)

1. PR #36을 병합·운영 배포한다(사용자 지시 2026-11-05, `docs/CLOUDFLARE-INDEPENDENT-DEPLOY.md` 9번). DB migration은 없다.
2. 배포 뒤 시험 계정으로 `/examples` → '이 예시로 시작하기' → Google 로그인 → 약관·베타 관문 → `/today` 적용까지 실제로 확인한다(이번엔 미검증).
3. 사용자 결정 대기: 공유 이미지 옛 제목 교체(배경 원본 필요), `PRODUCT.md` 카피 후보·`llms.txt` 갱신 여부.

### 11-04 배포 뒤 남은 일

1. 운영 확인용 시험 계정의 시험 일감 보관 처리(사용자 결정 '보관'). Claude가 운영 데이터 쓰기를 하려다 자동 안전 검사에 막혀 못 했다 — 사용자가 직접 하거나 다음 세션에서 사용자 확인 뒤. 고객 링크 새 상태(접수됨·반영됨·완료 화면)는 운영 체험 화면과 운영 DB 함수(`get_workspace_revision_view`에 완료·요청 목록)로만 확인했고, 실제 고객 링크로 끝까지 눌러 보는 건 그때 같이 한다.
2. PR #21(베타 신청·동의): main 병합·충돌 해결 끝(`2a1a753`), migration 이름을 `20261104010000_beta_application_consent.sql`로 다시 바꿨다(운영에 11-03 migration이 먼저 들어가서). 병합은 정책 결정 대기. 병합 전에 또 새 migration이 운영에 들어가면 이름을 다시 최신 날짜로 바꿔야 한다(`--include-all` 금지).
3. 남은 다듬기: 시험 데이터 채우기 스크립트(`ux-walk/.design-preview/seed.mjs`)의 패키지 단계가 질문 칸 변경으로 멈춤, 휴대폰 '남은 것만 문구 복사'·되돌리기 글자 두 줄 꺾임, 일감 화면·새 일감의 어두운 하단 바는 디자인 A 전 색 그대로, 휴대폰 브라우저 상단 색(`layout.tsx` themeColor `#181d26`), 체험 화면 예시 데이터('자료 받는 중'인데 수정이 '반영됨'), `src/lib/domain/engine.ts` 린트 경고 2개.
4. 2차 멘토링(2026-11-05 16:30) 발표 덱 6개(과제별, claude.ai 비공개 — 사용자가 공유해야 멘토가 열 수 있음). 덱 1 숫자는 Codex가 명단 검토를 이어 가는 중이라 발표 직전에 최신 연속검토로 다시 맞춘다.

### 네이버 소유확인 마무리 (2026-11-03)

1. 네이버 태그는 운영에 나갔다(PR #31, Worker `c13232ed`). 사용자가 서치어드바이저에서 '소유확인'을 누르고 '요청 → 사이트맵 제출'에 `https://ilgam.studioyeolmae.com/sitemap.xml`을 넣었는지 확인해 기록한다. `SITE_VERIFICATION`의 값을 지우면 구글·네이버 소유확인이 풀릴 수 있으니 지우지 않는다.
2. 분석 스크립트를 막은 방식(`custom-worker.ts`, PR #30)을 되돌릴 때는 `wrangler.jsonc`의 `main`을 `.open-next/worker.js`로 바꿔 배포한다. 그러면 스크립트가 다시 끼워질 수 있다.
3. 사람 확인이 남은 것: 카카오톡 공유 미리보기, 옛 chatgpt.site·workers.dev 주소 정리 여부(사용자 결정).

### Cloudflare 호스팅 독립 전환

1. 운영 Worker와 대표 도메인 전환은 완료됐다. 다음 제품 배포는 `docs/CLOUDFLARE-INDEPENDENT-DEPLOY.md` 9번 절차를 사용한다. PR 검사·리뷰 후 깨끗한 `main`에서 배포하고 원격 smoke와 사용자 흐름을 확인한다. GPT Sites에 다시 push하지 않는다.
2. 전용 테스트 계정으로 일감 등록·고객 수정 요청·재로그인 쓰기 흐름을 검증한다. PR #21 기능의 DB/정책 게이트는 별도 처리한다. 실제 사용자 데이터에 시험 레코드를 남기지 않는다.
3. 모바일 앱 딥링크·공개 링크를 Android 실기기에서 확인한다. 도메인 캐시 전파와 다른 호스트·Daum 메일의 운영 상태를 재점검한다. `expat` 루트 404는 DNS 레코드가 같아도 서비스 자체 상태를 확인해야 한다.

### 수정 횟수 차감 시점·고객 링크 실측 (2026-11-01)

1. '수정 완료 때 차감'(D1)은 브랜치에 구현됐다. 병합·운영 반영은 사용자 승인 뒤 **새 앱 배포 → 곧바로 migration `20261101140000`** 순서로 한다(migration 머리말 참고). 사용자 결정(2026-11-02): 운영 전체 흐름 검증(새 시험 계정으로 일감 → 링크 → 다른 브라우저에서 고객 제출 → 작업자 '수정 완료')은 **이 배포와 migration 뒤에** 한다. 그 가입은 11월 KR1 가입 수에서 뺀다. 남은 결정 D3(라운드 묶기)·D8(합의 범위 표시)·D9(수락 표시)는 설계 문서 3절.
2. 새 요청 웹 알림: `docs/design/new-request-notification.md`의 A안(기존 푸시 대기열 재사용)으로 갈지 사용자 결정, 외부 키 발급은 사용자 계정 작업.
3. 다음 실제 주문에서 실측 기록표를 채운다. 고객이 링크를 안 써서 재설명·재입력이 늘면 가설 실패로 보고 고객 경로를 다시 정한다. 인터뷰 반응은 사용 검증으로 세지 않는다.

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
