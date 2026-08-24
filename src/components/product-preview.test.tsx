import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductPreview } from "./product-preview";

function caption(text: string) {
  const element = document.querySelector(".previewCaption");
  expect(element).not.toBeNull();
  expect(element).toHaveTextContent(text);
  return element;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ProductPreview", () => {
  it("keeps product scenes as a public preview instead of workspace-login links", () => {
    render(<ProductPreview />);

    expect(screen.queryByRole("link", { name: /이 화면으로 이동/ })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "일감체크 화면 미리보기" })).toBeInTheDocument();
  });

  it("advances after a calmer 2.8-second interval", () => {
    vi.useFakeTimers();
    render(<ProductPreview />);

    expect(caption("한 번 저장해두면 다음 주문부터는 고르기만 하면 돼요")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2_500));
    expect(caption("한 번 저장해두면 다음 주문부터는 고르기만 하면 돼요")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(300));
    expect(caption("네 가지만 고르면 금액과 마감, 체크리스트가 만들어져요")).toBeInTheDocument();
  });
});
