import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("ilgamcheck-portal-e2e-initialized")) {
      localStorage.clear();
      sessionStorage.setItem("ilgamcheck-portal-e2e-initialized", "1");
    }
  });
});

test("수정 링크를 끄면 기존 로컬 공개 주소를 즉시 거부한다", async ({ page }) => {
  await page.goto("/jobs/job_seed_mora");

  await expect(page.getByText("링크 켜짐", { exact: true })).toBeVisible();
  await page.getByTestId("toggle-revision-portal").click();
  await expect(page.getByText("링크 꺼짐", { exact: true })).toBeVisible();
  await expect(page.getByTestId("copy-revision-portal")).toBeDisabled();

  await page.goto("/r/demo-mora-revision");
  await expect(page.getByRole("heading", { name: "사용할 수 없는 링크예요" })).toBeVisible();
});

test("수정 링크 재발급은 옛 토큰을 폐기하고 새 256-bit 토큰만 허용한다", async ({ page }) => {
  const oldToken = "demo-mora-revision";
  await page.goto("/jobs/job_seed_mora");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("rotate-revision-portal").click();
  await expect(page.getByText("새 수정 링크를 발급했어요. 기존 주소는 폐기됐어요.")).toBeVisible();

  const newToken = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("ilgamcheck:mvp:v2") ?? "null") as {
      jobs?: Array<{ id: string; revisionPortalToken: string }>;
    } | null;
    return state?.jobs?.find((job) => job.id === "job_seed_mora")?.revisionPortalToken ?? "";
  });
  expect(newToken).not.toBe(oldToken);
  expect(newToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

  await page.goto(`/r/${oldToken}`);
  await expect(page.getByRole("heading", { name: "사용할 수 없는 링크예요" })).toBeVisible();

  await page.goto(`/r/${newToken}`);
  await expect(page.getByText("같은 브라우저 로컬 데모")).toBeVisible();
});

test("완료 일감은 재진행 전까지 수정 링크를 켤 수 없다", async ({ page }) => {
  await page.goto("/jobs/job_seed_mora");
  await page.getByTestId("complete-job").click();

  await expect(page.getByText("일감 완료 · 링크 잠김", { exact: true })).toBeVisible();
  await expect(page.getByTestId("toggle-revision-portal")).toBeDisabled();
  await expect(page.getByTestId("rotate-revision-portal")).toBeDisabled();
  await expect(page.getByTestId("copy-revision-portal")).toBeDisabled();

  await page.getByTestId("complete-job").click();
  await expect(page.getByTestId("toggle-revision-portal")).toBeEnabled();
  await expect(page.getByTestId("toggle-revision-portal")).toHaveText("링크 켜기");
});
