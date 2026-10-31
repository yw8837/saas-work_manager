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

  it("keeps each dense product scene visible for 4.5 seconds", () => {
    vi.useFakeTimers();
    render(<ProductPreview />);

    // 첫 장면은 고객이 받는 링크 화면이다(리뉴얼 4번).
    expect(caption("고객은 카톡으로 받은 링크에서 남은 수정 횟수를 보고 바로 요청을 남겨요")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4_200));
    expect(caption("고객은 카톡으로 받은 링크에서 남은 수정 횟수를 보고 바로 요청을 남겨요")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(300));
    expect(caption("한 번 저장해두면 다음 주문부터는 고르기만 하면 돼요")).toBeInTheDocument();
  });
});
