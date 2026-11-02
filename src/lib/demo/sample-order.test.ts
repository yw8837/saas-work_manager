import { describe, expect, it } from "vitest";

import { pendingIntakeLabels } from "@/lib/domain";
import {
  SAMPLE_CLIENT_LABEL,
  SAMPLE_ORDER_TITLE,
  SAMPLE_PACKAGES,
  createCustomerDemoState,
  createSampleOrder,
  submitCustomerDemoRevision,
  viewCustomerDemo,
} from "./sample-order";

describe("체험 링크 예시 주문", () => {
  it("STANDARD 패키지, 금액·마감, 수정 3회 중 1회 사용으로 시작한다", () => {
    const order = createSampleOrder("2026-10-30");
    expect(order.clientLabel).toBe(SAMPLE_CLIENT_LABEL);
    expect(order.title).toBe(SAMPLE_ORDER_TITLE);
    expect(order.packageSnapshot.name).toBe("STANDARD 로고");
    expect(order.amount).toBe(300_000);
    expect(order.startDate).toBe("2026-10-27");
    expect(order.dueDate).toBe("2026-11-04");

    const view = viewCustomerDemo(createCustomerDemoState("2026-10-30"));
    expect(view.revision).toMatchObject({ included: 3, used: 1, remaining: 2 });
    // 어느 날 열어도 같은 화면이 되도록 마감은 늘 "5일 남음"이다.
    expect(view.daysLeft).toBe(5);
    expect(viewCustomerDemo(createCustomerDemoState("2027-02-28")).daysLeft).toBe(5);
  });

  it("요청을 남기면 확인 대기로 쌓이고, 작업자가 수정을 마치기 전에는 남은 횟수가 줄지 않는다", () => {
    let state = createCustomerDemoState("2026-10-30");
    expect(viewCustomerDemo(state).revision).toMatchObject({ used: 1, remaining: 2, pending: 0 });

    const first = submitCustomerDemoRevision(state, { body: "메뉴판 글씨를 키워주세요.", clientLabel: "김담당" });
    expect(first.usage).toBe("pending");
    expect(viewCustomerDemo(first.state).revision).toMatchObject({ used: 1, remaining: 2, pending: 1 });
    state = first.state;

    const second = submitCustomerDemoRevision(state, { body: "배경색을 더 밝게 해주세요." });
    const third = submitCustomerDemoRevision(second.state, { body: "간판용 가로형도 만들어주세요." });
    expect(third.usage).toBe("pending");
    expect(viewCustomerDemo(third.state).revision).toMatchObject({ used: 1, remaining: 2, pending: 3, extraScope: 0 });
    expect(third.state.submitted).toBe(3);
  });

  it("예시 주문은 첫 요청을 '수정 완료'로 처리했고, 시작 전 자료 중 2개를 아직 못 받은 상태다", () => {
    const order = createSampleOrder("2026-10-30");
    expect(order.revisions[0]).toMatchObject({ usage: "used", status: "done", sequence: 1 });
    expect(pendingIntakeLabels(order)).toEqual(["로고를 쓸 곳(간판·명함 등)", "꼭 쓰고 싶은 색이나 피하고 싶은 색"]);
  });

  it("예시 받을 자료에는 '참고' 항목을 두지 않는다(기본 질문 2번이 참고 예시를 묻는다, 시장조사 R2)", () => {
    for (const item of SAMPLE_PACKAGES) {
      for (const label of item.intakeItems ?? []) expect(label, item.name).not.toContain("참고");
    }
  });

  it("원래 상태를 바꾸지 않는다(새로고침 전 되돌리기용)", () => {
    const state = createCustomerDemoState("2026-10-30");
    submitCustomerDemoRevision(state, { body: "로고를 조금 더 작게" });
    expect(viewCustomerDemo(state).revision.used).toBe(1);
    expect(state.submitted).toBe(0);
  });

  it("두 글자 미만 요청은 받지 않는다", () => {
    const state = createCustomerDemoState("2026-10-30");
    expect(() => submitCustomerDemoRevision(state, { body: " a " })).toThrow("두 글자 이상");
  });
});
