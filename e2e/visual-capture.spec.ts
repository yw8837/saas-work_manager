import { test } from "@playwright/test";

const captureRoutes = [
  ["today", "/today"],
  ["new-job", "/jobs/new"],
  ["job-detail", "/jobs/job_seed_mora"],
  ["packages", "/packages"],
  ["public-revision", "/r/demo-mora-revision"],
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("핵심 화면 5종 캡처", async ({ page }, testInfo) => {
  for (const [name, route] of captureRoutes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(180);
    await page.screenshot({
      path: `qa-screenshots/${name}-${testInfo.project.name}.png`,
      fullPage: false,
      caret: "initial",
    });
  }
});
