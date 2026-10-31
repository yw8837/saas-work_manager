import { expect, test, type Page } from "@playwright/test";

import { seedWorkspace } from "./seed-state";

/**
 * "바로 쓸 수 있게" 리뉴얼: 처음 온 제작자가 첫 고객 링크를 보내기까지.
 * 로컬 모드(브라우저 저장)만 쓰고 외부 서버는 부르지 않는다.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("ilgamcheck-renewal-initialized")) {
      localStorage.clear();
      sessionStorage.setItem("ilgamcheck-renewal-initialized", "1");
    }
  });
});

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("3·5·1번: 첫 실행 체크리스트 → 업종 예시 → 첫 일감 → 저장 직후 고객에게 보내기", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  await page.goto("/today");

  const checklist = page.getByTestId("first-run-checklist");
  await expect(checklist).toBeVisible();
  await expect(page.getByTestId("first-run-progress")).toHaveText("0/3 완료");
  await noHorizontalOverflow(page);

  await page.getByTestId("industry-design").click();
  await expect(page.getByTestId("industry-design")).toHaveAttribute("aria-pressed", "true");
  await expect(checklist.getByRole("status")).toContainText("디자인 예시 패키지 3개로 바꿨어요. 금액은 예시예요.");
  await expect(page.getByTestId("first-run-progress")).toHaveText("1/3 완료");

  await page.getByTestId("first-run-create-job").click();
  await expect(page).toHaveURL(/\/jobs\/new$/);
  // 업종 예시가 새 일감 선택지에 바로 나온다. 홈페이지 예시는 보관돼 선택지에 없다.
  await expect(page.locator("label.packageChoice").filter({ hasText: "Standard 로고 디자인" })).toBeVisible();
  await expect(page.locator("label.packageChoice").filter({ hasText: "홈페이지" })).toHaveCount(0);
  await page.getByLabel("고객 이름").fill("리뉴얼 첫 고객");
  await page.locator("label.packageChoice").filter({ hasText: "Standard 로고 디자인" }).click();
  await page.locator('[data-testid^="submit-job"]:visible').click();

  await expect(page).toHaveURL(/\/jobs\/[^/?]+\?created=1$/);
  const banner = page.getByTestId("send-to-client-banner");
  await expect(banner).toBeVisible();
  // 모바일에서도 첫 화면 안에 보낼 링크가 있다.
  const box = await banner.getByTestId("send-copy-link").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await noHorizontalOverflow(page);

  const link = await page.getByTestId("send-to-client-link").inputValue();
  expect(link).toMatch(/\/r\/[A-Za-z0-9_-]+$/);

  await page.getByTestId("send-copy-link").click();
  await expect(page.getByTestId("send-copy-link")).toContainText("링크를 복사했어요");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  await page.getByTestId("send-copy-message").click();
  const message = await page.evaluate(() => navigator.clipboard.readText());
  expect(message).toContain("리뉴얼 첫 고객님");
  expect(message).toContain(link);
  expect(message).not.toMatch(/\d원|₩/);

  const [preview] = await Promise.all([context.waitForEvent("page"), page.getByTestId("send-preview").click()]);
  await preview.waitForLoadState();
  expect(preview.url()).toBe(link);
  await expect(preview.getByRole("heading", { name: "수정할 내용을 한 번에 남겨주세요" })).toBeVisible();
  await expect(preview.getByTestId("revision-remaining")).toHaveText("3");
  await preview.close();

  await page.getByRole("button", { name: "고객에게 보내기 안내 닫기" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page).not.toHaveURL(/created=1/);
  await page.reload();
  await expect(page.getByTestId("send-to-client-banner")).toHaveCount(0);

  // 세 단계를 다 했으니 오늘 화면은 평소 화면으로 돌아간다.
  await page.goto("/today");
  await expect(page.getByRole("region", { name: "오늘 업무 요약" })).toBeVisible();
  await expect(page.getByTestId("first-run-checklist")).toHaveCount(0);
});

test("1번: 자동 복사가 막히면 주소 칸을 선택해 직접 복사하게 한다", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("blocked")), readText: () => Promise.reject(new Error("blocked")) },
    });
  });
  await seedWorkspace(page, "ilgamcheck-renewal-copy-blocked");
  await page.goto("/jobs/job_seed_mora?created=1");
  await page.getByTestId("send-copy-link").click();
  await expect(page.locator("#send-to-client-copy-failed")).toHaveAttribute("role", "alert");
  await expect(page.locator("#send-to-client-copy-failed")).toContainText("자동 복사를 막았어요");
  const selection = await page.getByTestId("send-to-client-link").evaluate((element: HTMLInputElement) => ({
    focused: document.activeElement === element,
    start: element.selectionStart,
    end: element.selectionEnd,
    length: element.value.length,
  }));
  expect(selection.focused).toBe(true);
  expect(selection.start).toBe(0);
  expect(selection.end).toBe(selection.length);
});

test("2번: 고객 링크 화면은 남은 수정을 크게, 개인정보 안내는 접어서, 접수 뒤 다음 일을 알려 준다", async ({ page }) => {
  await seedWorkspace(page, "ilgamcheck-renewal-customer");
  await page.goto("/r/demo-mora-revision");
  await expect(page.getByTestId("revision-remaining")).toHaveText("2");
  const fontSize = await page.getByTestId("revision-remaining").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(32);
  // 마감일·진행 단계는 실제 링크에도 보인다. 작업자 이름은 설정에서 적기 전에는 보이지 않는다.
  await expect(page.getByTestId("revision-worker")).toHaveCount(0);
  await expect(page.getByTestId("revision-due")).toBeVisible();
  await expect(page.getByRole("list", { name: "진행 단계" }).locator("[aria-current=step]")).toHaveCount(1);
  await expect(page.getByTestId("revision-progress")).toContainText(/할 일 \d+개 중 \d+개 완료/);
  await expect(page.getByText(/민감한 내용은 적지 마세요/)).toBeHidden();
  await expect(page.getByRole("link", { name: "개인정보처리방침" })).toBeVisible();
  await noHorizontalOverflow(page);

  await page.getByLabel("수정 요청 내용").fill("리뉴얼 E2E 요청");
  await page.getByRole("button", { name: "요청 남기기" }).click();
  await expect(page.getByTestId("revision-next-step")).toContainText("다음에 일어나는 일");
  await expect(page.getByTestId("revision-next-step")).toContainText("남은 포함 수정은 1회예요");

  await page.goto("/r/not-a-real-link");
  await expect(page.getByRole("heading", { name: "사용할 수 없는 링크예요" })).toBeVisible();
  await expect(page.getByTestId("unavailable-next-step")).toBeVisible();
  // 자물쇠 아이콘이 로고 옆에 붙지 않고 아래 줄에 따로 선다.
  const brand = await page.locator(".publicRevisionEmpty .brand").boundingBox();
  const lock = await page.locator(".publicRevisionEmptyIcon").boundingBox();
  expect(lock!.y).toBeGreaterThanOrEqual(brand!.y + brand!.height);
  await noHorizontalOverflow(page);

  // 설정에서 이름을 적으면 고객 링크 맨 위에 보인다.
  await page.goto("/settings");
  await page.getByTestId("public-worker-name").fill("열매 디자인");
  await page.goto("/r/demo-mora-revision");
  await expect(page.getByTestId("revision-worker")).toHaveText("열매 디자인");
  await noHorizontalOverflow(page);
});

test("4번: 랜딩 보조 버튼은 가입 없이 고객 화면 체험으로, CTA 아래 안심 줄", async ({ page }) => {
  await page.goto("/");
  const reassure = page.getByTestId("landing-reassure");
  await expect(reassure).toBeVisible();
  await expect(reassure).toContainText("카드 등록 없음");
  await expect(page.locator(".heroActions").getByTestId("landing-customer-demo")).toBeVisible();
  await noHorizontalOverflow(page);

  await page.getByTestId("landing-customer-demo").click();
  await expect(page).toHaveURL(/\/demo\/r$/);
  await expect(page.getByTestId("revision-worker")).toHaveText("샘플 디자인 스튜디오");
  await expect(page.getByRole("list", { name: "진행 단계" }).locator("[aria-current=step]")).toContainText("수정");
  await expect(page.getByTestId("demo-preview-only")).toBeVisible();
  await noHorizontalOverflow(page);
});
