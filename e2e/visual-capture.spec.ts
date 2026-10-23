import { expect, test } from "@playwright/test";

import { addCalendarDays } from "../src/lib/domain";
import { createSeedState, STORAGE_KEY } from "../src/lib/store";
import { seedWorkspace } from "./seed-state";

const captureRoutes = [
  ["today", "/today"],
  ["new-job", "/jobs/new"],
  ["job-detail", "/jobs/job_seed_mora"],
  ["packages", "/packages"],
  ["public-revision", "/r/demo-mora-revision"],
] as const;

test.beforeEach(async ({ page }) => {
  await seedWorkspace(page, "visual-capture-seeded");
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

test("여러 일감의 작업 범위와 반응형 화면", async ({ page }, testInfo) => {
  // Only isolated test storage receives these synthetic examples; production starts empty.
  const date = "2026-10-21";
  await page.clock.setFixedTime(new Date(`${date}T03:00:00Z`));
  const state = createSeedState(date);
  const titles = ["브랜드 로고 제작", "홈페이지 제작", "인터뷰 영상 편집", "상세페이지 디자인"];
  state.jobs = Array.from({ length: 12 }, (_, index) => {
    const base = state.jobs[index % 2];
    const id = `visual-job-${index}`;
    return {
      ...base,
      id,
      clientLabel: index < 2 ? "디자인 고객 A" : `샘플 고객 ${index + 1}`,
      title: index === 11 ? "긴 제목 검증 — 브랜드 홈페이지와 제품 상세페이지의 모바일 화면 제작" : titles[index % titles.length],
      dueDate: addCalendarDays(date, index % 4),
      links: [],
      revisions: [],
      tasks: base.tasks.slice(0, 3).map((task, taskIndex) => ({
        ...task,
        id: `${id}-task-${taskIndex}`,
        title: ["시안 정리", "고객 확인", "최종 파일 전달"][taskIndex],
        dueDate: date,
        status: taskIndex === 1 && (index < 2 || index % 3 === 0) ? "waiting" as const : "todo" as const,
      })),
    };
  });
  state.jobsCreatedTotal = 12;
  state.betaAccess = { code: "LOCAL-VISUAL-FIXTURE", grantedAt: `${date}T00:00:00Z`, expiresAt: "2026-11-20T00:00:00Z" };
  await page.goto("/today");
  await page.evaluate(([key, payload]) => localStorage.setItem(key, payload), [STORAGE_KEY, JSON.stringify(state)]);
  await page.reload();
  const scope = page.getByRole("combobox", { name: "일감별로 보기" });
  await expect(scope).toBeVisible();
  await expect(scope.locator("option")).toHaveCount(13);
  await expect(scope.getByRole("option", { name: "디자인 고객 A · 브랜드 로고 제작", exact: true })).toHaveCount(1);
  await expect(scope.getByRole("option", { name: "디자인 고객 A · 홈페이지 제작", exact: true })).toHaveCount(1);
  await scope.selectOption("visual-job-0");
  await expect(page.locator(".taskRow")).toHaveCount(2);
  await page.getByTestId("task-toggle-visual-job-0-task-0").click();
  await expect(page.locator(".taskRow")).toHaveCount(1);
  await scope.selectOption("");
  await expect(page.locator(".taskRow")).toHaveCount(6);
  for (const title of titles.slice(0, 2)) {
    await expect(page.locator(".waitingMain").filter({ hasText: "디자인 고객 A" }).filter({ hasText: title })).toBeVisible();
  }

  for (const [name, route] of [
    ["today-many", "/today"], ["jobs-many", "/jobs"],
    ["detail-many", "/jobs/visual-job-0"], ["new-job", "/jobs/new"],
    ["packages", "/packages"], ["settings", "/settings"],
  ]) {
    await page.goto(route);
    await expect(page.locator(".pageSurface")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
    }));
    expect(width.scroll, `${route}: overflow`).toBeLessThanOrEqual(width.client + 1);
    await page.screenshot({ path: `qa-screenshots/workspace-${name}-${testInfo.project.name}.png`, fullPage: true, scale: "css" });
    await page.screenshot({ path: `qa-screenshots/workspace-${name}-${testInfo.project.name}-viewport.png`, scale: "css" });
    if (name === "jobs-many") {
      await expect(page.locator(".jobTableRow")).toHaveCount(12);
      await expect(page.locator(".revisionCell").first()).toBeVisible();
      if (testInfo.project.name === "desktop") {
        const first = page.locator(".jobTableRow").first();
        const row = await first.boundingBox();
        const arrow = await first.locator(".rowArrow").boundingBox();
        const progress = await first.locator(".tableProgress").boundingBox();
        expect(Math.abs((arrow!.y + arrow!.height / 2) - (row!.y + row!.height / 2))).toBeLessThan(2);
        expect(progress!.height).toBeGreaterThan(24);
        await expect(first.locator(".tableProgress > span")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      }
      await page.getByRole("textbox", { name: "고객 또는 일감 검색" }).fill("디자인 고객 A");
      await expect(page.locator(".jobTableRow")).toHaveCount(2);
    }
    if (name === "settings") {
      await expect(page.locator(".planBadge.pro")).toHaveCSS("color", "rgb(36, 36, 38)");
      await expect(page.getByText("아직 준비 중인 기능", { exact: true })).toBeVisible();
    }
  }
  for (const width of [320, 761, 1265]) {
    await page.setViewportSize({ width, height: 740 });
    for (const route of ["/today", "/jobs", "/jobs/visual-job-11", "/jobs/new"]) {
      await page.goto(route);
      await expect(page.locator(".pageSurface")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px ${route}`).toBeLessThanOrEqual(width);
    }
  }
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1265, height: 712 });
    await page.goto("/today");
    await page.screenshot({ path: "qa-screenshots/workspace-user-1265.png", scale: "css" });
  }
});
