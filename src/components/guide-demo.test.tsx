import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEMO_TIMING, GuideDemo, defineDemo, markTarget, type DemoScreenProps } from "./guide-demo";

type TestState = { label: string };
function TestScreen({ state, hit }: DemoScreenProps<TestState>) {
  return (
    <div>
      <p data-testid="test-state">{state.label}</p>
      <span {...markTarget("first", hit)}>첫 버튼</span>
      <span {...markTarget("second", hit)}>둘째 버튼</span>
    </div>
  );
}

const SPEC = defineDemo<TestState>({
  alt: "시험용 시연",
  initial: { label: "처음" },
  scenes: [
    { caption: "첫 장면 자막", target: "first", state: { label: "하나" } },
    { caption: "둘째 장면 자막", state: { label: "둘" } },
    { caption: "셋째 장면 자막", target: "second", state: { label: "셋" } },
  ],
  Screen: TestScreen,
});

const caption = () => screen.getByTestId("guide-demo-caption");
const shown = () => screen.getByTestId("test-state").textContent;
const demo = () => screen.getByTestId("guide-demo");
/** 타이머 하나씩 흘린다. 다음 타이머는 화면을 다시 그린 뒤 걸리므로 한 번에 몰아 흘리면 첫 타이머만 돈다. */
const advance = (...steps: number[]) => {
  for (const ms of steps) act(() => { vi.advanceTimersByTime(ms); });
};

/** 화면에 보이는지 직접 정하는 가짜 IntersectionObserver. */
class FakeObserver {
  static last: FakeObserver | null = null;
  constructor(private readonly callback: IntersectionObserverCallback) { FakeObserver.last = this; }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
  show(visible: boolean) {
    act(() => {
      this.callback([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0 } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    });
  }
}

function setPageHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeObserver.last = null;
  Reflect.deleteProperty(document, "visibilityState");
});

describe("설명서 시연 재생기", () => {
  it("장면을 차례로 돌린다: 겨누는 동안은 앞 화면 그대로, 누른 뒤 바뀌고, 마지막 뒤 처음 화면부터 다시", () => {
    render(<GuideDemo spec={SPEC} label="시연: 시험" />);
    expect(caption()).toHaveTextContent("첫 장면 자막");
    expect(shown()).toBe("처음");
    expect(demo()).toHaveAttribute("data-phase", "aim");
    // 누를 곳에 강조 표시가 있다.
    expect(screen.getByText("첫 버튼")).toHaveAttribute("data-hit");
    expect(screen.getByText("둘째 버튼")).not.toHaveAttribute("data-hit");

    advance(DEMO_TIMING.aim);
    expect(demo()).toHaveAttribute("data-phase", "done");
    expect(shown()).toBe("하나");

    advance(DEMO_TIMING.hold);
    // 누를 곳이 없는 장면: 자막이 먼저 바뀌고 화면은 짧게 쉰 뒤 바뀐다.
    expect(caption()).toHaveTextContent("둘째 장면 자막");
    expect(shown()).toBe("하나");
    advance(DEMO_TIMING.beat);
    expect(shown()).toBe("둘");

    advance(DEMO_TIMING.hold);
    expect(caption()).toHaveTextContent("셋째 장면 자막");
    expect(screen.getByText("둘째 버튼")).toHaveAttribute("data-hit");
    advance(DEMO_TIMING.aim);
    expect(shown()).toBe("셋");

    // 마지막 장면은 조금 더 머문다.
    advance(DEMO_TIMING.hold);
    expect(shown()).toBe("셋");
    advance(DEMO_TIMING.end);
    expect(caption()).toHaveTextContent("첫 장면 자막");
    expect(shown()).toBe("처음");
  });

  it("장면 점은 장면 수만큼이고, 지금 장면을 낭독기용 글로도 알린다", () => {
    render(<GuideDemo spec={SPEC} label="시연: 시험" />);
    expect(demo().querySelectorAll(".gdDots span")).toHaveLength(3);
    expect(caption()).toHaveTextContent("장면 1/3.");
    expect(demo().querySelector('.gdDots [data-state="current"]')).not.toBeNull();
    expect(screen.getByRole("img", { name: "시험용 시연" })).toBe(screen.getByTestId("guide-demo-screen"));
  });

  it("'멈춤'을 누르면 그 장면에 멈추고, '재생'을 누르면 이어서 돈다", () => {
    render(<GuideDemo spec={SPEC} label="시연: 시험" />);
    const toggle = screen.getByTestId("guide-demo-toggle");
    expect(toggle).toHaveAccessibleName("시연 멈춤");
    fireEvent.click(toggle);
    expect(toggle).toHaveAccessibleName("시연 재생");
    expect(vi.getTimerCount()).toBe(0);
    advance(20_000);
    expect(shown()).toBe("처음");
    expect(caption()).toHaveTextContent("첫 장면 자막");
    fireEvent.click(toggle);
    expect(toggle).toHaveAccessibleName("시연 멈춤");
    advance(DEMO_TIMING.aim);
    expect(shown()).toBe("하나");
  });

  it("'처음부터'를 누르면 첫 장면·처음 화면으로 돌아간다(재생 중이면 계속 돈다)", () => {
    render(<GuideDemo spec={SPEC} label="시연: 시험" />);
    advance(DEMO_TIMING.aim, DEMO_TIMING.hold, DEMO_TIMING.beat);
    expect(shown()).toBe("둘");
    fireEvent.click(screen.getByTestId("guide-demo-restart"));
    expect(caption()).toHaveTextContent("첫 장면 자막");
    expect(shown()).toBe("처음");
    advance(DEMO_TIMING.aim);
    expect(shown()).toBe("하나");
  });

  it("멈춘 채로 '처음부터'를 누르면 첫 장면 결과를 보이고 저절로 돌지 않는다", () => {
    render(<GuideDemo spec={SPEC} label="시연: 시험" />);
    fireEvent.click(screen.getByTestId("guide-demo-toggle"));
    fireEvent.click(screen.getByTestId("guide-demo-next-scene"));
    fireEvent.click(screen.getByTestId("guide-demo-next-scene"));
    expect(shown()).toBe("둘");
    fireEvent.click(screen.getByTestId("guide-demo-restart"));
    expect(shown()).toBe("하나");
    expect(caption()).toHaveTextContent("첫 장면 자막");
    advance(20_000);
    expect(shown()).toBe("하나");
  });

  it("화면에 안 보이면 타이머를 돌리지 않고, 보이면 돌고, 다시 벗어나면 멈춘다", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    render(<GuideDemo spec={SPEC} label="시연: 시험" />);
    // 처음 보고받기 전에는 보이지 않는 것으로 친다.
    expect(vi.getTimerCount()).toBe(0);
    advance(20_000);
    expect(shown()).toBe("처음");
    FakeObserver.last!.show(true);
    expect(vi.getTimerCount()).toBe(1);
    advance(DEMO_TIMING.aim);
    expect(shown()).toBe("하나");
    FakeObserver.last!.show(false);
    expect(vi.getTimerCount()).toBe(0);
    advance(20_000);
    expect(shown()).toBe("하나");
    expect(caption()).toHaveTextContent("첫 장면 자막");
  });

  it("탭이 가려지면 멈추고, 다시 보이면 이어서 돈다", () => {
    render(<GuideDemo spec={SPEC} label="시연: 시험" />);
    setPageHidden(true);
    expect(vi.getTimerCount()).toBe(0);
    advance(20_000);
    expect(shown()).toBe("처음");
    setPageHidden(false);
    advance(DEMO_TIMING.aim);
    expect(shown()).toBe("하나");
  });

  it("움직임 줄이기면 저절로 돌지 않고 마지막 장면(결과)을 멈춘 화면으로 보이며, '다음 장면'으로 한 장면씩 넘긴다", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<GuideDemo spec={SPEC} label="시연: 시험" />);
    expect(shown()).toBe("셋");
    expect(caption()).toHaveTextContent("셋째 장면 자막");
    expect(demo()).toHaveAttribute("data-phase", "done");
    expect(screen.getByTestId("guide-demo-toggle")).toHaveAccessibleName("시연 재생");
    expect(vi.getTimerCount()).toBe(0);
    advance(20_000);
    expect(shown()).toBe("셋");

    const next = screen.getByTestId("guide-demo-next-scene");
    expect(next).toHaveAccessibleName("다음 장면");
    fireEvent.click(next);
    expect(shown()).toBe("하나");
    expect(caption()).toHaveTextContent("첫 장면 자막");
    fireEvent.click(next);
    expect(shown()).toBe("둘");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("자동 재생 중 '다음 장면'을 누르면 멈추고, 아직 누르기 전 장면이면 그 장면 결과부터 보인다", () => {
    render(<GuideDemo spec={SPEC} label="시연: 시험" />);
    fireEvent.click(screen.getByTestId("guide-demo-next-scene"));
    expect(shown()).toBe("하나");
    expect(screen.getByTestId("guide-demo-toggle")).toHaveAccessibleName("시연 재생");
    fireEvent.click(screen.getByTestId("guide-demo-next-scene"));
    expect(shown()).toBe("둘");
    expect(caption()).toHaveTextContent("둘째 장면 자막");
    advance(20_000);
    expect(shown()).toBe("둘");
  });

  it("자막은 첫 바퀴와 멈춘 뒤에만 낭독기에 알리고, 자동 반복 중에는 알리지 않는다", () => {
    render(<GuideDemo spec={SPEC} label="시연: 시험" />);
    expect(caption()).toHaveAttribute("aria-live", "polite");
    advance(DEMO_TIMING.aim, DEMO_TIMING.hold, DEMO_TIMING.beat, DEMO_TIMING.hold, DEMO_TIMING.aim);
    // 첫 바퀴 동안은 장면마다 알린다.
    expect(caption()).toHaveTextContent("셋째 장면 자막");
    expect(caption()).toHaveAttribute("aria-live", "polite");
    advance(DEMO_TIMING.hold + DEMO_TIMING.end);
    expect(caption()).toHaveTextContent("첫 장면 자막");
    expect(caption()).toHaveAttribute("aria-live", "off");
    fireEvent.click(screen.getByTestId("guide-demo-toggle"));
    expect(caption()).toHaveAttribute("aria-live", "polite");
  });

  it("제어 버튼은 누르는 영역용 클래스(44px)와 낭독기 이름이 있다", () => {
    render(<GuideDemo spec={SPEC} label="시연: 시험" />);
    for (const id of ["guide-demo-toggle", "guide-demo-restart", "guide-demo-next-scene"]) {
      const button = screen.getByTestId(id);
      expect(button.tagName).toBe("BUTTON");
      expect(button).toHaveClass("gdControl");
      expect(button.getAttribute("aria-label")?.trim()).toBeTruthy();
    }
    expect(screen.getByRole("region", { name: "시연: 시험" })).toBe(demo());
  });

  it("사라지면(단계를 넘기면) 남은 타이머가 없다", () => {
    const { unmount } = render(<GuideDemo spec={SPEC} label="시연: 시험" />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
