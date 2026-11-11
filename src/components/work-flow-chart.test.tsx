import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketingHome } from "./marketing-home";
import { GUIDE_STEPS, UserGuide } from "./user-guide";
import { FLOW_STEPS, WorkFlowChart } from "./work-flow-chart";

describe("주문 하나가 끝나기까지 흐름도", () => {
  it("주문부터 일감 완료까지 순서대로, 누가 할 일인지 칩으로 보인다", () => {
    render(<WorkFlowChart headingId="t" />);
    const chart = screen.getByRole("region", { name: "주문 하나가 끝나기까지" });
    const steps = within(chart).getAllByRole("listitem");
    expect(steps).toHaveLength(FLOW_STEPS.length);
    expect(steps[0]).toHaveTextContent("주문이 와요");
    expect(steps.at(-1)).toHaveTextContent("납품하고 '일감 완료'");
    expect(screen.getByTestId("flow-step-revision")).toHaveTextContent("고객수정 요청");
    expect(screen.getByTestId("flow-step-revision-done")).toHaveTextContent("누를 때 1회를 써요");
  });

  it("자동으로 되는 일은 화면 안에서 채워지는 것만 적고, 자동 전송을 약속하지 않는다", () => {
    render(<WorkFlowChart headingId="t" />);
    const autoText = FLOW_STEPS.map((step) => step.auto ?? "").join(" ");
    expect(autoText).not.toMatch(/자동으로 보내|자동 전송|알림을 보내/);
    expect(screen.getByTestId("flow-step-register")).toHaveTextContent("자동 금액·마감·할 일·수정 횟수가 채워져요");
  });

  it("설명서 첫 단계는 그림보다 먼저 흐름도 요약을 보여 주고, 제목은 단계 제목 하나다", () => {
    window.history.replaceState(null, "", "/guide");
    render(<UserGuide />);
    // 구획 이름은 단계 구획 하나(흐름도는 그 안에 들어 있다).
    const stage = screen.getByRole("region", { name: "주문 하나가 끝나기까지" });
    expect(stage).toHaveAttribute("data-testid", "guide-step");
    const chart = within(stage).getByTestId("work-flow-chart");
    expect(screen.getByTestId("guide-step-title").tagName).toBe("H2");
    // 제목은 단계 제목 하나뿐(흐름도 안에 같은 제목을 또 그리지 않는다).
    expect(within(chart).queryByRole("heading")).toBeNull();
    // 요약: 단계는 그대로 8개, 할 일 설명 줄은 빼고 자동 줄은 남긴다.
    expect(within(chart).getAllByRole("listitem")).toHaveLength(FLOW_STEPS.length);
    expect(chart.querySelector(".flowAction")).toBeNull();
    expect(screen.getByTestId("flow-step-register")).toHaveTextContent("자동 금액·마감·할 일·수정 횟수가 채워져요");
    expect(document.images).toHaveLength(0);
  });

  it("첫 화면 사용 방식 칸에도 같은 흐름도가 h3로 들어간다", () => {
    render(<MarketingHome />);
    const section = document.getElementById("workflow")!;
    expect(within(section).getByRole("heading", { level: 3, name: "주문 하나가 끝나기까지" })).toBeInTheDocument();
    expect(within(section).getAllByRole("listitem")).toHaveLength(FLOW_STEPS.length);
  });

  it("설명서는 단계마다 주 버튼(파랑)이 하나: 중간은 '다음', 마지막은 '무료로 시작하기'", () => {
    window.history.replaceState(null, "", "/guide");
    render(<UserGuide />);
    expect(document.querySelectorAll(".primaryButton")).toHaveLength(1);
    expect(screen.getByTestId("guide-next")).toHaveClass("primaryButton");
    act(() => {
      window.history.replaceState(null, "", `/guide#step-${GUIDE_STEPS.length}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(document.querySelectorAll(".primaryButton")).toHaveLength(1);
    // 머리글에도 '무료로 시작하기'(연한 파랑, 주 버튼 아님)가 있어 단계 버튼 줄 안에서 찾는다.
    expect(within(screen.getByRole("navigation", { name: "단계 이동" })).getByRole("link", { name: "무료로 시작하기" })).toHaveClass("primaryButton");
    expect(screen.getByTestId("guide-demo-link")).toHaveClass("secondaryButton");
    window.history.replaceState(null, "", "/guide");
  });
});
