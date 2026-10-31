import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCustomerDemoState } from "@/lib/demo/sample-order";
import { CustomerRevisionDemo } from "./customer-revision-demo";

// 체험 링크가 서버·DB·작업공간을 끌어오면 import 단계에서 바로 실패하게 한다.
vi.mock("@/lib/supabase", () => {
  throw new Error("체험 링크는 Supabase 모듈을 불러오면 안 된다");
});
vi.mock("@supabase/supabase-js", () => {
  throw new Error("체험 링크는 Supabase 클라이언트를 불러오면 안 된다");
});
vi.mock("./workspace-provider", () => {
  throw new Error("체험 링크는 작업공간 저장소를 불러오면 안 된다");
});
vi.mock("@/lib/store", () => {
  throw new Error("체험 링크는 브라우저 저장소 모듈을 불러오면 안 된다");
});

describe("CustomerRevisionDemo", () => {
  const fetchSpy = vi.fn(() => Promise.reject(new Error("network")));
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    setItemSpy = vi.spyOn(Storage.prototype, "setItem");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setItemSpy.mockRestore();
    fetchSpy.mockClear();
  });

  it("체험 표시와 예시 주문을 보여주고, 요청을 남기면 브라우저 메모리에서만 차감한다", async () => {
    render(<CustomerRevisionDemo initialState={createCustomerDemoState("2026-10-30")} />);

    expect(screen.getByRole("note")).toHaveTextContent("체험용 예시 화면이에요");
    expect(screen.getByRole("note")).toHaveTextContent("실제로 전송되지 않아요");
    expect(screen.getByText("STANDARD 로고", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("300,000원")).toBeInTheDocument();
    expect(screen.getByTestId("demo-revision-usage")).toHaveTextContent("3회 중 1회 사용");
    expect(screen.getByTestId("revision-remaining")).toHaveTextContent("2");
    // 리뉴얼: 작업자 이름을 크게, 마감·진행 단계를 함께 보여 주되 체험에서만 먼저 보인다고 밝힌다.
    expect(screen.getByTestId("revision-worker")).toHaveTextContent("샘플 디자인 스튜디오");
    expect(screen.getByTestId("revision-due")).toHaveTextContent("5일 남음");
    expect(screen.getByRole("list", { name: "진행 단계" })).toBeInTheDocument();
    expect(screen.getByText("수정", { selector: "li[aria-current=step] span" })).toBeInTheDocument();
    expect(screen.getByTestId("demo-preview-only")).toHaveTextContent("체험 화면에서만");

    fireEvent.change(screen.getByLabelText("수정 요청 내용"), { target: { value: "메뉴판 글씨를 키워주세요." } });
    fireEvent.click(screen.getByRole("button", { name: /요청 남기기/ }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("수정 요청을 남겼어요"));
    expect(screen.getByTestId("demo-revision-usage")).toHaveTextContent("3회 중 2회 사용");
    expect(screen.getByTestId("revision-next-step")).toHaveTextContent("다음에 일어나는 일");
    expect(screen.getByTestId("revision-next-step")).toHaveTextContent("남은 포함 수정은 1회예요");

    fireEvent.click(screen.getByRole("button", { name: "다른 요청 남기기" }));
    expect(screen.getByTestId("revision-remaining")).toHaveTextContent("1");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it("횟수를 다 쓰면 실제 링크처럼 추가 작업 검토로 접수하고, 처음 상태로 되돌릴 수 있다", async () => {
    render(<CustomerRevisionDemo initialState={createCustomerDemoState("2026-10-30")} />);

    for (const body of ["첫 번째 수정", "두 번째 수정"]) {
      fireEvent.change(screen.getByLabelText("수정 요청 내용"), { target: { value: body } });
      fireEvent.click(screen.getByRole("button", { name: /요청 남기기/ }));
      await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "다른 요청 남기기" }));
    }
    expect(screen.getByTestId("revision-remaining")).toHaveTextContent("0");

    fireEvent.change(screen.getByLabelText("수정 요청 내용"), { target: { value: "범위 밖 요청" } });
    fireEvent.click(screen.getByRole("button", { name: /요청 남기기/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("추가 작업 검토 요청"));
    expect(screen.getByTestId("revision-next-step")).toHaveTextContent("추가 작업으로 진행할지");

    fireEvent.click(screen.getByRole("button", { name: /처음 상태로/ }));
    expect(screen.getByTestId("demo-revision-usage")).toHaveTextContent("3회 중 1회 사용");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
