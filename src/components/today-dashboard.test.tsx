import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSeedState } from "@/lib/store";
import { TodayDashboard } from "./today-dashboard";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", async () => {
  const actual = await vi.importActual<typeof import("./workspace-provider")>("./workspace-provider");
  return { ...actual, useWorkspace: vi.fn() };
});

const seed = createSeedState("2026-08-16");
const resetDemoSpy = vi.fn();

function renderDashboard() {
  vi.mocked(useWorkspace).mockReturnValue({
    jobs: [],
    alerts: [],
    settings: seed.settings,
    runtimeMode: "local",
    toggleTask: vi.fn(),
    toggleJobWaiting: vi.fn(),
    resetDemo: resetDemoSpy,
  } as unknown as ReturnType<typeof useWorkspace>);
  return render(<TodayDashboard />);
}

beforeEach(() => {
  resetDemoSpy.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TodayDashboard 전체 초기화 확인 문구", () => {
  it("사라지는 것을 빠짐없이 이름으로 말한다", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: /전체 초기화/ }));

    const asked = confirmSpy.mock.calls[0][0] ?? "";
    // 초기화는 시드 패키지·옵션을 되살리므로 직접 만든 패키지와 옵션이 함께 사라진다.
    expect(asked).toContain("일감");
    expect(asked).toContain("수정 기록");
    expect(asked).toContain("직접 만든 패키지와 옵션");
    // 초기화해도 남는 것까지 말해야 "왜 아직 한도에 걸리지?"가 안 생긴다.
    expect(asked).toContain("만든 일감 수와 체험·베타 이용 기간은 그대로 남아요");
    expect(asked).toContain("되돌릴 수 없어요");
    expect(resetDemoSpy).not.toHaveBeenCalled();
  });

  it("확인을 눌러야만 초기화한다", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: /전체 초기화/ }));

    expect(resetDemoSpy).toHaveBeenCalledTimes(1);
  });
});

describe("TodayDashboard 첫 실행 안내", () => {
  it("일감이 없으면 새 일감 화면으로 가는 링크를 준다", () => {
    renderDashboard();

    // 안내만 있고 갈 곳이 없으면 첫 화면이 막다른 길이 된다.
    const cta = screen.getByRole("link", { name: /첫 일감 만들기/ });
    expect(cta).toHaveAttribute("href", "/jobs/new");
  });
});

describe("TodayDashboard 수정 임박", () => {
  it("수정을 한 번도 안 쓴 일감은 임박으로 세지 않는다", () => {
    // 기본 패키지는 포함 수정이 1회라, 쓰지도 않은 일감이 만들자마자 임박으로 잡히면 안 된다.
    const job = { ...seed.jobs[0], status: "active" as const, revisionLimit: 1, revisions: [] };
    vi.mocked(useWorkspace).mockReturnValue({
      jobs: [job],
      alerts: [],
      settings: seed.settings,
      runtimeMode: "local",
      toggleTask: vi.fn(),
      toggleJobWaiting: vi.fn(),
      resetDemo: resetDemoSpy,
    } as unknown as ReturnType<typeof useWorkspace>);
    render(<TodayDashboard />);

    const near = screen.getByText("수정 임박").closest("div")!;
    expect(near.textContent).toContain("0");
  });
});
