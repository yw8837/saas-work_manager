import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SIGNUP_START_HREF } from "@/lib/signup-start";
import { MarketingHome } from "./marketing-home";
import { LANDING_FINAL_CTA_ID, LANDING_HERO_ACTIONS_ID, MarketingStickyStart } from "./marketing-sticky-start";

function place(id: string, top: number, height: number) {
  const element = document.getElementById(id)!;
  element.getBoundingClientRect = () => ({ top, bottom: top + height, left: 0, right: 390, width: 390, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
}

function Page() {
  return (
    <>
      <div id={LANDING_HERO_ACTIONS_ID}>첫 화면 버튼</div>
      <section id={LANDING_FINAL_CTA_ID}>아래 시작 구역</section>
      <MarketingStickyStart href={SIGNUP_START_HREF} />
    </>
  );
}

describe("메인 휴대폰 아래 고정 시작 줄", () => {
  beforeEach(() => {
    // 스크롤 뒤 다음 그리기 때 재는 것을 바로 재도록 바꾼다.
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  const bar = () => screen.getByTestId("landing-sticky-start");
  const scroll = (hero: number, final: number) => {
    place(LANDING_HERO_ACTIONS_ID, hero, 120);
    place(LANDING_FINAL_CTA_ID, final, 300);
    act(() => { fireEvent.scroll(window); });
  };

  it("첫 화면 버튼이 보이는 동안은 숨어 있고(낭독기·탭 이동에서도 빠짐), 위로 지나가면 나타난다", () => {
    render(<Page />);
    scroll(400, 3000);
    expect(bar()).toHaveAttribute("data-visible", "false");
    expect(bar()).toHaveAttribute("aria-hidden", "true");
    expect(bar()).toHaveAttribute("inert");
    expect(screen.queryByRole("link", { name: /무료로 시작하기/ })).toBeNull();

    scroll(-130, 3000);
    expect(bar()).toHaveAttribute("data-visible", "true");
    expect(bar()).not.toHaveAttribute("aria-hidden", "true");
    expect(bar()).not.toHaveAttribute("inert");
    expect(screen.getByRole("link", { name: /무료로 시작하기/ })).toHaveAttribute("href", SIGNUP_START_HREF);
    expect(screen.getByRole("link", { name: "둘러보기" })).toHaveAttribute("href", "/try");
  });

  it("맨 아래 시작 구역이 화면에 들어오면 숨고, 그 구역을 지나 바닥글로 가면 다시 나온다", () => {
    render(<Page />);
    scroll(-500, 500);
    expect(bar()).toHaveAttribute("data-visible", "false");
    scroll(-900, window.innerHeight - 1);
    expect(bar()).toHaveAttribute("data-visible", "false");
    scroll(-1500, -400);
    expect(bar()).toHaveAttribute("data-visible", "true");
  });

  it("메인 화면에 붙어 있고, 시작 버튼은 공용 시작 주소(베타 코드)로 간다", () => {
    render(<MarketingHome />);
    expect(document.getElementById(LANDING_HERO_ACTIONS_ID)).toContainElement(screen.getByTestId("landing-demo"));
    expect(document.getElementById(LANDING_FINAL_CTA_ID)).toContainElement(screen.getByTestId("landing-final-start"));
    expect(screen.getByTestId("landing-sticky-start-button")).toHaveAttribute("href", SIGNUP_START_HREF);
    expect(screen.getByTestId("landing-sticky-try")).toHaveAttribute("href", "/try");
    // 머리글 로그인은 기존 사용자용이라 베타 코드를 붙이지 않는다.
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/today");
  });
});
