import { expect, test } from "@playwright/test";

import { seedWorkspace } from "./seed-state";

for (const width of [320, 1440]) {
  for (const filtered of [false, true]) {
    test(`${width}px 빈 일감 안내는 순서대로 쌓이고 가려지지 않는다 (${filtered ? "검색" : "처음"})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      if (filtered) await seedWorkspace(page, "empty-layout-seeded");
      await page.goto("/jobs");
      if (filtered) await page.getByRole("textbox", { name: "고객 또는 일감 검색" }).fill("없는고객-레이아웃검증");
      const empty = page.locator(".jobEmpty");
      await expect(empty).toBeVisible();
      const children = await empty.locator(":scope > *").all();
      let previousBottom = 0;
      for (const child of children) {
        const box = await child.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.y).toBeGreaterThanOrEqual(previousBottom + 4);
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        previousBottom = box!.y + box!.height;
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (!filtered) {
        await empty.getByRole("link", { name: "첫 일감 만들기" }).click();
        await expect(page).toHaveURL(/\/jobs\/new$/);
        await expect(page.getByLabel("고객 이름")).toBeVisible();
      }
    });
  }
}

for (const width of [320, 375, 390]) {
  test(`${width}px 핵심 화면은 가로로 넘치지 않는다`, async ({ page }) => {
    // 시드 일감 상세도 확인 대상이다. 앱은 빈 상태로 시작한다.
    await seedWorkspace(page, "ilgamcheck-responsive-e2e-seeded");
    await page.setViewportSize({ width, height: 844 });

    for (const route of ["/", "/today", "/jobs/new", "/jobs/job_seed_mora"]) {
      await page.goto(route);
      const sizes = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(sizes.scrollWidth, `${route} horizontal overflow`).toBeLessThanOrEqual(sizes.clientWidth + 1);
    }
  });
}

test("737px 랜딩 헤더와 히어로는 태블릿 폭을 낭비하지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 737, height: 865 });
  await page.goto("/");

  const header = page.locator(".marketingHeader");
  const login = page.locator(".headerDemoLink");
  const heroCopy = page.locator(".heroCopy");
  const heroTitle = page.locator(".heroCopy h1");

  const [headerBox, loginBox, copyBox, titleBox] = await Promise.all([
    header.boundingBox(),
    login.boundingBox(),
    heroCopy.boundingBox(),
    heroTitle.boundingBox(),
  ]);

  expect(headerBox).not.toBeNull();
  expect(loginBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(headerBox!.x + headerBox!.width - (loginBox!.x + loginBox!.width)).toBeLessThanOrEqual(24);
  expect(titleBox!.width).toBeGreaterThanOrEqual(copyBox!.width * 0.75);
});

test("모바일 새 일감 CTA는 하단 내비 위에서 눌린다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/jobs/new");

  const submitBar = page.locator(".mobileSubmitBar");
  const bottomNav = page.locator(".mobileBottomNav");
  await expect(submitBar).toBeVisible();
  await expect(bottomNav).toBeVisible();
  await page.getByLabel("고객 이름").fill("모바일 CTA 확인");

  const [submitBox, navBox] = await Promise.all([submitBar.boundingBox(), bottomNav.boundingBox()]);
  expect(submitBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(submitBox!.y + submitBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
  await expect(page.locator('[data-testid^="submit-job"]:visible')).toBeEnabled();
});

test("상세 수정 로그는 랜딩 스타일과 격리된다", async ({ page }) => {
  // 시드 일감 화면이 필요하다. 앱은 빈 상태로 시작한다.
  await seedWorkspace(page, "ilgamcheck-responsive-e2e-seeded");
  await page.goto("/jobs/job_seed_mora");

  const revisionSection = page.locator(".jobRevisionSection");
  await expect(revisionSection).toBeVisible();
  await expect(page.locator(".jobDetailPage .revisionSection")).toHaveCount(0);

  const style = await revisionSection.evaluate((element) => {
    const computed = window.getComputedStyle(element);
    // 색을 숫자로 박아두면 디자인 토큰이 바뀔 때마다 테스트가 낡는다.
    // 이 테스트가 지키려는 건 "랜딩 스타일이 새어들지 않는다"이므로 토큰과 같은지만 본다.
    const probe = document.createElement("span");
    probe.style.color = "var(--ink)";
    document.body.appendChild(probe);
    const inkColor = window.getComputedStyle(probe).color;
    probe.remove();
    return {
      backgroundColor: computed.backgroundColor,
      color: computed.color,
      inkColor,
      gridTemplateColumns: computed.gridTemplateColumns,
    };
  });

  expect(style.backgroundColor).toBe("rgb(255, 255, 255)");
  expect(style.color).toBe(style.inkColor);
  expect(style.gridTemplateColumns).toBe("none");
});

test("모바일 고정 수정 버튼은 폼을 열고 입력칸에 포커스한다", async ({ page }) => {
  // 시드 일감 화면이 필요하다. 앱은 빈 상태로 시작한다.
  await seedWorkspace(page, "ilgamcheck-responsive-e2e-seeded");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/jobs/job_seed_mora");

  const revisionButton = page.getByRole("button", { name: "수정 기록" });
  await expect(revisionButton).toBeVisible();
  await revisionButton.click();

  const revisionForm = page.locator("#revision-entry-form");
  const revisionTextarea = revisionForm.getByRole("textbox", { name: "수정 요청 내용" });
  await expect(revisionForm).toBeVisible();
  await expect(revisionButton).toHaveAttribute("aria-expanded", "true");
  await expect(revisionTextarea).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test("muted 토큰은 밝은 기본 배경에서 WCAG AA 대비를 충족한다", async ({ page }) => {
  await page.goto("/");

  const ratios = await page.evaluate(() => {
    const root = window.getComputedStyle(document.documentElement);
    const parseRgb = (value: string) => {
      const probe = document.createElement("span");
      probe.style.color = value;
      document.body.appendChild(probe);
      const rgb = window.getComputedStyle(probe).color.match(/\d+/g)!.slice(0, 3).map(Number);
      probe.remove();
      return rgb;
    };
    const luminance = (rgb: number[]) => rgb
      .map((channel) => channel / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (foreground: string, background: string) => {
      const [lighter, darker] = [luminance(parseRgb(foreground)), luminance(parseRgb(background))]
        .sort((a, b) => b - a);
      return (lighter + 0.05) / (darker + 0.05);
    };
    const muted = root.getPropertyValue("--muted").trim();
    const canvas = root.getPropertyValue("--canvas").trim();
    return {
      onWhite: contrast(muted, "#ffffff"),
      onCanvas: contrast(muted, canvas),
    };
  });

  expect(ratios.onWhite).toBeGreaterThanOrEqual(4.5);
  expect(ratios.onCanvas).toBeGreaterThanOrEqual(4.5);
});
