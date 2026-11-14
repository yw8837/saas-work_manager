import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp, { type OverlayOptions } from "sharp";

import {
  composeJob,
  createAddon,
  DEFAULT_BRIEF_QUESTIONS,
  markStartShared,
  recordRevision,
  toggleJobCompletion,
  type Job,
} from "../../src/lib/domain";
import {
  SAMPLE_CLIENT_LABEL,
  SAMPLE_OPTIONS,
  SAMPLE_ORDER_ID,
  SAMPLE_ORDER_TITLE,
  SAMPLE_PACKAGES,
  SAMPLE_PORTAL_TOKEN,
  createSampleOrder,
} from "../../src/lib/demo/sample-order";
import { createSeedState, STORAGE_KEY } from "../../src/lib/store";

/**
 * 사용설명서 그림 9장(가입 1장 + 장마다 2장씩 8장). 지금 /guide는 화면 모형 시연(guide-demo-screens.tsx)을 쓰고, 이 그림 중 셋은 첫 실행 안내가 쓴다.
 * 로컬 모드(브라우저 localStorage)에 가짜 예시 데이터만 깔고 찍는다.
 * 실제 계정·고객·Supabase는 쓰지 않으며, 로그인 화면은 가짜 프로젝트 주소로 hosted 화면만 띄우고
 * supabase.co로 가는 요청은 모두 끊는다. Google 버튼은 누르지 않는다.
 * 그림마다 누를 곳을 annotate()로 표시하고, 필요한 부분만 잘라 저장한다.
 * 설명서는 한 화면에 한 단계씩 보여서, 그림 한 장이 휴대폰 한 화면 안(2배율 750×1100px 이하)에 들어가야 한다.
 * 긴 화면은 필요한 조각만 찍어 위아래로 잇고, 건너뛴 자리에 물결 띠를 넣는다(shoot → saveImage).
 * 실행: NEXT_PUBLIC_STORAGE_MODE=local npm run build 뒤 npx playwright test -c playwright.guide.config.ts
 */
const DATE = "2026-10-30";
const OUTPUT = resolve(process.cwd(), "public/guide");
const PLACEHOLDER_SUPABASE = "https://aaaaaaaaaaaaaaaaaaaa.supabase.co";
/** 캡처 서버 주소(127.0.0.1) 대신 보여 줄 실제 서비스 주소 형태. 토큰은 가짜 예시 값 그대로다. */
const SERVICE_ORIGIN = "https://ilgam.studioyeolmae.com";
/** 휴대폰 상단 바(58px) 아래로 장면을 올려 둔다. */
const TOP_BAR = 58;
/** 휴대폰 하단 메뉴(70px)와 그 위에 붙는 바(일감 완료·일감 만들기) 자리. 장면이 이 아래로 들어가지 않게 화면을 늘린다. */
const BOTTOM_BARS = 150;
/**
 * 누를 곳 표시 색. 디자인 A로 화면이 파래져서 파랑·흑연 표시는 묻힌다. 화면에 없는 주황으로 눈에 띄게 하고,
 * 흰 테두리를 둘러 파랑 버튼 위에서도 구분되게 한다(2026-11-04 사용자 지시). 주황은 그림 속 표시에만 쓴다.
 */
const MARK = "#ff6b00";
/** 그림 한 장의 최대 높이(2배율 px). 휴대폰 한 화면에 제목·그림·'다음' 버튼이 같이 들어가는 크기. */
const MAX_IMAGE_HEIGHT = 1100;
/** 조각 사이에 넣는 '건너뜀' 띠 높이(CSS px). */
const CUT_BAND = 14;
const CANVAS = "#f2f4f6";
const CUT_LINE = "#b8bfc7";

test.use({ timezoneId: "Asia/Seoul", locale: "ko-KR" });

// 예시 STANDARD 로고 패키지는 받을 자료만 있다. 설명서에서는 착수 전 질문까지 넣은 패키지를 쓴다.
const PACKAGES = SAMPLE_PACKAGES.map((item) =>
  item.id === "pkg_sample_logo_standard" ? { ...item, briefQuestions: [...DEFAULT_BRIEF_QUESTIONS] } : item,
);
const STANDARD = PACKAGES[1];
const PENDING_REVISION_ID = "revision_sample_second";
const DRAFT_ADDON_ID = "addon_sample_card";

function shiftDate(isoDate: string, delta: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** 오늘 막 만든 예시 주문(크몽에서 받음). 저장 직후 안내를 찍는다. */
function freshOrder(): Job {
  return composeJob({
    jobId: SAMPLE_ORDER_ID,
    revisionPortalToken: SAMPLE_PORTAL_TOKEN,
    clientLabel: SAMPLE_CLIENT_LABEL,
    title: SAMPLE_ORDER_TITLE,
    startDate: DATE,
    package: STANDARD,
    options: [SAMPLE_OPTIONS[0]],
    source: "kmong",
    now: `${DATE}T02:00:00.000Z`,
  });
}

/**
 * 사흘째 진행 중인 예시 주문(sample-order.ts): 1회차는 '수정 완료'로 썼고, 받을 자료 1개를 받았다. 질문 답은 아직이다.
 * 오늘 고객이 링크로 남긴 요청 1건이 확인 대기이고, 범위 밖 요청은 추가요청 초안 1건으로 적어 뒀다.
 * 시작 안내는 만든 날 보냈다(그래서 '고객에게 보낼 말'은 설계 순서로 고른다).
 */
function progressedOrder(): Job {
  const sample = createSampleOrder(DATE);
  const startDate = shiftDate(DATE, -3);
  let job: Job = {
    ...sample,
    source: "kmong",
    briefQuestions: DEFAULT_BRIEF_QUESTIONS.map((question, index) => ({ id: `${SAMPLE_ORDER_ID}_brief_${index + 1}`, question })),
  };
  job = markStartShared(job, `${startDate}T02:05:00.000Z`);
  job = recordRevision(job, {
    source: "public",
    clientLabel: SAMPLE_CLIENT_LABEL,
    body: "로고 글자 색을 조금 더 진하게 해 주세요.",
    revisionId: PENDING_REVISION_ID,
    submittedAt: `${DATE}T01:40:00.000Z`,
  }).job;
  const addon = createAddon(job, {
    addonId: DRAFT_ADDON_ID,
    title: "명함 디자인 추가",
    amountDelta: 80_000,
    estimatedCostDelta: 10_000,
    durationDaysDelta: 2,
    tasks: [{ taskKey: "card-extra", title: "명함 시안 공유", relativeDay: 9, order: 0 }],
    createdAt: `${DATE}T02:10:00.000Z`,
  });
  return { ...job, addons: [addon] };
}

/** 이번 달에 끝낸 예시 주문(숨고에서 받음). 월별 정리에 들어간다. 완료하면 고객 링크도 닫힌다(앱과 같음). */
function completedOrder(): Job {
  const job = composeJob({
    jobId: "job_sample_flower_logo",
    revisionPortalToken: "sample-flower-logo-guide",
    clientLabel: "예시 꽃집",
    title: "예시 꽃집 로고 디자인",
    startDate: "2026-10-12",
    package: PACKAGES[0],
    source: "soomgo",
    now: "2026-10-12T01:00:00.000Z",
  });
  return { ...toggleJobCompletion(job, "2026-10-20T08:00:00.000Z"), revisionPortalEnabled: false };
}

function guideState(order: Job) {
  const state = createSeedState(DATE);
  state.packages = PACKAGES;
  state.options = SAMPLE_OPTIONS;
  state.jobs = [order, completedOrder()];
  state.jobsCreatedTotal = state.jobs.length;
  state.trialStartedAt = `${DATE}T00:00:00.000Z`;
  return state;
}

async function seedStorage(page: Page, order: Job) {
  const payload = JSON.stringify(guideState(order));
  await page.addInitScript(([key, value]) => {
    localStorage.clear();
    localStorage.setItem(key, value);
  }, [STORAGE_KEY, payload] as const);
}

/**
 * 장면(여러 대상을 합친 영역)을 상단 바 바로 아래로 올린다. 화면에 다 안 들어가면 휴대폰 화면 높이를 늘려
 * 아래쪽 하단 메뉴·바가 장면을 덮지 않게 한다(폭은 그대로라 화면 배치는 같다).
 */
async function frame(page: Page, region: string[], options: { top?: number } = {}) {
  const top = options.top ?? TOP_BAR + 16;
  for (const selector of region) await expect(page.locator(selector).first()).toBeVisible();
  let box = await regionBox(page, region);
  const viewport = page.viewportSize()!;
  const needed = Math.ceil(top + box.height + 40 + BOTTOM_BARS);
  if (needed > viewport.height) {
    await page.setViewportSize({ width: viewport.width, height: needed });
    box = await regionBox(page, region);
  }
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, box.top + scrollY - top));
  await page.waitForTimeout(250);
}

/** 대상들(과 그려 둔 표시)을 감싸는 화면 기준 영역. */
async function regionBox(page: Page, region: string[]) {
  return page.evaluate((selectors) => {
    const rects = selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`영역 대상이 없어요: ${selector}`);
      return element.getBoundingClientRect();
    });
    for (const mark of Array.from(document.querySelectorAll("[data-guide-mark]"))) rects.push(mark.getBoundingClientRect());
    const top = Math.min(...rects.map((rect) => rect.top));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    return { top, bottom, height: bottom - top };
  }, region);
}

/**
 * 누를 곳 표시. 대상 둘레에 주황 4px 테두리(안팎으로 흰 2px)와 주황 번호 동그라미를 문서 위 절대 위치로 그린다.
 * 화면에 붙은(fixed·sticky) 바 안의 대상은 화면 기준으로 그린다. 찍은 뒤 shoot()가 지운다.
 */
/**
 * badge: "side"면 번호를 테두리 왼쪽 위 모서리에 두지 않는다(조각으로 자를 때 테두리 위로 튀어나와 윗줄 글이 잘려 보이지 않게).
 */
async function annotate(page: Page, marks: Array<{ selector: string; n: number }>, options: { badge?: "corner" | "side" } = {}) {
  for (const mark of marks) await expect(page.locator(mark.selector).first()).toBeVisible();
  await page.evaluate(([items, ink, side]) => {
    const pageWidth = document.documentElement.clientWidth;
    const gap = 6;
    const badgeSize = 30;
    for (const { selector, n } of items) {
      const target = document.querySelector(selector);
      if (!target) throw new Error(`표시할 대상이 없어요: ${selector}`);
      let pinned = false;
      for (let element: Element | null = target; element; element = element.parentElement) {
        const position = getComputedStyle(element).position;
        if (position === "fixed" || position === "sticky") {
          pinned = true;
          break;
        }
      }
      const rect = target.getBoundingClientRect();
      const offsetX = pinned ? 0 : window.scrollX;
      const offsetY = pinned ? 0 : window.scrollY;
      const left = Math.max(3, rect.left - gap);
      const right = Math.min(pageWidth - 3, rect.right + gap);
      const top = rect.top - gap;
      const ring = document.createElement("div");
      ring.dataset.guideMark = "ring";
      Object.assign(ring.style, {
        position: pinned ? "fixed" : "absolute",
        left: `${left + offsetX}px`,
        top: `${top + offsetY}px`,
        width: `${right - left}px`,
        height: `${rect.height + gap * 2}px`,
        boxSizing: "border-box",
        border: `4px solid ${ink}`,
        borderRadius: "12px",
        boxShadow: "0 0 0 2px #fff, inset 0 0 0 2px #fff",
        pointerEvents: "none",
        zIndex: "2147483646",
      });
      // 번호 자리: 테두리 왼쪽 바깥(세로 가운데) → 테두리 왼쪽 위 모서리 → 테두리 왼쪽 변에 걸치기 순으로,
      // 다른 버튼·글을 가리지 않는 첫 자리를 쓴다.
      const busyAt = (x: number, y: number) => {
        const hit = document.elementFromPoint(x, y);
        // 표시하는 대상 자신(의 모서리)은 가려도 된다.
        if (!hit || target.contains(hit)) return false;
        const control = hit.closest("button, a, input, textarea, select, label, [role=button]");
        if (control && !control.contains(target)) return true;
        return Array.from(hit.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()));
      };
      const free = (x: number, y: number) =>
        x >= 2 && x + badgeSize <= pageWidth - 2 && y >= 0 &&
        ![[x + badgeSize / 2, y + badgeSize / 2], [x + 3, y + 3], [x + badgeSize - 3, y + 3], [x + 3, y + badgeSize - 3], [x + badgeSize - 3, y + badgeSize - 3]]
          .some(([px, py]) => busyAt(px, py));
      const middle = top + (rect.height + gap * 2) / 2 - badgeSize / 2;
      const spots: Array<[number, number]> = [
        [left - badgeSize - 2, middle],
        ...(side ? [] : [[left - badgeSize / 2, top - badgeSize / 2] as [number, number]]),
      ];
      const [badgeLeft, badgeTop] = spots.find(([x, y]) => free(x, y))
        ?? [Math.min(Math.max(2, left - badgeSize / 2), pageWidth - badgeSize - 2), middle];
      const badge = document.createElement("div");
      badge.dataset.guideMark = "badge";
      badge.textContent = String(n);
      Object.assign(badge.style, {
        position: pinned ? "fixed" : "absolute",
        left: `${badgeLeft + offsetX}px`,
        top: `${badgeTop + offsetY}px`,
        width: `${badgeSize}px`,
        height: `${badgeSize}px`,
        boxSizing: "border-box",
        display: "grid",
        placeItems: "center",
        color: "#fff",
        background: ink,
        border: "2.5px solid #fff",
        borderRadius: "50%",
        boxShadow: "0 1px 3px rgb(0 0 0 / 30%)",
        font: "800 16px/1 Pretendard, system-ui, sans-serif",
        fontVariantNumeric: "tabular-nums",
        pointerEvents: "none",
        zIndex: "2147483647",
      });
      document.body.append(ring, badge);
    }
  }, [marks, MARK, options.badge === "side"] as const);
}

type Pad = number | { top: number; bottom: number };

/** 장면 영역과 표시를 감싸는 부분만 휴대폰 폭 그대로 잘라 PNG로 돌려주고 표시를 지운다. */
async function shoot(page: Page, region: string[], pad: Pad = 14): Promise<Buffer> {
  const viewport = page.viewportSize()!;
  const box = await regionBox(page, region);
  const { top: padTop, bottom: padBottom } = typeof pad === "number" ? { top: pad, bottom: pad } : pad;
  const top = Math.max(0, Math.floor(box.top - padTop));
  const bottom = Math.min(viewport.height, Math.ceil(box.bottom + padBottom));
  const png = await page.screenshot({
    caret: "initial",
    animations: "disabled",
    clip: { x: 0, y: top, width: viewport.width, height: bottom - top },
  });
  await page.evaluate(() => document.querySelectorAll("[data-guide-mark]").forEach((element) => element.remove()));
  return png;
}

/** 조각 사이 '건너뜀' 띠: canvas 면에 물결선 하나. 화면 일부를 뺐다는 표시다. */
function cutBand(width: number, height: number): Buffer {
  const mid = height / 2;
  const step = 12;
  let path = `M0 ${mid}`;
  for (let x = 0; x < width; x += step * 2) path += ` q${step / 2} -6 ${step} 0 t${step} 0`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${CANVAS}"/><path d="${path}" fill="none" stroke="${CUT_LINE}" stroke-width="3" stroke-linecap="round"/></svg>`,
  );
}

/** 조각들을 위아래로 이어(사이에 건너뜀 띠) webp로 저장한다. 휴대폰 한 화면 높이를 넘으면 실패시킨다. */
async function saveImage(name: string, pieces: Buffer[]) {
  mkdirSync(OUTPUT, { recursive: true });
  const metas = await Promise.all(pieces.map((piece) => sharp(piece).metadata()));
  const width = metas[0].width!;
  const scale = Math.round(width / 375);
  const band = CUT_BAND * scale;
  const height = metas.reduce((sum, meta) => sum + meta.height!, 0) + band * (pieces.length - 1);
  const layers: OverlayOptions[] = [];
  let y = 0;
  pieces.forEach((piece, index) => {
    if (index > 0) {
      layers.push({ input: cutBand(width, band), top: y, left: 0 });
      y += band;
    }
    layers.push({ input: piece, top: y, left: 0 });
    y += metas[index].height!;
  });
  const output = resolve(OUTPUT, `${name}.webp`);
  const info = await sharp({ create: { width, height, channels: 3, background: CANVAS } })
    .composite(layers)
    .webp({ quality: 82 })
    .toFile(output);
  // 찍은 크기를 알려 준다. first-run-checklist.tsx의 width·height를 이 값으로 맞춘다(설명서 /guide는 그림 대신 움직이는 시연을 쓴다).
  console.log(`[guide] ${name}.webp ${info.width}x${info.height} (조각 ${pieces.map((_, index) => metas[index].height).join("+")})`);
  expect(info.height, `${name}은 휴대폰 한 화면(${MAX_IMAGE_HEIGHT}px) 안이어야 해요`).toBeLessThanOrEqual(MAX_IMAGE_HEIGHT);
}

/** 한 조각만 찍어 바로 저장한다. */
async function save(page: Page, name: string, region: string[], pad: Pad = 14) {
  await saveImage(name, [await shoot(page, region, pad)]);
}

/** 주소를 실제 서비스 주소 형태로 바꿔 보여 준다(글만 바꾸고 화면 크기는 그대로). */
async function showServiceOrigin(page: Page, selector: string) {
  await page.locator(selector).evaluate((element, origin) => {
    element.textContent = (element.textContent ?? "").replace(/https?:\/\/[^/\s]+/g, origin);
  }, SERVICE_ORIGIN);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${DATE}T03:00:00Z`));
  await page.route(/supabase\.co/, (route) => route.abort());
});

test("가입 화면", async ({ page }) => {
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
  const region = [".authCard .authHeading", ".authCard .authForm"];
  await frame(page, region, { top: 24 });
  await annotate(page, [{ selector: ".authCard .authForm .authPrimary", n: 1 }]);
  await save(page, "01-signup", region, 10);
});

test.describe("주문 등록", () => {
  test.beforeEach(async ({ page }) => {
    await seedStorage(page, progressedOrder());
  });

  test("패키지 한 번 저장", async ({ page }) => {
    await page.goto("/packages");
    await page.locator(".catalogListItem").filter({ hasText: "STANDARD 로고" }).click();
    await expect(page.locator(".catalogEditorHead h2")).toHaveText("STANDARD 로고");
    // 받을 자료 칸과 착수 전 질문 첫 칸까지 찍고, 나머지 질문·할 일 목록은 건너뛰어 저장 버튼을 잇는다.
    const firstQuestion = "[data-testid=package-brief-questions] textarea";
    const fields = ["label:has([data-testid=package-intake-items])", firstQuestion];
    await frame(page, fields);
    await annotate(page, [
      { selector: "[data-testid=package-intake-items]", n: 1 },
      { selector: firstQuestion, n: 2 },
    ]);
    const top = await shoot(page, fields, { top: 10, bottom: 0 });
    const actions = ["[data-testid=save-package]"];
    await frame(page, actions);
    await annotate(page, [{ selector: "[data-testid=save-package]", n: 3 }], { badge: "side" });
    await saveImage("02-packages", [top, await shoot(page, actions, { top: 3, bottom: 12 })]);
  });

  test("주문 오면 네 가지 고르기", async ({ page }) => {
    await page.goto("/jobs/new");
    await page.locator("#clientLabel").fill(SAMPLE_CLIENT_LABEL);
    // 받은 곳은 비어 있고 지난번 받은 곳(크몽)이 힌트로 보인다. 그림에는 크몽을 골라 둔다.
    await expect(page.getByTestId("order-source-hint")).toHaveText("지난번: 크몽");
    await page.getByTestId("order-source-kmong").click();
    await expect(page.getByTestId("order-source-kmong")).toHaveAttribute("aria-pressed", "true");
    await page.locator("label.packageChoice").filter({ hasText: "STANDARD 로고" }).click();
    await page.locator("label.optionChoice").filter({ hasText: "원본 파일" }).click();
    await page.locator("#clientLabel").blur();
    // 누를 곳 다섯 군데만 칸 위주로 차례로 찍어 잇는다(한 화면 높이 안에 들게 칸 제목 줄은 뺌): 고객 이름 / 시작일 / 고른 패키지 / 고른 옵션 /
    // 금액·마감이 채워진 '일감 만들기' 바(화면 아래 고정). 받은 곳 칩·다른 패키지는 건너뛴다.
    const pieces: Buffer[] = [];
    const steps: Array<{ region: string[]; mark: string; n: number }> = [
      { region: ["#clientLabel"], mark: "#clientLabel", n: 1 },
      { region: ["#startDate"], mark: "#startDate", n: 2 },
      { region: ["label.packageChoice[data-selected=true]"], mark: "label.packageChoice[data-selected=true]", n: 3 },
      { region: ["label.optionChoice[data-selected=true]"], mark: "label.optionChoice[data-selected=true]", n: 4 },
    ];
    for (const step of steps) {
      await frame(page, step.region);
      await annotate(page, [{ selector: step.mark, n: step.n }], { badge: "side" });
      pieces.push(await shoot(page, step.region, 3));
    }
    const bar = ".mobileSubmitBar";
    await expect(page.locator(bar)).toBeVisible();
    await annotate(page, [{ selector: "[data-testid=submit-job-mobile]", n: 5 }], { badge: "side" });
    pieces.push(await shoot(page, [bar], 0));
    await saveImage("03-new-job", pieces);
  });
});

test.describe("시작 안내 한 방", () => {
  test("카톡 문구 하나 복사", async ({ page }) => {
    await seedStorage(page, freshOrder());
    // 저장 직후 화면(?created=1)의 "이제 고객에게 보내세요" 안내를 찍는다.
    await page.goto(`/jobs/${SAMPLE_ORDER_ID}?created=1`);
    const banner = "[data-testid=send-to-client-banner]";
    await expect(page.locator(banner)).toBeVisible();
    // 로컬 모드에서만 나오는 "이 브라우저에서만 열려요" 안내는 실제 로그인 사용자 화면에 없으므로 가린다.
    await page.locator(`${banner} [data-local-only]`).evaluate((element) => { (element as HTMLElement).style.display = "none"; });
    // 띠에는 주소 칸이 없다(복사가 막혔을 때만 보임). 말풍선 문구 안의 주소를 바꾼다.
    await showServiceOrigin(page, "[data-testid=send-message-preview]");
    // 말풍선은 휴대폰에서 160px까지 보이고 안에서 스크롤된다. 받을 자료·질문이 보이게 그 줄부터 보여 준다.
    await page.getByTestId("send-message-preview").evaluate((element) => {
      const node = element.firstChild;
      const index = node?.textContent?.indexOf("[보내 주실 자료]") ?? -1;
      if (!node || index < 0) throw new Error("말풍선에 받을 자료 줄이 없어요");
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      // 윗줄이 반쯤 걸쳐 보이지 않게 그 줄을 말풍선 안쪽 맨 위에 붙인다.
      element.scrollTop += range.getBoundingClientRect().top - (element.getBoundingClientRect().top + element.clientTop);
    });
    await frame(page, [banner]);
    await annotate(page, [{ selector: "[data-testid=send-copy-message]", n: 1 }]);
    await save(page, "04-send-message", [banner]);
  });

  test("답·자료 오면 체크", async ({ page }) => {
    await seedStorage(page, progressedOrder());
    await page.goto(`/jobs/${SAMPLE_ORDER_ID}`);
    const intake = ["[data-testid=intake-section]"];
    await frame(page, intake);
    await annotate(page, [{ selector: `[data-testid=intake-toggle-${SAMPLE_ORDER_ID}_intake_2]`, n: 1 }]);
    const first = await shoot(page, intake, { top: 14, bottom: 3 });
    // 착수 전 질문은 머리와 첫 질문(답 메모 칸 포함)까지만.
    const brief = ["[data-testid=brief-section] .sectionHeadingRow", `li.briefItem:has([data-testid=brief-toggle-${SAMPLE_ORDER_ID}_brief_1])`];
    await frame(page, brief);
    await annotate(page, [{ selector: `[data-testid=brief-toggle-${SAMPLE_ORDER_ID}_brief_1]`, n: 2 }]);
    await saveImage("05-checklist", [first, await shoot(page, brief, { top: 14, bottom: 3 })]);
  });
});

test.describe("수정 범위 정리 · 더 편하게", () => {
  test.beforeEach(async ({ page }) => {
    await seedStorage(page, progressedOrder());
  });

  test("요청은 확인 대기 → 수정 완료 때 1회", async ({ page }) => {
    await page.goto(`/jobs/${SAMPLE_ORDER_ID}`);
    await frame(page, ["#revisions"]);
    await annotate(page, [{ selector: `[data-testid=complete-revision-${PENDING_REVISION_ID}]`, n: 1 }]);
    await save(page, "06-revisions", ["#revisions"]);
  });

  test("범위 밖은 추가요청", async ({ page }) => {
    await page.goto(`/jobs/${SAMPLE_ORDER_ID}`);
    await frame(page, [".addonSection"]);
    await annotate(page, [
      { selector: "[data-testid=open-addon]", n: 1 },
      { selector: `[data-testid=confirm-addon-${DRAFT_ADDON_ID}]`, n: 2 },
    ]);
    await save(page, "07-addon", [".addonSection"]);
  });

  test("상황별 보낼 말", async ({ page }) => {
    await page.goto(`/jobs/${SAMPLE_ORDER_ID}`);
    const section = "[data-testid=client-messages]";
    await page.getByTestId("client-message-chip-review").click();
    await expect(page.getByTestId("client-message-chip-review")).toHaveAttribute("aria-pressed", "true");
    await showServiceOrigin(page, "[data-testid=client-message-preview]");
    // 미리보기 칸은 화면에서 안쪽 스크롤이라 그대로 찍으면 문구 끝(고객 링크)이 잘린다. 그림에서만 칸을 펼쳐 문구 전체를 보여 준다.
    await page.getByTestId("client-message-preview").evaluate((element) => { const box = element as HTMLElement; box.style.maxHeight = "none"; box.style.height = "auto"; box.style.overflow = "visible"; });
    await frame(page, [section]);
    await annotate(page, [
      { selector: "[data-testid=client-message-chip-review]", n: 1 },
      { selector: "[data-testid=client-message-copy]", n: 2 },
    ]);
    await save(page, "08-messages", [section]);
  });

  test("월별 정리", async ({ page }) => {
    await page.goto("/jobs/summary");
    await expect(page.getByTestId("summary-month-title")).toHaveText("2026년 10월");
    await expect(page.getByTestId("summary-total-count")).toHaveText("1건");
    // 달 이동 줄은 빼고(내려받기 버튼에 달이 보임) 합계·내려받기, 받은 곳별을 잇는다.
    const totals = [".summaryTotals", "[data-testid=summary-download-month]"];
    await frame(page, totals);
    await annotate(page, [{ selector: "[data-testid=summary-download-month]", n: 1 }]);
    const first = await shoot(page, totals, { top: 14, bottom: 2 });
    const sources = ["#summary-source-title", "[data-testid=summary-source-soomgo]"];
    await frame(page, sources);
    await saveImage("09-monthly", [first, await shoot(page, sources)]);
  });
});
