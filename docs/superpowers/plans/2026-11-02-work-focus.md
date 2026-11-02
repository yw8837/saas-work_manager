# 작업에만 집중 — 구현 계획

> **에이전트 작업자에게:** 이 계획은 superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans로 작업 하나씩 수행한다. 단계는 체크박스(`- [ ]`)로 표시한다.

**목표:** 처음 쓰는 제작자가 무기 3개(주문 30초 등록·시작 안내 한 방·수정 범위 정리)를 바로 보고 쓰게 하고, 받은 곳 표시·상황별 카톡 문구·최소 기준 경고·월별 매출 정리를 가볍게 더하고, 사용설명서를 그림 위주로 바꾼다.

**구조:** 모두 클라이언트 쪽 변경이다. 작업공간 JSON 문서에 선택 칸 3개(`Job.source`, `Job.completedAt`, `AppSettings.minMarginPerJob`)를 더하고(받은 곳 기본값은 설정 칸 없이 최근 일감에서 계산), 순수 함수(문구·합계·CSV)는 `src/lib`에 두고 화면은 기존 컴포넌트에 붙인다. DB migration과 고객 공개 경로 변경은 없다.

**기술:** Next.js 16 app router + Vite Sites 빌드, React, TypeScript, Vitest(jsdom), Playwright, sharp.

**설계 문서:** `docs/superpowers/specs/2026-11-02-work-focus-design.md` (항목 번호 A1~D는 이 문서 4절)

## 전체 제약

- 작업 폴더 `E:/ilgamcheck-work/brief-questions`, 브랜치 `claude/work-focus`. 메인 앱 폴더 `D:/SaaS/01_일감체크/app`은 건드리지 않는다. `.env.local`을 만들거나 복사하지 않는다. Docker 금지.
- 메모리가 적다. 단위 시험은 `npx vitest run <파일들> --pool=threads --maxWorkers=1`로 바뀐 파일만 돌린다. 무거운 명령(빌드·E2E·`check:release`)을 두 개 겹쳐 돌리지 않는다.
- 화면 글은 쉬운 한국어. 화면 글에 `Todo`·`합성`·`Hosted:`·`알림 큐`·`타임라인`·`상대 기한`을 쓰지 않는다(코드 이름·주석은 그대로 둬도 됨).
- 고객에게 가는 것(카톡 문구, 고객 링크 화면·서버 함수)에는 금액·원가·남는 돈·받은 곳·작업자 연락처를 넣지 않는다.
- 새 칸은 모두 선택 칸이다. 예전 저장본(칸 없음)이 그대로 열려야 한다.
- 작업 화면 색: 체리색(주의 토큰)은 경고·지연·오류에만. 휴대폰 터치 영역 44px 이상. 토큰은 `DESIGN.md`.
- 커밋 메시지는 한국어, 끝에 빈 줄 뒤 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. 파일은 `git add <경로>`로만 올린다(`.walkthrough/`, `.serena/`는 올리지 않음).
- 기존 시험이 바뀐 화면 글 때문에 깨지면, 이 계획의 새 문구에 맞게 기대값을 고친다. 기능 의미가 바뀌는 기대값은 고치지 말고 멈춰서 보고한다.

## 검토 초점 (시험이 놓치기 쉬운 것)

1. 예전 저장본: `source`·`completedAt`·`minMarginPerJob`가 없는 작업공간이 오늘·일감·월별 정리에서 깨지지 않고, 예전 완료 일감은 월별 정리에서 `updatedAt` 기준 + "완료 시각 기록 전" 표시로 들어간다. → 작업 8 시험 `예전 완료 일감은 마지막 수정 시각으로 넣고 추정 표시`.
2. 달 경계와 시간대: 11/30 23:30(서울)에 완료한 일감은 11월, 12/1 00:10(서울)은 12월. CI는 UTC라 시스템 시간대에 기대면 안 된다. → 작업 8 시험 `달 경계는 넘겨받은 시간대로 나눈다`.
3. CSV에 쉼표·따옴표·줄바꿈·`=`로 시작하는 고객 이름: 칸이 깨지거나 엑셀에서 수식으로 실행되면 안 된다. → 작업 8 시험 `CSV는 따옴표로 감싸고 수식 시작 문자를 무력화한다`.
4. 링크가 꺼졌거나 저장 중일 때와 남은 수정 0회일 때의 문구: 링크 줄을 빼고, "1회씩 세요"를 쓰지 않는다. → 작업 4 시험 `링크가 없으면 링크 줄을 빼고 남은 수정 0회면 횟수 안내를 바꾼다`.
5. 두 기기에서 동시에 고칠 때 받은 곳: 한쪽만 바꾼 `source`가 병합 뒤 남는다. → 작업 6 시험 `다른 기기에서 바꾼 받은 곳이 병합 뒤 남는다`.

---

### 작업 1: 업종 예시 패키지에 받을 자료·착수 질문 기본값 (A1)

**파일:**
- 수정: `src/lib/store/industry-starters.ts`, `src/lib/store/seed.ts`(웹 예시 `seedPackages`)
- 시험: `src/lib/store/industry-starters.test.ts`

**인터페이스:**
- 사용: `DEFAULT_BRIEF_QUESTIONS`(`src/lib/domain/engine.ts`), `INDUSTRY_ORDER`, `INDUSTRY_STARTERS`
- 내놓음: `export const INDUSTRY_INTAKE_ITEMS: Record<Industry, string[]>` (`industry-starters.ts`)

- [ ] **1단계: 실패하는 시험 쓰기** — `모든 업종 예시 패키지는 업종별 받을 자료와 기본 질문 3개를 갖는다`

```ts
for (const industry of INDUSTRY_ORDER) {
  for (const item of INDUSTRY_STARTERS[industry].packages) {
    expect(item.intakeItems).toEqual(INDUSTRY_INTAKE_ITEMS[industry]);
    expect(item.briefQuestions).toEqual(DEFAULT_BRIEF_QUESTIONS);
  }
}
expect(INDUSTRY_INTAKE_ITEMS).toEqual({
  web: ["로고 파일(있으면)", "가게·회사 소개 글", "넣을 사진", "참고하고 싶은 사이트 주소"],
  design: ["가게·브랜드 이름(한글·영문)", "참고 이미지", "원하는 색이나 분위기"],
  video: ["원본 영상 파일", "넣을 자막·문구", "원하는 배경음악(있으면)"],
  photo: ["촬영 장소 주소", "촬영 날짜·시간 후보", "꼭 찍을 장면"],
});
```

- [ ] **2단계: 실패 확인** — `npx vitest run src/lib/store/industry-starters.test.ts --pool=threads --maxWorkers=1` → FAIL(`INDUSTRY_INTAKE_ITEMS` 없음)
- [ ] **3단계: 구현** — 상수를 만들고 4개 업종의 모든 예시 패키지(`seedPackages` 포함)에 `intakeItems`와 `briefQuestions: [...DEFAULT_BRIEF_QUESTIONS]`를 넣는다. 저장된 사용자 패키지를 고치는 이전(migration) 코드는 만들지 않는다.
- [ ] **4단계: 통과 확인** — 같은 명령 PASS. 이어서 예시 데이터에 기대는 시험을 돌린다: `npx vitest run src/lib src/components --pool=threads --maxWorkers=1`. 시드 일감에 질문·자료가 생겨 깨진 기대값만 새 기본값에 맞게 고친다.
- [ ] **5단계: 커밋** — `feat: 업종 예시 패키지에 받을 자료와 착수 전 질문 기본값을 넣음`

### 작업 2: 저장 직후 안내 — 주 버튼은 카톡 문구, 미리보기는 펼침 (A2)

**파일:**
- 수정: `src/components/send-to-client-banner.tsx`, `src/styles/theme.css`
- 시험: `src/components/send-to-client-banner.test.tsx`, `e2e/renewal-first-send.spec.ts`

- [ ] **1단계: 실패하는 시험** — `주 버튼은 카톡 문구 복사이고 문구 미리보기가 처음부터 보인다`
  - `screen.getByTestId("send-copy-message")`의 class에 `primaryButton`, 글 `카톡 문구 복사`
  - `send-copy-link`의 글 `링크만 복사`, class에 `secondaryButton`
  - `screen.getByTestId("send-message-preview")`가 보이고(접기 없음) 인사와 링크를 담는다. `<details>`가 없다.
- [ ] **2단계: 실패 확인** — `npx vitest run src/components/send-to-client-banner.test.tsx --pool=threads --maxWorkers=1` → FAIL
- [ ] **3단계: 구현** — 버튼 순서: 카톡 문구 복사(주) → 링크만 복사 → 고객 화면 미리보기. 미리보기는 버튼 아래 말풍선 모양 `<div data-testid="send-message-preview">`(줄바꿈 유지, 최대 높이 넘으면 안에서 스크롤). 복사 막힘 처리·로컬 모드 안내·`markFirstRun("linkShared")`는 그대로.
- [ ] **4단계: E2E 기대값 고치기** — `renewal-first-send.spec.ts` 첫 시험: 휴대폰 첫 화면 안에 들어야 하는 버튼을 `send-copy-message`로 바꾸고, 링크 복사 문구 기대값을 `링크만 복사` 흐름에 맞춘다.
- [ ] **5단계: 통과 확인** — 단위 시험 PASS(E2E는 작업 10에서 한꺼번에).
- [ ] **6단계: 커밋** — `feat: 저장 직후 안내의 주 버튼을 카톡 문구 복사로 바꾸고 문구를 펼쳐 보여 줌`

### 작업 3: 제목 반복 줄이기 · 띄어쓰기 · 설명서 가는 길 (A6, A8, A9)

**파일:**
- 만듦: `src/lib/domain/job-title.ts`, 시험 `src/lib/domain/job-title.test.ts`
- 수정: `src/lib/domain/index.ts`(내보내기), `src/components/job-detail.tsx`(제목 아래 줄·배너 title·스냅샷 띄어쓰기), `src/components/jobs-overview.tsx`, `src/components/today-dashboard.tsx`, `src/components/profile-menu.tsx`
- 시험: `src/components/profile-menu.test.tsx`

**인터페이스:**
- 내놓음: `export function displayJobTitle(job: Pick<Job, "title" | "clientLabel">): string`

- [ ] **1단계: 실패하는 시험** — `job-title.test.ts`
  - `displayJobTitle({ clientLabel: "카페 모라", title: "카페 모라 · Basic 홈페이지" })` → `"Basic 홈페이지"`
  - 앞뒤 공백이 있는 고객 이름도 뗀다: `clientLabel: " 카페 모라 "` → `"Basic 홈페이지"`
  - 사용자가 바꾼 제목은 그대로: `title: "메뉴판 리뉴얼"` → `"메뉴판 리뉴얼"`
  - 떼면 비는 경우 원래 제목: `title: "카페 모라 · "` → `"카페 모라 · "`
  - `profile-menu.test.tsx`: 메뉴 안에 `사용설명서` 링크(`data-testid="profile-guide"`, `href="/guide"`)
- [ ] **2단계: 실패 확인** — `npx vitest run src/lib/domain/job-title.test.ts src/components/profile-menu.test.tsx --pool=threads --maxWorkers=1` → FAIL
- [ ] **3단계: 구현** — 고객 이름이 바로 옆에 보이는 곳(일감 화면 제목 아래 줄, 일감 목록 줄, 오늘 화면 줄)과 `SendToClientBanner`·카톡 문구의 `title`에 `displayJobTitle(job)`을 쓴다. 고객 링크 화면(서버가 내려 주는 제목)은 바꾸지 않는다. 스냅샷 구획의 패키지 이름과 "추가 옵션 없음" 사이를 띄운다. 프로필 메뉴의 설정 링크 위에 사용설명서 링크를 넣는다.
- [ ] **4단계: 통과 확인** — 위 명령 PASS + `npx vitest run src/components --pool=threads --maxWorkers=1`
- [ ] **5단계: 커밋** — `feat: 고객 이름이 겹쳐 보이는 일감 제목을 줄이고 프로필 메뉴에 사용설명서를 넣음`

### 작업 3.5: 작업 1~3 보완 (작업 1~3 보고에서 남은 것)

**파일:** `src/components/send-to-client-banner.tsx`(+시험), `src/components/native-offline-workspace.tsx`(+시험), `src/lib/store/industry-starters.ts`(+시험)

- [ ] **1단계: 실패하는 시험**
  - `카톡 문구 복사가 막히면 문구 글을 선택해 둔다`: 클립보드가 막힌 상태에서 `send-copy-message`를 누르면 링크 칸이 아니라 문구 글상자(`send-message-text`, 읽기 전용)가 보이고 선택돼 있다. `send-copy-link` 실패 때는 지금처럼 링크 칸을 선택한다.
  - 오프라인 화면 일감 줄도 `displayJobTitle`을 쓴다(고객 이름 아래 같은 이름이 또 보이지 않음).
  - `예전 예시만 있는 빈 작업공간에서 같은 업종을 다시 고르면 새 기본값으로 바뀐다`: 받을 자료·질문이 없는 옛 웹 예시 3개만 있는 일감 0건 상태에서 `applyIndustryStarter("web")` 결과 패키지에 `intakeItems`·`briefQuestions`가 있다. 사용자가 고친 패키지는 그대로 둔다(기존 시험 유지).
- [ ] **2단계: 실패 확인 → 3단계: 구현 → 4단계: 통과 확인** — `npx vitest run <위 시험 파일> --pool=threads --maxWorkers=1`
- [ ] **5단계: 커밋** — `fix: 카톡 문구 복사가 막히면 문구를 선택해 두고, 옛 예시를 다시 고르면 새 기본값을 넣음`

### 작업 4: '고객에게 보낼 말'(상황별 문구) + 새 요청 띠 (A3, A4, B2)

**파일:**
- 만듦: `src/lib/client-messages.ts`, `src/lib/client-messages.test.ts`, `src/components/client-messages.tsx`, `src/components/client-messages.test.tsx`
- 수정: `src/components/job-detail.tsx`, `src/components/start-checklist.tsx`(다시 보내기 복사 블록 제거), `src/styles/theme.css`
- 시험 수정: `src/components/start-checklist.test.tsx`, `src/components/job-detail-send-banner.test.tsx`, `src/components/job-detail.test.tsx`

**인터페이스:**
- 사용: `clientShareMessage`, `startReminderMessage`(`client-share.ts`), `pendingIntakeLabels`, `pendingBriefQuestions`, `getRevisionSummary`, `displayJobTitle`(작업 3)
- 내놓음(`client-messages.ts`):
  - `export type MessageSituation = "revision-done" | "remaining" | "waiting" | "review" | "start" | "out-of-scope" | "delivery"`
  - `export const SITUATION_LABELS: Record<MessageSituation, string>` = 수정 반영 알림 / 남은 것 요청 / 답 기다림 / 시안 확인 부탁 / 시작 안내 / 범위 밖 안내 / 납품 안내
  - `export function availableSituations(job: Job, today: string): MessageSituation[]` — `today`는 `YYYY-MM-DD`(`localToday()`), 위 순서대로 조건에 맞는 것만
  - `export function situationMessage(situation: MessageSituation, input: { job: Job; link: string | null }): string`
- 내놓음(컴포넌트): `export function ClientMessages(props: { job: Job; link: string | null; today: string }): JSX.Element | null`

상황 조건(설계 B2 순서):
- `revision-done`: `usage === "used"`이고 `completedAt`의 로컬 날짜가 `today`인 수정이 있다
- `remaining`: 일감이 진행 중이고 `pendingIntakeLabels(job)` 또는 `pendingBriefQuestions(job)`가 비어 있지 않다
- `waiting`: 진행 중이고 `status === "waiting"`인 할 일이 있다
- `review`, `start`: 진행 중이면 늘
- `out-of-scope`: `usage === "extra_scope"`인 수정이나 `status === "draft"`인 추가요청이 있다
- `delivery`: 일감이 완료됐거나, 취소 아닌 할 일이 모두 완료다

문구: 설계 B2 초안의 뜻 그대로. `start` = `clientShareMessage`(제목은 `displayJobTitle`), `remaining` = `startReminderMessage`. 링크가 `null`이면 링크 줄을 빼고 "링크" 언급 문장도 "이 대화로" 문장으로 바꾼다. 남은 수정이 0회면 "1회씩 세요"·"링크에 남겨 주세요" 대신 "다음 요청부터는 추가 작업으로 따로 말씀드릴게요."

- [ ] **1단계: 실패하는 시험** — `client-messages.test.ts`
  - `상태에 맞는 상황만 우선순위대로 나온다`: 오늘 수정 완료 + 못 받은 자료 + 대기 할 일이 있는 일감 → `["revision-done","remaining","waiting","review","start"]`; 완료 일감 → `["delivery"]`(범위 밖이 있으면 `["out-of-scope","delivery"]`)
  - `어떤 문구에도 금액·원가가 들어가지 않는다`: `amount: 790000`, `estimatedCost: 95000`인 일감으로 7개 문구를 만들어 `/\d{1,3}(,\d{3})*원|₩/`이 없다(받은 곳 확인은 작업 6)
  - `링크가 없으면 링크 줄을 빼고 남은 수정 0회면 횟수 안내를 바꾼다`
  - `client-messages.test.tsx`: 첫 칩이 골라져 있고(`aria-pressed="true"`), 칩을 누르면 미리보기(`client-message-preview`)가 바뀌고, `client-message-copy`가 클립보드에 미리보기 글을 쓰고, 클립보드가 막히면 `client-message-text`(읽기 전용 글상자)가 보인다
  - `job-detail.test.tsx`: 확인 대기 요청이 있으면 `pending-request-strip`이 제목 아래에 "고객 요청 1건이 확인을 기다려요"와 `href="#revisions"` 링크를 보이고, 없으면 없다
- [ ] **2단계: 실패 확인** — `npx vitest run src/lib/client-messages.test.ts src/components/client-messages.test.tsx src/components/job-detail.test.tsx --pool=threads --maxWorkers=1` → FAIL
- [ ] **3단계: 구현** — 일감 화면: 제목 바로 아래에 새 요청 띠, 핵심 정보 줄 다음(할 일 목록 위)에 `<ClientMessages>`. 링크·준비 여부는 저장 직후 안내와 같은 계산을 쓴다(준비 안 됐으면 `link=null`). 착수 전 질문 구획의 다시 보내기 복사 블록은 지우고, 그 시험은 `ClientMessages`의 `남은 것 요청` 칩 시험으로 옮긴다.
- [ ] **4단계: 오늘 화면 '우선 처리'에 요청 줄** — 지금 '우선 처리'는 마감된 할 일만 모으고(`today-dashboard.tsx` 109~119줄), 요청은 맨 위 알림 한 줄에만 나온다. 시험 `확인 대기 요청이 우선 처리에 보인다`(`today-dashboard.test.tsx`): 확인 대기 요청 1건이 있는 일감이면 '우선 처리'에 `today-pending-request-${jobId}` 줄이 "고객 요청 1건 확인 대기"로 보이고, 이 줄은 체크 버튼이 없고 `href="/jobs/${jobId}#revisions"` 링크다. 할 일 줄의 체크 동작은 그대로. 실패 확인 → 구현 → 통과.
- [ ] **5단계: 통과 확인** — 2단계 명령 + `npx vitest run src/components --pool=threads --maxWorkers=1` PASS
- [ ] **6단계: 커밋** — `feat: 일감 화면에 상황별 고객 안내 문구와 새 요청 띠를 넣음`

### 작업 5: 쉬운 말 · 긴 설명 줄이기 (A5, A7)

**파일:** `src/components/job-detail.tsx`, `src/components/new-job-form.tsx`, `src/components/package-manager.tsx`, `src/components/settings-panel.tsx`, `src/components/workspace-provider.tsx`(화면에 보이는 오류 문구), `src/lib/domain/engine.ts`(화면에 보이는 오류 문구), `src/components/marketing-home.tsx`, 관련 시험

- [ ] **1단계: 실패하는 시험** — 새 일감 아래 띠가 `할 일 5개`를 보인다(`new-job-form.test.tsx`), 패키지 편집에 `할 일 추가` 버튼과 `시작 며칠 뒤` 머리글이 있다, 일감 화면 핵심 정보에 `남는 돈(예상)`·`남는 비율`이 있다(`job-detail.test.tsx`)
- [ ] **2단계: 실패 확인** — 해당 시험 FAIL
- [ ] **3단계: 구현** — 설계 A5 표대로 바꾼다. 일감 화면 옆 구획(A7):
  - 남은 수정 구획: 확인 대기 줄은 두고, 긴 문장은 접기 하나 `수정 횟수는 이렇게 세요`로 모은다. 접기 안: "고객 요청은 먼저 확인 대기로 들어와요. 고친 뒤 '수정 완료'를 누르면 1회를 써요. 질문·중복은 '반려', 범위 밖은 '추가 작업으로'를 눌러요. 둘 다 횟수를 안 써요."
  - 고객 링크 구획: 긴 설명 문단을 지운다(위 접기로 옮김). 아래 작은 글은 hosted면 "저장이 끝나면 링크에 반영돼요. 재발급하면 이전 주소는 못 써요.", 로컬 모드 문장은 그대로.
  - 추가요청 설명: "초안으로 적어 두고, 고객이 동의하면 확정해요. 확정하면 금액·마감·할 일에 반영돼요."
- [ ] **4단계: 화면 글 검사** — 아래 명령의 출력이 주석·식별자만 남아야 한다(화면 글 0곳):
  `rg -n "Todo|합성|Hosted:|알림 큐|타임라인|상대 기한" src/components src/app src/lib --glob '!*.test.*'`
- [ ] **5단계: 통과 확인** — `npx vitest run src/components src/lib --pool=threads --maxWorkers=1` PASS(바뀐 문구 기대값은 새 문구로)
- [ ] **6단계: 커밋** — `refactor: 화면의 어려운 말과 영어를 쉬운 말로 바꾸고 일감 화면 설명을 줄임`

### 작업 6: 받은 곳(수주처) (B1)

**파일:**
- 만듦: `src/lib/domain/order-source.ts`, `src/lib/domain/order-source.test.ts`
- 수정: `src/lib/domain/types.ts`, `src/lib/domain/engine.ts`(`composeJob`), `src/lib/domain/index.ts`, `src/components/workspace-provider.tsx`, `src/components/new-job-form.tsx`, `src/components/job-detail.tsx`, `src/components/jobs-overview.tsx`, `src/lib/jobs-list-location.ts`, `src/components/today-dashboard.tsx`
- 시험: `src/components/new-job-form.test.tsx`, `src/components/jobs-overview.test.tsx`, `src/components/workspace-provider.test.ts`

**인터페이스:**
- 내놓음:
  - `types.ts`: `export type OrderSource = "kmong" | "soomgo" | "referral" | "direct" | "other"`, `Job.source?: OrderSource`, `ComposeJobInput.source?: OrderSource`
  - `order-source.ts`: `ORDER_SOURCES: OrderSource[]`(위 순서), `ORDER_SOURCE_LABELS: Record<OrderSource, string>` = 크몽 / 숨고 / 소개 / 직접 문의 / 기타, `normalizeOrderSource(value: unknown): OrderSource | undefined`, `setJobSource(job: Job, source: OrderSource | undefined, now?: string): Job`(없애면 칸 자체를 지움, `updatedAt` 갱신), `latestOrderSource(jobs: Job[]): OrderSource | undefined`(받은 곳이 있는 일감 중 `createdAt`이 가장 늦은 것의 값)
  - 설정 칸은 만들지 않는다(두 기기에서 서로 다르게 바뀌면 설정 충돌로 자동 병합이 멈춤 — 빌더 체크).
  - 제공자: `CreateJobInput.source?: OrderSource`, 새 동작 `setJobSource: (jobId: string, source: OrderSource | undefined) => void` — **완료한 일감에서도 허용**(다른 동작은 완료 일감을 막지만 받은 곳은 고객 링크·횟수와 상관없음)
  - `jobs-list-location.ts`: `JobListLocation.source?: OrderSource`(주소 `?source=kmong`)

- [ ] **1단계: 실패하는 시험**
  - `order-source.test.ts`: 이상한 값은 `undefined`, `setJobSource(job, undefined)`면 `"source" in job === false`
  - `composeJob`에 `source: "soomgo"`를 주면 일감에 남는다(`engine` 시험 파일에 추가)
  - `order-source.test.ts`: `latestOrderSource`는 받은 곳 없는 일감을 건너뛰고 `createdAt`이 가장 늦은 일감의 값을 준다, 일감이 없으면 `undefined`
  - `new-job-form.test.tsx`: 가장 최근 일감이 `source: "kmong"`이면 `order-source-kmong`이 처음부터 골라져 있다(`aria-checked="true"`), 다시 누르면 풀린다, 고르지 않아도 만들 수 있다
  - 완료한 일감에서도 `setJobSource`가 받은 곳을 바꾼다(제공자 시험)
  - `jobs-overview.test.tsx`: 받은 곳이 두 군데 이상이면 `source-filter-kmong`(글 `크몽 2`)이 보이고 누르면 크몽 일감만 남는다. 한 군데뿐이면 거르기 줄이 없다. 검색어 `숨고`로도 걸린다
  - `client-messages.test.ts`에 추가: `받은 곳 이름은 고객 문구에 안 나간다` — `source: "kmong"`인 일감의 7개 문구와 `clientShareMessage` 결과에 `크몽`이 없다
  - `workspace-provider.test.ts`: `다른 기기에서 바꾼 받은 곳이 병합 뒤 남는다` — base·local에 `source` 없음, remote에 `"referral"` → `mergeConcurrentWorkspaceState` 결과 일감 `source === "referral"`
- [ ] **2단계: 실패 확인** — 해당 시험 FAIL
- [ ] **3단계: 구현** — 새 일감: 1번(고객 이름) 카드 안 칩 한 줄 "어디서 받은 주문이에요? (선택)", `role="radiogroup"`, 칩은 `role="radio"`. 일감 화면: 제목 위 작은 표시 `job-source`, 눌러서 바꾸거나 지우는 데 두 번 안. 일감 목록 줄 `job-row-source-${job.id}`, 오늘 화면 줄에 작은 표시. 카톡 문구·고객 링크에는 안 넣는다.
- [ ] **4단계: 통과 확인** — 해당 시험 + `npx vitest run src/lib src/components --pool=threads --maxWorkers=1` PASS
- [ ] **5단계: 커밋** — `feat: 일감마다 받은 곳(크몽·숨고·소개 등)을 표시하고 목록에서 모아 봄`

### 작업 7: 최소 남길 돈 경고 (C1)

**파일:**
- 만듦: `src/lib/domain/margin-floor.ts`, `src/lib/domain/margin-floor.test.ts`
- 수정: `src/lib/store/seed.ts`(`AppSettings.minMarginPerJob?: number`), `src/components/package-manager.tsx`, `src/components/new-job-form.tsx`, `src/components/job-detail.tsx`
- 시험: 패키지 화면 시험(없으면 `src/components/package-manager.test.tsx` 만듦), `new-job-form.test.tsx`, `job-detail.test.tsx`

**인터페이스:**
- 내놓음: `marginShortfall(margin: number, floor: number | undefined): number | null`(기준이 0보다 크고 남는 돈이 적을 때만 차이), `parseFloorInput(value: string): number | undefined`(숫자·쉼표만, 빈칸은 `undefined`, 0~1,000,000,000)

- [ ] **1단계: 실패하는 시험**
  - `marginShortfall(695000, undefined) === null`, `(695000, 0) === null`, `(695000, 700000) === 5000`, `(-10000, 50000) === 60000`
  - `parseFloorInput("300,000") === 300000`, `("") === undefined`, `("abc") === undefined`, `("-1") === undefined`
  - 패키지 화면: 기준이 없으면 경고가 없다. 기준 `700000`이면 `package-margin-warning-<id>` "남는 돈 695,000원 · 내 기준보다 5,000원 적어요"
  - 새 일감 아래 띠 `preview-margin-warning`, 일감 화면 `job-margin-warning`이 같은 조건에서만 보인다
- [ ] **2단계: 실패 확인** — FAIL
- [ ] **3단계: 구현** — 패키지 화면 맨 위 한 줄 입력 `min-margin-input`("한 건에 최소 남길 돈", 안내 "비우면 경고하지 않아요"). 경고는 주의색 글 한 줄, 저장은 막지 않는다. 시세·권장가 문구는 쓰지 않는다.
- [ ] **4단계: 통과 확인** — PASS
- [ ] **5단계: 커밋** — `feat: 한 건에 최소 남길 돈을 정하면 덜 남는 패키지와 주문을 한 줄로 알려 줌`

### 작업 8: 월별 정리와 CSV (C2)

**파일:**
- 만듦: `src/lib/summary/monthly.ts`, `src/lib/summary/monthly.test.ts`, `src/components/monthly-summary.tsx`, `src/components/monthly-summary.test.tsx`, `src/app/(workspace)/jobs/summary/page.tsx`
- 수정: `src/lib/domain/types.ts`(`Job.completedAt?: string`), `src/lib/domain/engine.ts`(`toggleJobCompletion`), `src/components/jobs-overview.tsx`(머리 버튼), `src/sites/routes.tsx`(경로 목록 22~36줄과 `<Route>` 70~86줄 둘 다), `src/sites/routes.test.tsx`(경로 목록 비교), 휴대폰 앱도 Sites 빌드(`dist/client`)를 싣는다(`capacitor.config.ts`)

**인터페이스:**
- 사용: `ORDER_SOURCE_LABELS`(작업 6)
- 내놓음(`monthly.ts`):
  - `monthKeyOf(iso: string, timeZone: string): string` → `"YYYY-MM"`(`Intl.DateTimeFormat`에 `timeZone`)
  - `monthlySummary(jobs: Job[], month: string, timeZone: string): MonthlySummary` — 완료(`status === "completed"`) 일감만, 기준 시각 = `completedAt ?? updatedAt`(뒤의 경우 `completedAtEstimated: true`), `archived`는 뺀다. `MonthlySummary = { month; totals: { amount; estimatedCost; margin; count }; bySource: Array<{ source: OrderSource | "none"; label: string; amount: number; count: number }>; rows: Array<{ job: Job; completedAt: string; completedAtEstimated: boolean }>; inProgress: { amount: number; count: number } }` (`"none"`의 label은 `받은 곳 없음`)
  - `summaryCsv(jobs: Job[], range: { kind: "month"; month: string } | { kind: "year"; year: string }, timeZone: string): string` — `\uFEFF` + 머리줄 `완료일,고객,일감,받은 곳,패키지,금액,예상 원가,남는 돈,시작일,마감일` + 줄들, 줄바꿈 `\r\n`, 모든 글 칸 큰따옴표(안의 `"`는 `""`), `=`·`+`·`-`·`@`로 시작하는 글 칸 앞에 `'`. 링크 토큰·수정 요청 내용은 넣지 않는다.
  - 파일 이름: `ilgamcheck-매출-2026-11.csv` / `ilgamcheck-매출-2026.csv`

- [ ] **1단계: 실패하는 시험** — `monthly.test.ts`(모두 `timeZone = "Asia/Seoul"`로 고정)
  - `달 경계는 넘겨받은 시간대로 나눈다`: `2026-11-30T14:30:00Z`(서울 11/30 23:30) → `"2026-11"`, `2026-11-30T15:10:00Z`(서울 12/1 00:10) → `"2026-12"`
  - `예전 완료 일감은 마지막 수정 시각으로 넣고 추정 표시`
  - `받은 곳별 합계와 진행 중 합계를 따로 낸다`
  - `CSV는 따옴표로 감싸고 수식 시작 문자를 무력화한다`: 고객 `=SUM(A1)` → `"'=SUM(A1)"`, 고객 `카페 "모라", 2호점` → `"카페 ""모라"", 2호점"`, 첫 글자 BOM, 줄바꿈 CRLF
  - `engine`: 완료하면 `completedAt`이 생기고 되돌리면 칸이 사라진다
  - `monthly-summary.test.tsx`: ◀ ▶로 달이 바뀌고, 합계·받은 곳별 줄이 보이고, `summary-download-month`를 누르면 `ilgamcheck-매출-2026-11.csv`로 내려받기가 일어난다(앵커 `download` 속성 확인), 안내 문장 "세금 신고 때 참고하려고 모은 정리예요. 세금 계산이나 신고는 하지 않아요."가 있다
  - `routes.test.tsx`: 경로 목록에 `/jobs/summary`가 있고, `/jobs/summary`가 일감 상세가 아닌 월별 정리를 그린다
- [ ] **2단계: 실패 확인** — FAIL
- [ ] **3단계: 구현** — 화면 시간대는 `Intl.DateTimeFormat().resolvedOptions().timeZone`을 넘긴다. 일감 목록 머리에 `open-monthly-summary` 버튼("월별 정리"). 화면 아래 작은 글: "금액은 주문 조건과 확정한 추가요청 기준이에요." Next 경로(`(workspace)/jobs/summary/page.tsx`)와 Sites 경로(`routes.tsx` 목록과 `<Route>`)를 둘 다 넣는다. `/jobs/:id`보다 먼저 맞아야 한다.
- [ ] **4단계: 통과 확인** — PASS + `npm run typecheck`
- [ ] **5단계: 커밋** — `feat: 달마다 완료한 주문의 매출·원가를 받은 곳별로 보고 CSV로 내려받음`

### 작업 9: 그림 위주 사용설명서 (D)

**파일:**
- 수정: `e2e/capture/guide-screens.capture.ts`, `src/components/user-guide.tsx`, `src/components/first-run-checklist.tsx`(그림 경로), `src/styles/theme.css`, `public/guide/*.webp`(새로 찍음, 안 쓰는 옛 그림은 `git rm`)
- 시험: `src/components/renewal-public-pages.test.tsx`, `e2e/guide-demo.spec.ts`

**인터페이스:**
- 내놓음(`user-guide.tsx`): `export type GuideShot = { id: string; title: string; caption: string; detail?: string; image: { src: string; alt: string; width: number; height: number } }`, `export type GuideChapter = { id: string; title: string; tryIt: { href: string; label: string }; shots: GuideShot[] }`, `export const GUIDE_CHAPTERS: GuideChapter[]`

장 구성(설계 D): 주문 30초 등록(패키지 한 번 저장 / 주문 오면 네 가지 고르기) · 시작 안내 한 방(카톡 문구 하나 복사 / 답·자료 오면 체크) · 수정 범위 정리(요청은 확인 대기 → 수정 완료 때 1회 / 범위 밖은 추가요청) · 더 편하게(상황별 보낼 말 / 월별 정리). 가입 그림은 맨 위에 작게 하나.

- [ ] **1단계: 실패하는 시험** — `renewal-public-pages.test.tsx`
  - 장 4개, 그림 8장(+가입 1장), 모든 그림에 빈 `alt`가 없다(가입 제외 목차 그림은 장식이라 빈 alt 허용)
  - 장마다 `직접 해 보기` 링크 1개
  - 모든 `caption`은 40자 이하, 모든 `title`은 24자 이하
  - 설명서 본문 글자 수(`document.body.textContent`에서 공백 정리)가 1,094보다 적다
- [ ] **2단계: 실패 확인** — FAIL
- [ ] **3단계: 화면 구현** — 그림이 먼저(휴대폰에서 폭 가득), 아래 제목 한 줄·설명 한 줄, 더 긴 글은 `<details>`의 `자세히`. 맨 위 그림 띠(목차)와 '아직 안 되는 것'은 둔다.
- [ ] **4단계: 캡처 스크립트** — `annotate(page, marks: Array<{ selector: string; n: number }>)`: 대상 요소 둘레에 주의색 테두리(3px, 둥근 모서리)와 번호 동그라미를 문서 위 절대 위치로 그려 넣고, 찍은 뒤 지운다. 장면마다 필요한 부분만 잘라(clip) 저장. 예시 데이터는 `src/lib/demo/sample-order.ts`(받은 곳 `kmong`, 받을 자료·질문, 확인 대기 요청 1건, 초안 추가요청 1건, 완료 일감 1건 포함하도록 캡처 상태에서 만든다).
- [ ] **5단계: 그림 찍기** — `NEXT_PUBLIC_STORAGE_MODE=local npm run build` 뒤 `npx playwright test -c playwright.guide.config.ts` → `public/guide/`에 새 webp. 그림을 열어 표시가 대상 위에 있는지 눈으로 확인.
- [ ] **6단계: 통과 확인** — 단위 시험 PASS
- [ ] **7단계: 커밋** — `docs: 사용설명서를 그림 위주로 바꾸고 그림 안에 누를 곳을 표시함`

### 작업 10: 문서 · 전체 검사 · 다시 돌아보기

**파일:** `PRODUCT.md`(기능 상태: 8번은 2026-11-02 운영 배포, 이 브랜치 = A~D 요약. 'MVP 무기 3개' 절의 "아래에 없는 기능은 만들지 않는다"와 '보관'의 "영수증과 세금 정리·자기 손익 하한"은 사용자 11-02 지시("세금·최소단가 고려, 전부 진행")로 이 브랜치에서 가볍게 만든다고 고쳐 적는다. 세무 판단·신고 대행 범위 밖은 그대로), `HANDOFF.md`(맨 위 상태)

- [ ] **1단계: 문서 고치기** — 위 두 파일. 설계·계획 문서 경로를 적는다.
- [ ] **2단계: 전체 검사** — `npm run check:release`(단독 실행) → `[release-gate] PASS … 전체 게이트 통과.`
- [ ] **3단계: 다시 돌아보기** — 로컬 모드 빌드·서버(포트 4120) 뒤 `node .walkthrough/walk.mjs <출력> mobile`과 `desktop`. 기준: 첫 문구까지 누르기 ≤ 6, `kakao-message.txt`에 `[보내 주실 자료]`와 `[알려 주실 것]`, 일감 화면 첫 화면 캡처에 확인 대기 띠, 설명서 글자 수 < 1,094, 콘솔 오류 0.
- [ ] **4단계: 커밋** — `docs: 기능 상태와 인계 문서를 이번 변경에 맞춤`
