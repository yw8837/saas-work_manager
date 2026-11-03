import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketingHome } from "./marketing-home";
import { UserGuide } from "./user-guide";
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

  it("설명서는 그림보다 흐름도를 먼저 보여 준다", () => {
    render(<UserGuide />);
    const chart = screen.getByTestId("work-flow-chart");
    const signup = screen.getByTestId("guide-signup");
    expect(chart.compareDocumentPosition(signup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(chart).getByRole("heading", { level: 2 })).toHaveTextContent("주문 하나가 끝나기까지");
  });

  it("첫 화면 사용 방식 칸에도 같은 흐름도가 h3로 들어간다", () => {
    render(<MarketingHome />);
    const section = document.getElementById("workflow")!;
    expect(within(section).getByRole("heading", { level: 3, name: "주문 하나가 끝나기까지" })).toBeInTheDocument();
    expect(within(section).getAllByRole("listitem")).toHaveLength(FLOW_STEPS.length);
  });
});
