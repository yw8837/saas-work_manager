import { expect, test } from "@playwright/test";

// 운영 /privacy·/terms에서 React #418(서버 HTML과 브라우저 첫 화면 불일치)이 콘솔 오류로 났다.
for (const route of ["/privacy", "/terms"]) {
  test(`${route} 정책 화면은 콘솔 오류 없이 열린다`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // hydrate는 스크립트를 다 받은 뒤 돈다. 네트워크가 잠잠해지고 브라우저가 한가해질 때까지 기다린다.
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => new Promise((resolve) => requestIdleCallback(() => resolve(null))));

    expect(errors).toEqual([]);
    await expect(page.locator("header").getByRole("link", { name: "일감체크 홈" })).toHaveCount(1);
  });
}
