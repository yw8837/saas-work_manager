import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PLAN_LIMITS } from "@/lib/domain";
import { MarketingHome } from "./marketing-home";
import { GUIDE_STEPS, UserGuide } from "./user-guide";

describe("랜딩 히어로", () => {
  it("보조 버튼은 가입 없이 고객 화면 체험으로 간다", () => {
    render(<MarketingHome />);
    const demo = screen.getByTestId("landing-customer-demo");
    expect(demo).toHaveAttribute("href", "/demo/r");
    expect(demo).toHaveTextContent("가입 없이 고객 화면 체험");
    expect(demo.closest(".heroActions")).not.toBeNull();
  });

  it("CTA 아래 안심 줄은 사실만, 무료 한도는 플랜 값 그대로", () => {
    render(<MarketingHome />);
    const reassure = screen.getByRole("list", { name: "시작 조건" });
    const items = within(reassure).getAllByRole("listitem").map((item) => item.textContent?.trim());
    expect(items).toEqual([
      "Google 계정으로 가입",
      "카드 등록 없음",
      `무료로 동시 ${PLAN_LIMITS.free.activeJobs}건 · 누적 ${PLAN_LIMITS.free.totalJobs}건`,
    ]);
  });
});

describe("그림 사용설명서", () => {
  it("맨 위 6칸 단계 띠가 각 단계로 이어진다", () => {
    render(<UserGuide />);
    const strip = screen.getByRole("navigation", { name: "여섯 단계 한눈에 보기" });
    const links = within(strip).getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(GUIDE_STEPS.map((step) => `#${step.id}`));
    for (const step of GUIDE_STEPS) expect(document.getElementById(step.id)).not.toBeNull();
  });

  it("단계마다 직접 해보기 버튼이 있다", () => {
    render(<UserGuide />);
    for (const step of GUIDE_STEPS) {
      expect(screen.getByTestId(`guide-try-${step.id}`)).toHaveAttribute("href", step.tryIt.href);
    }
    expect(screen.getByTestId("guide-try-send-link")).toHaveAttribute("href", "/demo/r");
  });
});
