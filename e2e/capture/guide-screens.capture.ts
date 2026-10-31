import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { createAddon, recordRevision } from "../../src/lib/domain";
import {
  SAMPLE_CLIENT_LABEL,
  SAMPLE_OPTIONS,
  SAMPLE_ORDER_ID,
  SAMPLE_PACKAGES,
  createSampleOrder,
} from "../../src/lib/demo/sample-order";
import { createSeedState, STORAGE_KEY } from "../../src/lib/store";

/**
 * 사용설명서 그림 6장. 로컬 모드(브라우저 localStorage)에 가짜 예시 데이터만 깔고 찍는다.
 * 실제 계정·고객·Supabase는 쓰지 않으며, 로그인 화면은 가짜 프로젝트 주소로 hosted 화면만 띄우고
 * supabase.co로 가는 요청은 모두 끊는다. Google 버튼은 누르지 않는다.
 */
const DATE = "2026-10-30";
const OUTPUT = resolve(process.cwd(), "public/guide");
const PLACEHOLDER_SUPABASE = "https://aaaaaaaaaaaaaaaaaaaa.supabase.co";

function guideState() {
  const state = createSeedState(DATE);
  const order = createSampleOrder(DATE);
  const second = recordRevision(order, {
    source: "public",
    clientLabel: SAMPLE_CLIENT_LABEL,
    body: "메뉴판에 들어갈 가로형 로고도 함께 보고 싶어요.",
    revisionId: "revision_sample_second",
    submittedAt: `${DATE}T01:40:00.000Z`,
  }).job;
  const addon = createAddon(second, {
    addonId: "addon_sample_card",
    title: "명함 디자인 추가",
    amountDelta: 80_000,
    durationDaysDelta: 2,
    tasks: [{ taskKey: "card-extra", title: "명함 시안 공유", relativeDay: 9, order: 0 }],
    createdAt: `${DATE}T02:10:00.000Z`,
  });
  state.packages = SAMPLE_PACKAGES;
  state.options = SAMPLE_OPTIONS;
  state.jobs = [{ ...second, addons: [addon] }];
  state.jobsCreatedTotal = 1;
  state.trialStartedAt = `${DATE}T00:00:00.000Z`;
  return state;
}

async function save(page: Page, name: string, clipTo?: string) {
  mkdirSync(OUTPUT, { recursive: true });
  let clip: { x: number; y: number; width: number; height: number } | undefined;
  if (clipTo) {
    // 가운데 카드만 있는 화면은 위아래 빈 여백을 잘라 설명서에서 작게 보이지 않게 한다.
    const box = await page.locator(clipTo).boundingBox();
    if (box) {
      const viewport = page.viewportSize()!;
      const top = Math.max(0, box.y - 24);
      clip = { x: 0, y: top, width: viewport.width, height: Math.min(viewport.height - top, box.height + 48) };
    }
  }
  const png = await page.screenshot({ fullPage: false, caret: "initial", animations: "disabled", clip });
  await sharp(png).webp({ quality: 82 }).toFile(resolve(OUTPUT, `${name}.webp`));
}

async function scrollToSection(page: Page, selector: string) {
  await page.locator(selector).first().evaluate((element) => {
    element.scrollIntoView({ block: "start" });
    // 모바일 상단 바(약 58px)에 구획 제목이 가리지 않게 조금 내린다.
    window.scrollBy(0, -72);
  });
  await page.waitForTimeout(200);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${DATE}T03:00:00Z`));
  await page.route(/supabase\.co/, (route) => route.abort());
});

test("1. 가입 화면", async ({ page }) => {
  await page.addInitScript(([url]) => {
    globalThis.__ILGAMCHECK_PUBLIC_ENV__ = {
      NEXT_PUBLIC_STORAGE_MODE: "hosted",
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "guide-capture-placeholder",
    };
    localStorage.clear();
  }, [PLACEHOLDER_SUPABASE] as const);
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Google 계정으로 시작하기" })).toBeVisible();
  await save(page, "01-signup", ".authCard");
});

test.describe("로그인 뒤 화면", () => {
  test.beforeEach(async ({ page }) => {
    const payload = JSON.stringify(guideState());
    await page.addInitScript(([key, value]) => {
      localStorage.clear();
      localStorage.setItem(key, value);
    }, [STORAGE_KEY, payload] as const);
  });

  test("2. 패키지", async ({ page }) => {
    await page.goto("/packages");
    await expect(page.getByText("STANDARD 로고").first()).toBeVisible();
    await save(page, "02-packages");
  });

  test("3. 새 일감", async ({ page }) => {
    await page.goto("/jobs/new");
    await page.locator("#clientLabel").fill(SAMPLE_CLIENT_LABEL);
    await page.locator("label.packageChoice").filter({ hasText: "STANDARD 로고" }).click();
    await page.locator("label.optionChoice").filter({ hasText: "원본 파일" }).click();
    await page.locator("#clientLabel").blur();
    await scrollToSection(page, ".packageFieldSection");
    await save(page, "03-new-job");
  });

  test("4~6. 일감 상세", async ({ page }) => {
    // 저장 직후 화면(?created=1)의 "이제 고객에게 보내세요" 안내를 찍는다.
    await page.goto(`/jobs/${SAMPLE_ORDER_ID}?created=1`);
    await expect(page.getByTestId("send-to-client-banner")).toBeVisible();
    // 로컬 모드에서만 나오는 "이 브라우저에서만 열려요" 안내는 실제 로그인 사용자 화면에 없으므로 가린다.
    await page.locator(".portalLinkSection > small").evaluate((element) => { (element as HTMLElement).style.display = "none"; });
    await page.locator("[data-testid=send-to-client-banner] [data-local-only]").evaluate((element) => { (element as HTMLElement).style.display = "none"; });
    // 캡처 서버 주소(127.0.0.1) 대신 실제 서비스 주소 형태로 보여 준다. 토큰은 가짜 예시 값 그대로다.
    await page.getByTestId("send-to-client-link").evaluate((element: HTMLInputElement) => {
      element.value = element.value.replace(/^https?:\/\/[^/]+/, "https://ilgam.studioyeolmae.com");
    });
    await scrollToSection(page, "[data-testid=send-to-client-banner]");
    await save(page, "04-send-link");
    await scrollToSection(page, "#revisions");
    await save(page, "05-revisions");
    await scrollToSection(page, ".addonSection");
    await save(page, "06-addon");
  });
});
