import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductPreview } from "./product-preview";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Preview motion control", () => {
  it("keeps a manual pause after pointer and focus leave, with manual navigation available", () => {
    vi.useFakeTimers();
    const { container } = render(<ProductPreview />);
    fireEvent.click(screen.getByRole("button", { name: "자동 넘김 멈추기" }));
    const carousel = container.querySelector(".previewCarousel")!;
    fireEvent.mouseEnter(carousel);
    fireEvent.mouseLeave(carousel);
    fireEvent.focus(carousel);
    fireEvent.blur(carousel);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("button", { name: "1번째 미리보기" })).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "다음 미리보기" }));
    expect(screen.getByRole("button", { name: "2번째 미리보기" })).toHaveAttribute("aria-current", "true");
    fireEvent.mouseEnter(carousel);
    fireEvent.focus(screen.getByRole("button", { name: "자동 넘김 시작하기" }));
    fireEvent.click(screen.getByRole("button", { name: "자동 넘김 시작하기" }));
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "3번째 미리보기" })).toHaveAttribute("aria-current", "true");
  });

  it("does not autoplay when reduced motion is requested", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<ProductPreview />);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("button", { name: "1번째 미리보기" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "자동 넘김 시작하기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "자동 넘김 시작하기" }));
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "2번째 미리보기" })).toHaveAttribute("aria-current", "true");
  });
});
