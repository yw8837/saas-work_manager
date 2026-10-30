import { expect, test } from "@playwright/test";

test("그림 사용설명서는 6단계 캡처를 모두 불러오고 체험 링크로 이어진다", async ({ page }) => {
  await page.goto("/guide");
  await expect(page.getByRole("heading", { level: 1, name: "그림으로 보는 일감체크" })).toBeVisible();

  const steps = page.locator(".guideStep");
  await expect(steps).toHaveCount(6);
  const images = page.locator(".guideShot img");
  await expect(images).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }

  // 가로로 넘치지 않아야 휴대폰에서 읽힌다.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByTestId("guide-demo-link").click();
  await expect(page).toHaveURL(/\/demo\/r$/);
  await expect(page.getByRole("note")).toContainText("체험용 예시 화면이에요");
});

test("고객 체험 링크는 검색에 막혀 있고, 요청을 남겨도 서버로 보내지 않는다", async ({ page }) => {
  const outbound: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    // 같은 서버의 정적 파일 외에 Supabase·외부 API 호출이 있으면 실패다.
    if (url.origin !== "http://127.0.0.1:4100" || request.method() !== "GET" || /^\/api\//.test(url.pathname)) {
      outbound.push(`${request.method()} ${request.url()}`);
    }
  });

  const response = await page.goto("/demo/r");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await expect(page.getByRole("note")).toContainText("실제로 전송되지 않아요");
  await expect(page.getByTestId("demo-revision-usage")).toHaveText("3회 중 1회 사용");
  await expect(page.getByText("2회 남음")).toBeVisible();

  await page.getByLabel("이름 또는 담당자명").fill("예시 고객");
  await page.getByLabel("수정 요청 내용").fill("1. 메뉴판 글씨를 키워주세요.");
  await page.getByRole("button", { name: /요청 남기기/ }).click();

  await expect(page.getByRole("status")).toContainText("수정 요청을 남겼어요");
  await expect(page.getByTestId("demo-revision-usage")).toHaveText("3회 중 2회 사용");
  await page.getByRole("button", { name: "다른 요청 남기기" }).click();
  await expect(page.getByText("1회 남음")).toBeVisible();

  const stored = await page.evaluate(() => Object.keys(localStorage));
  expect(stored).toEqual([]);
  expect(outbound).toEqual([]);

  // 새로고침하면 처음 상태로 돌아간다.
  await page.reload();
  await expect(page.getByTestId("demo-revision-usage")).toHaveText("3회 중 1회 사용");
});

test("첫 화면에서 설명서와 고객 체험 링크로 갈 수 있다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("landing-guide")).toHaveAttribute("href", "/guide");
  await page.getByTestId("landing-customer-demo").click();
  await expect(page).toHaveURL(/\/demo\/r$/);
});
