import { expect, test } from "@playwright/test";

/**
 * 초대 링크(/today?invite=CODE)를 hosted 화면에서 연다. Supabase는 가짜 프로젝트 주소로 띄우고
 * supabase.co로 가는 요청은 모두 끊는다(mock). 실제 로그인·코드 검증은 하지 않는다.
 * 확인: 주소에서 바로 지움, 이 탭에만 보관, 로그인 화면 안내, 어떤 요청에도 코드가 실리지 않음, Referrer-Policy.
 */
const CODE = "E2EINVITE42";
const PLACEHOLDER_SUPABASE = "https://aaaaaaaaaaaaaaaaaaaa.supabase.co";

test("초대 링크 코드는 주소에서 바로 지우고 이 탭에만 보관하며 어떤 요청에도 싣지 않는다", async ({ page }) => {
  const leaked: string[] = [];
  const requested: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    requested.push(url);
    const referer = request.headers()["referer"] ?? "";
    if (url.includes(CODE) && !/\/today\?invite=/.test(new URL(url).pathname + new URL(url).search)) leaked.push(url);
    if (referer.includes(CODE)) leaked.push(`referer ${url}`);
  });
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript(([url]) => {
    globalThis.__ILGAMCHECK_PUBLIC_ENV__ = {
      NEXT_PUBLIC_STORAGE_MODE: "hosted",
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "invite-e2e-placeholder",
    };
  }, [PLACEHOLDER_SUPABASE] as const);

  const response = await page.goto(`/today?invite=${CODE}`);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");

  await expect(page.getByRole("heading", { name: "Google 계정으로 시작하기" })).toBeVisible();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("invite-ready")).toContainText("베타 코드가 자동으로 적용돼요");
  expect(await page.evaluate(() => sessionStorage.getItem("ilgamcheck:pending-invite"))).toBe(CODE);
  expect(await page.evaluate(() => localStorage.getItem("ilgamcheck:pending-invite"))).toBeNull();
  await expect(page.locator("body")).not.toContainText(CODE);

  // 새로고침해도 주소에 다시 붙지 않고, 보관한 코드는 그대로다(Google 왕복 대신).
  await page.reload();
  await expect(page).toHaveURL(/\/today$/);
  expect(await page.evaluate(() => sessionStorage.getItem("ilgamcheck:pending-invite"))).toBe(CODE);

  // Google 로그인으로 넘어가는 주소에도 코드가 없다(돌아올 주소는 /today 그대로).
  const authorize = page.waitForRequest((request) => request.url().includes("/auth/v1/authorize"));
  await page.getByRole("button", { name: /Google로 계속하기/ }).click();
  const authorizeUrl = new URL((await authorize).url());
  expect(authorizeUrl.toString()).not.toContain(CODE);
  expect(authorizeUrl.searchParams.get("redirect_to")).toMatch(/\/today$/);

  // 첫 문서 요청 하나만 코드를 담고, 그 뒤 어떤 요청에도 코드나 Referer로 새지 않는다.
  expect(requested.filter((url) => url.includes(CODE))).toHaveLength(1);
  expect(leaked).toEqual([]);
});
