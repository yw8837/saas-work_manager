import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BETA_OFFER_TEXT, FREE_PLAN_TEXT } from "@/lib/signup-start";
import { INDUSTRY_ORDER } from "@/lib/store/industry-starters";
import { IndustryExamples } from "./industry-examples";
import { MarketingHome } from "./marketing-home";
import { TryTour } from "./try-tour";
import { GUIDE_STEPS, UserGuide } from "./user-guide";

/** 화면에서 안내 문장을 뽑는다(span 두 개를 그대로 이어 붙인 글). */
function offerText(testId: string) {
  return screen.getByTestId(testId).textContent?.replace(/\s+/g, " ").trim();
}

const EXPECTED = `${BETA_OFFER_TEXT} ${FREE_PLAN_TEXT}`;

describe("베타 코드·무료 범위 안내는 네 공개 화면에서 같은 문장이다", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("메인: 첫 화면 시작 버튼 바로 아래", () => {
    render(<MarketingHome />);
    expect(offerText("landing-offer")).toBe(EXPECTED);
    const actions = screen.getByTestId("landing-demo").closest(".heroActions")!;
    expect(actions.nextElementSibling).toBe(screen.getByTestId("landing-offer"));
    // 홈에는 시간 숫자를 쓰지 않는다(hosted-entry-safety 시험과 같은 기준).
    expect(document.body.textContent ?? "").not.toMatch(/\d+\s*초/);
  });

  it("둘러보기: 가입 버튼 아래", () => {
    render(<TryTour />);
    expect(offerText("try-offer")).toBe(EXPECTED);
  });

  it("설명서: 끝 단계 시작 버튼 근처(다른 단계에는 없음)", () => {
    window.history.replaceState(null, "", "/guide");
    const { unmount } = render(<UserGuide />);
    expect(screen.queryByTestId("guide-offer")).toBeNull();
    unmount();
    window.history.replaceState(null, "", `/guide#step-${GUIDE_STEPS.length}`);
    render(<UserGuide />);
    expect(offerText("guide-offer")).toBe(EXPECTED);
    expect(document.body.textContent ?? "").not.toMatch(/\d+\s*초/);
  });

  it("예시: 위쪽 안내와 업종마다 '이 예시로 시작하기' 아래", () => {
    render(<IndustryExamples />);
    expect(offerText("examples-offer")).toBe(EXPECTED);
    for (const industry of INDUSTRY_ORDER) {
      expect(within(screen.getByTestId(`examples-${industry}`)).getByTestId(`examples-offer-${industry}`).textContent?.replace(/\s+/g, " ").trim()).toBe(EXPECTED);
    }
  });

  it("전체 인원 한도·'14일 뒤' 이야기·시간 숫자는 안내에 없다", () => {
    expect(EXPECTED).not.toMatch(/500|선착순|14일 뒤|\d+\s*(초|분)/);
  });
});
