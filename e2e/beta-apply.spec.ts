import { expect, test, type Page } from "@playwright/test";

// 로컬 모드(서버 없음)에서 신청·확인·수신거부·운영자 화면의 흐름만 본다. DB 규칙은 scripts/test-beta-consent-db.mjs(PGlite)가 맡는다.
const TOKEN = "e2eToken".padEnd(43, "x");

function watchOutbound(page: Page) {
  const outbound: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4100" || request.method() !== "GET" || /^\/api\//.test(url.pathname)) {
      outbound.push(`${request.method()} ${request.url()}`);
    }
  });
  return outbound;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("[시험표 3·5] 신청 미리보기: 필수 동의 없이는 제출되지 않고, 광고 동의 처리 결과를 보여 주며 아무것도 저장·전송하지 않는다", async ({ page }) => {
  const outbound = watchOutbound(page);
  await page.goto("/apply");
  await expect(page.getByRole("note")).toContainText("미리보기: 실제로 저장되지 않음");
  await expect(page.getByText("운영: 스튜디오열매")).toBeVisible();

  const privacy = page.getByRole("checkbox", { name: /개인정보 수집·이용에 동의합니다/ });
  const ad = page.getByRole("checkbox", { name: /광고성 정보\(이메일\) 수신에 동의합니다/ });
  await expect(privacy).not.toBeChecked();
  await expect(ad).not.toBeChecked();

  await page.getByRole("textbox", { name: /이메일/ }).fill("test01@example.invalid");
  await page.getByRole("radio", { name: "디자인" }).check();
  await page.getByRole("radio", { name: "예" }).check();
  await page.getByRole("radio", { name: "4건 이상" }).check();
  await page.getByRole("radio", { name: "둘 다" }).check();
  await page.getByRole("button", { name: "신청하기" }).click();
  await expect(page.locator(".betaErrors")).toContainText("[필수] 개인정보 수집·이용에 동의해야 신청할 수 있어요.");
  await expect(page.getByRole("heading", { name: "신청을 받았어요" })).toHaveCount(0);

  await privacy.check();
  await ad.check();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "신청하기" }).click();
  await expect(page.getByRole("heading", { name: "신청을 받았어요" })).toBeVisible();
  const notice = page.getByTestId("beta-ad-notice");
  await expect(notice).toContainText("광고성 정보(이메일) 수신 동의");
  await expect(notice).toContainText("주소 확인 뒤 유효합니다");
  await expect(notice).toContainText(/\d{4}-\d{2}-\d{2}/);
  // 완료 화면에 신청 내용(하는 일·건수)을 다시 보여 주지 않는다.
  await expect(page.locator("main")).not.toContainText("4건 이상");
  await expect(page.locator("main")).not.toContainText("디자인");

  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(outbound).toEqual([]);
});

test("[시험표 6·8·9] 수신거부 링크: 검색 차단, 열기만 해서는 처리 안 됨, 버튼 뒤 한글·영문 결과, 잘못된 링크는 대체 창구", async ({ page }) => {
  const outbound = watchOutbound(page);
  const response = await page.goto(`/u/${TOKEN}`);
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("note")).toContainText("미리보기: 실제로 처리되지 않음");
  await expect(page.getByTestId("beta-unsubscribe-result")).toHaveCount(0);
  await expect(page.getByText(/No login or other information is required/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "수신거부 / Unsubscribe" }).click();
  const result = page.getByTestId("beta-unsubscribe-result");
  await expect(result).toContainText("수신거부가 처리됐어요");
  await expect(result).toContainText("You have been unsubscribed.");
  await expect(result).toContainText("스튜디오열매");
  expect(page.url()).not.toContain("@");

  // [리뷰 3] 끝에 / 가 붙은 주소도 검색 차단이 붙은 화면으로 열린다.
  const slashed = await page.goto(`/u/${TOKEN}/`);
  expect(slashed?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByRole("button", { name: "수신거부 / Unsubscribe" })).toBeVisible();

  await page.goto("/u/broken");
  const broken = page.getByTestId("beta-unsubscribe-result");
  await expect(broken).toContainText("수신거부는 처리되지 않았어요");
  await expect(page.getByTestId("beta-unsubscribe-fallback")).toContainText("37@studioyeol.com");
  expect(outbound).toEqual([]);
});

test("[시험표 9·12] 주소 확인 링크: 검색 차단, 버튼을 눌러야 처리, 본인이 아니면 거부·삭제 방법 안내", async ({ page }) => {
  const response = await page.goto(`/apply/confirm/${TOKEN}`);
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByTestId("beta-confirm-result")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "본인이 신청하지 않았다면" })).toContainText("수신거부 링크");
  await page.getByRole("button", { name: "주소 확인하기" }).click();
  await expect(page.getByTestId("beta-confirm-result")).toContainText("주소를 확인했어요");
});

test("[시험표 13] 운영자 화면 미리보기: 초안은 링크를 채우기 전엔 복사가 막히고, 채우면 치환 안 된 값 없이 가로로 넘치지 않는다", async ({ page }) => {
  const response = await page.goto("/ops/applications");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByRole("note")).toContainText("미리보기: 가상 신청 예시");
  await expect(page.getByTestId("beta-application")).toHaveCount(4);

  const both = page.getByTestId("beta-application").filter({ hasText: "test-a@example.invalid" });
  await both.getByText("운영 연락 초안 보기").click();
  const drafts = both.getByTestId("beta-draft");
  await expect(drafts).toHaveCount(2);
  await expect(drafts.first()).toHaveAttribute("data-ready", "false");
  await expect(drafts.first().getByRole("button", { name: "본문 복사" })).toBeDisabled();

  await page.getByLabel("인터뷰 일정 링크(구글 폼)").fill("https://forms.example.test/interview");
  await page.getByLabel("베타 접속(초대) 링크").fill("https://ilgam.example.test/today?invite=E2E");
  await expect(drafts.nth(0)).toHaveAttribute("data-ready", "true");
  await expect(drafts.nth(1)).toHaveAttribute("data-ready", "true");
  for (const index of [0, 1]) {
    const text = await drafts.nth(index).locator("pre").innerText();
    expect(text).not.toMatch(/\[(?:입력 필요|확정값|미정)|\{\{|undefined|NaN/);
    expect(text).toContain("/u/");
    expect(text).toContain("If you do not wish to receive promotional e-mail");
    expect(text).toContain("보내는 사람: 스튜디오열매 · 37@studioyeol.com");
    // 거부 문구가 너무 작지 않다.
    const fontSize = await drafts.nth(index).locator("pre").evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(12);
  }
  await expectNoHorizontalOverflow(page);

  // 미충족(test-c)은 결과 안내 1통뿐이고 접속 안내가 없다.
  const unmatched = page.getByTestId("beta-application").filter({ hasText: "test-c@example.invalid" });
  await unmatched.getByText("운영 연락 초안 보기").click();
  await expect(unmatched.getByTestId("beta-draft")).toHaveCount(1);
  await expect(unmatched.getByTestId("beta-draft").locator("pre")).toContainText("이번 모집 조건(패키지 외주 동시 2건 이상)과 맞지 않음");
  await expect(unmatched.getByTestId("beta-draft").locator("pre")).not.toContainText("시작 방법");

  // 통지 보냄 표시
  const firstNotice = page.getByTestId("beta-notice").first();
  await firstNotice.getByRole("button", { name: "통지 보냄 표시" }).click();
  await firstNotice.getByRole("button", { name: "보낸 것 맞아요" }).click();
  await expect(firstNotice).toContainText("통지 보냄");
  await expect(page.getByRole("heading", { name: /처리결과 통지 2건 남음/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
