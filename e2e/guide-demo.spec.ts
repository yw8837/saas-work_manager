import { expect, test } from "@playwright/test";

test("그림 사용설명서는 한 장씩 '다음'만 눌러 끝까지 가고, 마지막에 시작·체험 버튼이 나온다", async ({ page }) => {
  await page.goto("/guide");
  await expect(page.getByRole("heading", { level: 1, name: "그림 설명서" })).toBeVisible();
  const progress = page.getByTestId("guide-progress");
  await expect(progress).toHaveText("1 / 10");
  await expect(page.getByTestId("work-flow-chart")).toBeVisible();
  // 옛 구조(장 목록 띠·장마다 직접 해 보기)는 없다.
  await expect(page.getByRole("navigation", { name: "네 장 한눈에 보기" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /직접 해 보기/ })).toHaveCount(0);
  // 페이지를 떠나지 않고 같은 자리에서 바뀌는지 보려고 표시를 남겨 둔다(다시 불러오면 사라짐).
  await page.evaluate(() => { (window as typeof window & { __guideStay?: number }).__guideStay = 1; });

  for (let step = 1; step <= 10; step += 1) {
    await expect(progress).toHaveText(`${step} / 10`);
    await expect(page.getByTestId("guide-step")).toHaveCount(1);
    if (step > 1) {
      expect(new URL(page.url()).hash).toBe(`#step-${step}`);
      const image = page.getByTestId("guide-step").locator("img");
      await expect(image).toHaveCount(1);
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    }
    // 가로로 넘치지 않아야 휴대폰에서 읽힌다.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${step}단계 가로 넘침`).toBeLessThanOrEqual(1);
    // 손가락 크기(44px) 이상
    for (const button of await page.locator(".guideStepNav :is(button, a)").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    if (step < 10) {
      await expect(page.getByTestId("guide-start")).toHaveCount(0);
      await page.getByTestId("guide-next").click();
    }
  }

  expect(await page.evaluate(() => (window as typeof window & { __guideStay?: number }).__guideStay)).toBe(1);
  await expect(page.getByTestId("guide-next")).toHaveCount(0);
  // 시작 버튼은 베타 코드를 붙여 간다(src/lib/signup-start.ts).
  await expect(page.getByTestId("guide-start")).toHaveAttribute("href", "/today?invite=BETA2026");
  await expect(page.getByTestId("guide-not-yet")).toBeVisible();
  await page.getByTestId("guide-demo-link").click();
  await expect(page).toHaveURL(/\/demo\/r$/);
  await expect(page.getByRole("note")).toContainText("체험용 예시 화면이에요");
});

test("설명서는 주소의 단계 번호로 새로고침해도 그 단계이고, ←/→ 키로도 넘어간다", async ({ page }) => {
  await page.goto("/guide#step-5");
  await expect(page.getByTestId("guide-progress")).toHaveText("5 / 10");
  await page.reload();
  await expect(page.getByTestId("guide-progress")).toHaveText("5 / 10");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("guide-progress")).toHaveText("6 / 10");
  expect(new URL(page.url()).hash).toBe("#step-6");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("guide-progress")).toHaveText("4 / 10");
  await expect(page.getByTestId("guide-live")).toHaveText(/^4\/10 단계, /);

  // 휴대폰처럼 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전(실제 브라우저의 터치 이벤트).
  const swipe = (fromX: number, toX: number) => page.getByTestId("guide-step").evaluate((element, [from, to]) => {
    const touch = (x: number) => new Touch({ identifier: 1, target: element, clientX: x, clientY: 300 });
    element.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [touch(from)], changedTouches: [touch(from)] }));
    element.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [touch(to)] }));
  }, [fromX, toX] as const);
  // 터치 이벤트는 터치 기기(mobile 프로젝트)에서만 만들 수 있다.
  if (test.info().project.name === "mobile") {
    await swipe(300, 100);
    await expect(page.getByTestId("guide-progress")).toHaveText("5 / 10");
    await swipe(100, 300);
    await expect(page.getByTestId("guide-progress")).toHaveText("4 / 10");
  }
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
  await expect(page.getByTestId("revision-remaining")).toHaveText("2");

  await page.getByLabel("이름 또는 담당자명").fill("예시 고객");
  await page.getByLabel("수정 요청 내용").fill("1. 메뉴판 글씨를 키워주세요.");
  await page.getByRole("button", { name: /요청 남기기/ }).click();

  await expect(page.getByRole("status")).toContainText("수정 요청을 남겼어요");
  // 수정 횟수는 작업자가 수정을 마칠 때 쓴다. 접수만으로는 사용 횟수·남은 횟수가 그대로다.
  await expect(page.getByRole("status")).toContainText("요청을 접수했어요");
  await expect(page.getByTestId("demo-revision-usage")).toHaveText("3회 중 1회 사용");
  await page.getByRole("button", { name: "다른 요청 남기기" }).click();
  await expect(page.getByTestId("revision-remaining")).toHaveText("2");
  await expect(page.getByTestId("revision-pending")).toHaveText("확인 대기 1건");

  const stored = await page.evaluate(() => Object.keys(localStorage));
  expect(stored).toEqual([]);
  expect(outbound).toEqual([]);

  // 새로고침하면 처음 상태로 돌아간다.
  await page.reload();
  await expect(page.getByTestId("demo-revision-usage")).toHaveText("3회 중 1회 사용");
});

test("첫 화면에서 설명서와 가입 없이 둘러보기로 갈 수 있다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("landing-guide")).toHaveAttribute("href", "/guide");
  await page.getByTestId("landing-try").click();
  await expect(page).toHaveURL(/\/try$/);
});
