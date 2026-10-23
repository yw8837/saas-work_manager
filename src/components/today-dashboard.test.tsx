import { fireEvent, render, screen, within } from "@testing-library/react";
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
  window.history.replaceState(null, "", "/today");
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

describe("TodayDashboard 일감별 작업 범위", () => {
  const jobs = seed.jobs.map((job, index) => ({
    ...job,
    clientLabel: "같은 고객",
    title: index === 0 ? "로고 제작" : "홈페이지 제작",
    dueDate: "2099-01-01",
    tasks: [{
      ...job.tasks[0],
      id: `scope-task-${index}`,
      title: index === 0 ? "로고 시안 보내기" : "홈페이지 시안 보내기",
      status: "todo" as const,
      dueDate: "2020-01-01",
    }],
  }));

  function setup(currentJobs: typeof seed.jobs = jobs) {
    vi.mocked(useWorkspace).mockReturnValue({
      jobs: currentJobs,
      alerts: [],
      settings: seed.settings,
      runtimeMode: "local",
      toggleTask: vi.fn(),
      toggleJobWaiting: vi.fn(),
      resetDemo: resetDemoSpy,
    } as unknown as ReturnType<typeof useWorkspace>);
    return render(<TodayDashboard />);
  }

  it("상세에서 돌아와 다시 마운트해도 선택한 일감 범위를 유지한다", () => {
    const first = setup();
    fireEvent.change(screen.getByRole("combobox", { name: "일감별로 보기" }), { target: { value: jobs[0].id } });
    expect(new URLSearchParams(window.location.search).get("job")).toBe(jobs[0].id);
    first.unmount();
    setup();
    expect(screen.getByRole("combobox", { name: "일감별로 보기" })).toHaveValue(jobs[0].id);
    expect(screen.queryByRole("button", { name: "홈페이지 시안 보내기 완료 처리" })).not.toBeInTheDocument();
  });

  it("같은 고객의 서로 다른 일감을 골라 작업과 마감을 좁혀 본다", () => {
    setup();
    const scope = screen.getByRole("combobox", { name: "일감별로 보기" });
    expect(within(scope).getByRole("option", { name: "같은 고객 · 로고 제작" })).toBeInTheDocument();
    expect(within(scope).getByRole("option", { name: "같은 고객 · 홈페이지 제작" })).toBeInTheDocument();

    fireEvent.change(scope, { target: { value: jobs[0].id } });
    expect(screen.getByRole("button", { name: "로고 시안 보내기 완료 처리" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "홈페이지 시안 보내기 완료 처리" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("오늘 업무 요약")).toHaveTextContent("오늘1");
    expect(screen.queryByText("홈페이지 제작", { selector: ".upcomingItem p" })).not.toBeInTheDocument();

    fireEvent.change(scope, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "홈페이지 시안 보내기 완료 처리" })).toBeInTheDocument();
  });

  it("선택한 일감이 없어지면 전체 범위로 돌아온다", () => {
    const { rerender } = setup();
    fireEvent.change(screen.getByRole("combobox", { name: "일감별로 보기" }), { target: { value: jobs[0].id } });
    const workspace = vi.mocked(useWorkspace).mock.results.at(-1)!.value;
    vi.mocked(useWorkspace).mockReturnValue({ ...workspace, jobs: [jobs[1]] });
    rerender(<TodayDashboard />);
    expect(screen.getByRole("combobox", { name: "일감별로 보기" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "홈페이지 시안 보내기 완료 처리" })).toBeInTheDocument();
  });

  it("같은 고객의 같은 대기 작업도 일감 이름으로 구분한다", () => {
    setup(jobs.map((job) => ({
      ...job,
      tasks: [{ ...job.tasks[0], title: "고객 확인", status: "waiting" as const }],
    })));
    for (const job of jobs) {
      const waitingLink = screen.getByRole("link", {
        name: new RegExp(`같은 고객\\s*${job.title} · 고객 확인`),
      });
      expect(waitingLink).toHaveAttribute("href", `/jobs/${job.id}`);
    }
  });

  it("범위를 바꾸면 펼쳐 둔 작업 목록을 다시 여섯 개로 접는다", () => {
    const manyTasks = Array.from({ length: 8 }, (_, index) => ({
      ...jobs[0].tasks[0],
      id: `many-${index}`,
      title: `로고 작업 ${index}`,
    }));
    setup([{ ...jobs[0], tasks: manyTasks }, jobs[1]]);
    fireEvent.click(screen.getByRole("button", { name: /나머지 .*개도 보기/ }));
    expect(screen.getByRole("button", { name: "로고 작업 7 완료 처리" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "일감별로 보기" }), { target: { value: jobs[0].id } });
    expect(screen.queryByRole("button", { name: "로고 작업 7 완료 처리" })).not.toBeInTheDocument();
  });
});
