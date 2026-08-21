import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("ilgamcheck-e2e-initialized")) {
      localStorage.clear();
      sessionStorage.setItem("ilgamcheck-e2e-initialized", "1");
    }
  });
});

test("데모 진입 → 자동 조립 → 일감 저장 → 새로고침 복원", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("landing-demo").click();
  await expect(page).toHaveURL(/\/today$/);

  await page.locator('[data-testid="create-job"]:visible, [aria-label="새 일감 만들기"]:visible').click();
  await expect(page).toHaveURL(/\/jobs\/new$/);

  await page.getByLabel("고객 이름").fill("E2E 테스터 상점");
  const firstOption = page.locator('input[name="optionIds"]').first();
  if (await firstOption.count()) {
    await page.locator(".optionChoice").first().click();
    await expect(firstOption).toBeChecked();
  }

  if ((page.viewportSize()?.width ?? 1280) <= 760) {
    await expect(page.locator(".mobileSubmitBar")).toBeVisible();
    await expect(page.getByLabel("고객 이름")).toHaveValue("E2E 테스터 상점");
  } else {
    await expect(page.getByText("자동 완성 미리보기")).toBeVisible();
    await expect(page.getByText("E2E 테스터 상점", { exact: true }).first()).toBeVisible();
  }
  await page.locator('[data-testid^="submit-job"]:visible').click();

  await expect(page).toHaveURL(/\/jobs\/[^/?]+\?created=1$/);
  await expect(page.getByText("E2E 테스터 상점", { exact: true }).first()).toBeVisible();

  await page.reload();
  await expect(page.getByText("E2E 테스터 상점", { exact: true }).first()).toBeVisible();
});

test("PWA manifest는 설치 정보만 공개한다", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "일감체크",
    display: "standalone",
    start_url: "/today?source=pwa"
  });
  expect(JSON.stringify(manifest)).not.toMatch(/supabase|client|customer|token|secret/i);
});

test("고객 수정요청 데모는 원문을 기록하고 공통 로그에 남긴다", async ({ page }) => {
  const response = await page.goto("/r/demo-mora-revision");
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
  await expect(page.getByText("같은 브라우저 로컬 데모")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "개인정보 처리 안내" })).toBeVisible();
  await expect(page.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByText(/민감한 내용은 적지 마세요/)).toBeVisible();
  await page.getByLabel("수정 요청 내용").fill("메인 문구를 조금 더 짧게 바꿔주세요.");
  await page.getByRole("button", { name: "요청 남기기" }).click();
  await expect(page.getByRole("heading", { name: "수정 요청을 남겼어요" })).toBeVisible();

  await page.goto("/jobs/job_seed_mora");
  await expect(page.getByText("메인 문구를 조금 더 짧게 바꿔주세요.")).toBeVisible();
  await expect(page.getByText(/고객 수정 링크/).first()).toBeVisible();
});

test("일감 완료와 재진행은 기존 업무 상태를 보존한다", async ({ page }) => {
  await page.goto("/jobs/job_seed_mora");
  const tasks = page.locator(".detailTaskRow");
  await tasks.first().locator("button").click();
  const before = await tasks.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-state")));

  await page.getByTestId("complete-job").click();
  await expect(page.getByRole("button", { name: "다시 진행" })).toBeVisible();
  await expect(tasks.first().locator("button")).toBeDisabled();
  await expect(page.getByTestId("toggle-waiting")).toBeDisabled();
  await expect(page.getByTestId("record-revision")).toBeDisabled();
  expect(await tasks.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-state")))).toEqual(before);

  await page.goto("/today");
  await expect(page.locator(".waitingSection .waitingRow").filter({ hasText: "모라스튜디오" })).toHaveCount(0);
  await page.goto("/jobs/job_seed_mora");

  await page.getByTestId("complete-job").click();
  await expect(page.getByRole("button", { name: "일감 완료하기" })).toBeVisible();
  expect(await tasks.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-state")))).toEqual(before);
});

test("다른 탭의 고객 수정요청이 최신 작업 상태를 되돌리지 않는다", async ({ page, context }) => {
  await page.goto("/jobs/job_seed_mora");
  const firstTask = page.locator(".detailTaskRow").first();
  await firstTask.locator("button").click();
  await expect(firstTask).toHaveAttribute("data-state", "done");

  const customerPage = await context.newPage();
  await customerPage.goto("/r/demo-mora-revision");
  await customerPage.getByLabel("수정 요청 내용").fill("두 탭 동시 사용 회귀 테스트 요청");
  await customerPage.getByRole("button", { name: "요청 남기기" }).click();
  await expect(customerPage.getByRole("heading", { name: "수정 요청을 남겼어요" })).toBeVisible();

  await page.reload();
  await expect(page.locator(".detailTaskRow").first()).toHaveAttribute("data-state", "done");
  await expect(page.getByText("두 탭 동시 사용 회귀 테스트 요청")).toBeVisible();
});


test("패키지 편집은 새 일감 선택지에 반영하고 기존 일감 스냅샷은 유지한다", async ({ page }) => {
  await page.goto("/packages");
  await page.getByLabel("패키지 이름").fill("E2E 맞춤 홈페이지");
  await page.getByTestId("save-package").click();
  await expect(page.getByText("패키지 조건을 저장했어요. 새 일감부터 적용돼요.")).toBeVisible();

  await page.goto("/jobs/new");
  await expect(page.getByText("E2E 맞춤 홈페이지", { exact: true })).toBeVisible();
  await page.goto("/jobs/job_seed_mora");
  await expect(page.locator(".detailKickerLine").getByText("Standard 홈페이지", { exact: true })).toBeVisible();
});

test("추가요청은 초안 기록 뒤 확정 시에만 일감에 반영한다", async ({ page }) => {
  await page.goto("/jobs/job_seed_mora");
  await page.getByTestId("open-addon").click();
  await page.getByLabel("추가요청 내용").fill("이벤트 랜딩 페이지");
  await page.getByLabel("추가금 (원)").fill("220000");
  await page.getByLabel("추가 기간 (일)").fill("2");
  await page.getByLabel("추가 Todo").fill("이벤트 랜딩 제작");
  await page.getByRole("button", { name: "초안 기록" }).click();
  await expect(page.getByText("이벤트 랜딩 페이지", { exact: true })).toBeVisible();
  await expect(page.getByText("초안", { exact: true })).toBeVisible();

  await page.locator('[data-testid^="confirm-addon-"]').click();
  await expect(page.getByText("확정됨", { exact: true })).toBeVisible();
  await expect(page.getByText("추가요청을 확정해 합계·마감·Todo에 반영했어요.")).toBeVisible();
  await expect(page.getByText("이벤트 랜딩 제작", { exact: true })).toBeVisible();
});

test("일감 상세에서 작업 링크를 저장하고 새로고침 뒤에도 유지한다", async ({ page }) => {
  await page.goto("/jobs/job_seed_mora");
  await page.getByRole("button", { name: "편집" }).last().click();
  await page.getByLabel("링크 1 이름").fill("E2E 작업 링크");
  await page.getByLabel("링크 1 주소").fill("https://example.org/e2e-work");
  await page.getByRole("button", { name: "링크 저장" }).click();
  await expect(page.locator(".linkShortcutGrid").getByText("E2E 작업 링크", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".linkShortcutGrid").getByText("E2E 작업 링크", { exact: true })).toBeVisible();
});

test("알림 설정은 인앱 기준과 외부 권한 경계를 보여준다", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "알림 설정" })).toBeVisible();
  await expect(page.getByText("D-2 · D-1 · 당일 · 지연")).toBeVisible();
  await expect(page.getByText("BLOCKED_EXTERNAL", { exact: true })).toBeVisible();
});
