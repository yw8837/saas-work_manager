import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BETA_OFFER_TEXT, FREE_PLAN_TEXT, SIGNUP_START_HREF } from "@/lib/signup-start";
import { GUIDE_STEPS, UserGuide } from "./user-guide";

const TOTAL = GUIDE_STEPS.length;

function progress() {
  return screen.getByTestId("guide-progress").textContent?.replace(/\s+/g, " ").trim();
}

function next() {
  fireEvent.click(screen.getByTestId("guide-next"));
}

describe("한 장씩 보는 사용설명서", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/guide");
  });
  afterEach(() => {
    window.history.replaceState(null, "", "/guide");
  });

  it("단계는 흐름도 → 가입 → 그림 8장 순서로 10개다", () => {
    expect(TOTAL).toBe(10);
    expect(GUIDE_STEPS.map((step) => step.id)).toEqual([
      "flow", "signup", "packages", "new-job", "send-message", "check-answers", "revisions", "addon", "messages", "monthly",
    ]);
    expect(GUIDE_STEPS[0].image).toBeUndefined();
    for (const step of GUIDE_STEPS.slice(1)) expect(step.image, step.id).toBeDefined();
  });

  it("한 화면에 한 단계만 보이고, 진행 표시는 '1 / 10'과 막대로 보인다", () => {
    render(<UserGuide />);
    expect(screen.getAllByTestId("guide-step")).toHaveLength(1);
    expect(progress()).toBe(`1 / ${TOTAL}`);
    const bar = screen.getByRole("progressbar", { name: "설명서 진행" });
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemax", String(TOTAL));
    expect(screen.getByTestId("work-flow-chart")).toBeInTheDocument();
    expect(document.images).toHaveLength(0);
  });

  it("'다음'을 누르면 같은 자리에서 다음 단계로 바뀌고 주소에 단계 번호가 남는다", () => {
    render(<UserGuide />);
    next();
    expect(progress()).toBe(`2 / ${TOTAL}`);
    expect(screen.getByTestId("guide-step-title")).toHaveTextContent(GUIDE_STEPS[1].title);
    expect(within(screen.getByTestId("guide-step")).getByRole("img")).toHaveAttribute("src", GUIDE_STEPS[1].image!.src);
    expect(window.location.pathname).toBe("/guide");
    expect(window.location.hash).toBe("#step-2");
    fireEvent.click(screen.getByTestId("guide-prev"));
    expect(progress()).toBe(`1 / ${TOTAL}`);
    expect(window.location.hash).toBe("#step-1");
  });

  it("단계가 바뀌면 낭독기에 'n/10 단계'와 제목을 알린다", () => {
    render(<UserGuide />);
    const live = screen.getByTestId("guide-live");
    expect(live).toHaveAttribute("aria-live", "polite");
    next();
    next();
    expect(live).toHaveTextContent(`3/${TOTAL} 단계, ${GUIDE_STEPS[2].title}`);
  });

  it("첫 단계의 '이전'은 눌러도 그대로이고(aria-disabled), 포커스는 버튼에 남는다", () => {
    render(<UserGuide />);
    const prev = screen.getByTestId("guide-prev");
    expect(prev).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(prev);
    expect(progress()).toBe(`1 / ${TOTAL}`);
    next();
    expect(screen.getByTestId("guide-prev")).toHaveAttribute("aria-disabled", "false");
  });

  it("데스크톱은 ←/→ 키로 넘긴다(입력 칸 안에서는 넘기지 않는다)", () => {
    render(<UserGuide />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(progress()).toBe(`3 / ${TOTAL}`);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(progress()).toBe(`2 / ${TOTAL}`);
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    expect(progress()).toBe(`2 / ${TOTAL}`);
  });

  it("휴대폰은 좌우로 밀어 넘기고, 위아래로 민 것은 넘기지 않는다", () => {
    render(<UserGuide />);
    // 단계가 바뀌면 단계 구획을 새로 그리므로 밀 때마다 다시 찾는다.
    const swipe = (fromX: number, toX: number, fromY = 300, toY = 300) => {
      const stage = screen.getByTestId("guide-step");
      fireEvent.touchStart(stage, { touches: [{ clientX: fromX, clientY: fromY }] });
      fireEvent.touchEnd(stage, { changedTouches: [{ clientX: toX, clientY: toY }] });
    };
    swipe(300, 120);
    expect(progress()).toBe(`2 / ${TOTAL}`);
    swipe(100, 300);
    expect(progress()).toBe(`1 / ${TOTAL}`);
    swipe(200, 230, 500, 120);
    expect(progress()).toBe(`1 / ${TOTAL}`);
  });

  it("주소의 단계 번호로 새로고침해도 그 단계가 열리고, 이상한 번호면 첫 단계다", () => {
    window.history.replaceState(null, "", "/guide#step-4");
    const { unmount } = render(<UserGuide />);
    expect(progress()).toBe(`4 / ${TOTAL}`);
    expect(screen.getByTestId("guide-step-title")).toHaveTextContent(GUIDE_STEPS[3].title);
    unmount();
    window.history.replaceState(null, "", "/guide#step-99");
    render(<UserGuide />);
    expect(progress()).toBe(`1 / ${TOTAL}`);
  });

  it("주소 단계 번호를 바꾸면(hashchange) 그 단계로 간다", () => {
    render(<UserGuide />);
    act(() => {
      window.history.replaceState(null, "", "/guide#step-7");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(progress()).toBe(`7 / ${TOTAL}`);
  });

  it("중간 단계에는 '직접 해 보기'·장 목록 띠·가입 버튼이 없고, 마지막 단계에만 '무료로 시작하기'와 '고객이 받는 화면 체험'이 있다", () => {
    render(<UserGuide />);
    for (let index = 0; index < TOTAL - 1; index += 1) {
      expect(screen.queryByRole("link", { name: /직접 해 보기/ })).toBeNull();
      expect(screen.queryByRole("navigation", { name: "네 장 한눈에 보기" })).toBeNull();
      expect(screen.queryByTestId("guide-start")).toBeNull();
      expect(screen.queryByTestId("guide-demo-link")).toBeNull();
      expect(screen.getByTestId("guide-next")).toHaveTextContent("다음");
      next();
    }
    expect(progress()).toBe(`${TOTAL} / ${TOTAL}`);
    expect(screen.queryByTestId("guide-next")).toBeNull();
    const start = screen.getByTestId("guide-start");
    expect(start).toHaveTextContent("무료로 시작하기");
    expect(start).toHaveAttribute("href", SIGNUP_START_HREF);
    expect(start).toHaveClass("primaryButton");
    const demo = screen.getByTestId("guide-demo-link");
    expect(demo).toHaveTextContent("고객이 받는 화면 체험");
    expect(demo).toHaveAttribute("href", "/demo/r");
    expect(demo).toHaveClass("secondaryButton");
    // 단계 버튼 줄의 시작 버튼은 하나(머리글의 '무료로 시작하기'는 따로 늘 있다).
    expect(within(screen.getByRole("navigation", { name: "단계 이동" })).getAllByRole("link", { name: "무료로 시작하기" })).toHaveLength(1);
    // 시작 버튼 바로 위에 베타 코드·무료 범위 안내가 있다.
    expect(screen.getByTestId("guide-offer")).toHaveTextContent(BETA_OFFER_TEXT);
    expect(screen.getByTestId("guide-offer")).toHaveTextContent(FREE_PLAN_TEXT);
    // 마지막 단계에서 오른쪽으로 더 넘겨도 그대로다.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(progress()).toBe(`${TOTAL} / ${TOTAL}`);
    // 구현된 것과 아직 안 되는 것을 섞지 않는다. 마지막 단계에 남긴다.
    expect(screen.getByTestId("guide-not-yet")).toHaveTextContent("자동으로 가져오지 않아요");
  });

  it("머리글에 눈에 띄는 '무료로 시작하기'(베타 코드 주소)와 그 옆 글자 링크 '로그인'이 있다", () => {
    render(<UserGuide />);
    const nav = screen.getByRole("navigation", { name: "설명서 메뉴" });
    const start = within(nav).getByTestId("guide-header-start");
    expect(start).toHaveTextContent("무료로 시작하기");
    expect(start).toHaveAttribute("href", SIGNUP_START_HREF);
    // 버튼 모양(연한 파랑)이지만 파랑 채움 주 버튼은 아니다. 단계마다 주 버튼은 하나(work-flow-chart.test.tsx).
    expect(start).toHaveClass("guideHeaderStart");
    expect(start).not.toHaveClass("primaryButton");
    const login = within(nav).getByTestId("guide-header-login");
    expect(login).toHaveTextContent("로그인");
    // 로그인은 기존 사용자용이라 베타 코드를 붙이지 않는다.
    expect(login).toHaveAttribute("href", "/today");
    expect(login).not.toHaveClass("primaryButton");
    // 어느 단계에서든 머리글 시작 버튼은 그대로다.
    next();
    expect(within(screen.getByRole("navigation", { name: "설명서 메뉴" })).getByTestId("guide-header-start")).toHaveAttribute("href", SIGNUP_START_HREF);
  });

  it("첫 단계에 '가입 없이 둘러보기'(/try) 링크가 있고, 다음 단계부터는 없다", () => {
    render(<UserGuide />);
    const link = within(screen.getByTestId("guide-step")).getByTestId("guide-try");
    expect(link).toHaveTextContent("가입 없이 둘러보기");
    expect(link).toHaveAttribute("href", "/try");
    next();
    expect(screen.queryByTestId("guide-try")).toBeNull();
  });

  it("제목은 짧게(16자 이하), 설명은 한 줄(36자 이하), 그림에는 설명(alt)이 있다", () => {
    for (const step of GUIDE_STEPS) {
      expect(step.title.length, step.title).toBeLessThanOrEqual(16);
      expect(step.caption.length, step.caption).toBeLessThanOrEqual(36);
      if (step.image) {
        expect(step.image.alt.trim(), step.id).not.toBe("");
        expect(step.image.alt).not.toMatch(/로그(?!인|아웃)/);
      }
    }
  });

  it("그림은 휴대폰 한 화면 안(750×1100px 이하) 크기이고, 적어 둔 크기와 실제 파일 크기가 같다", async () => {
    for (const step of GUIDE_STEPS) {
      if (!step.image) continue;
      const file = readFileSync(resolve(process.cwd(), "public", step.image.src.replace(/^\//, "")));
      const meta = await sharp(file).metadata();
      expect({ id: step.id, width: meta.width, height: meta.height }).toEqual({ id: step.id, width: step.image.width, height: step.image.height });
      expect(step.image.width, step.id).toBe(750);
      expect(step.image.height, step.id).toBeLessThanOrEqual(1100);
    }
  });

  it("첫 실행 안내(first-run-checklist)가 다시 쓰는 그림도 크기 값이 실제 파일과 같다", async () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/first-run-checklist.tsx"), "utf8");
    const used = Array.from(source.matchAll(/src: "(\/guide\/[^"]+)", width: (\d+), height: (\d+)/g));
    expect(used.length).toBe(3);
    for (const [, src, width, height] of used) {
      const meta = await sharp(readFileSync(resolve(process.cwd(), "public", src.replace(/^\//, "")))).metadata();
      expect({ src, width: Number(width), height: Number(height) }).toEqual({ src, width: meta.width, height: meta.height });
    }
  });
});
