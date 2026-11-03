import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { recordRevision } from "@/lib/domain";
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

describe("TodayDashboard 수정 거의 다 씀", () => {
  it("요약 칸과 답변 대기 설명은 어려운 말('임박'·'작업 큐') 없이 누를 버튼 이름으로 쓴다", () => {
    const job = { ...seed.jobs[0], status: "active" as const };
    vi.mocked(useWorkspace).mockReturnValue({
      jobs: [job],
      alerts: [],
      settings: seed.settings,
      runtimeMode: "local",
      toggleTask: vi.fn(),
      toggleJobWaiting: vi.fn(),
      resetDemo: resetDemoSpy,
    } as unknown as ReturnType<typeof useWorkspace>);
    const view = render(<TodayDashboard />);
    expect(screen.getByText("수정 거의 다 씀")).toBeInTheDocument();
    expect(screen.getByText("답이 오면 ‘답변 받음’을 눌러요.")).toBeInTheDocument();
    expect(view.container).not.toHaveTextContent(/임박|큐/);
  });

  it("수정을 한 번도 안 쓴 일감은 '거의 다 씀'으로 세지 않는다", () => {
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

    const near = screen.getByText("수정 거의 다 씀").closest("div")!;
    expect(near.textContent).toContain("0");
  });
});

describe("TodayDashboard 우선 처리의 고객 요청", () => {
  it("확인 대기 요청이 우선 처리에 보인다", () => {
    const base = {
      ...seed.jobs[0],
      status: "active" as const,
      dueDate: "2099-01-01",
      tasks: [{ ...seed.jobs[0].tasks[0], id: "request-task", title: "시안 보내기", status: "todo" as const, dueDate: "2020-01-01" }],
    };
    const job = recordRevision(base, { revisionId: "revision_today", source: "public", body: "사진 교체 부탁드려요.", submittedAt: "2026-08-16T01:00:00.000Z" }).job;
    const toggleTask = vi.fn();
    vi.mocked(useWorkspace).mockReturnValue({
      jobs: [job],
      alerts: [],
      settings: seed.settings,
      runtimeMode: "local",
      toggleTask,
      toggleJobWaiting: vi.fn(),
      resetDemo: resetDemoSpy,
    } as unknown as ReturnType<typeof useWorkspace>);
    render(<TodayDashboard />);

    const focus = screen.getByRole("heading", { name: "우선 처리" }).closest("section")!;
    const row = within(focus).getByTestId(`today-pending-request-${job.id}`);
    expect(row).toHaveTextContent("고객 요청 1건 확인 대기");
    // 할 일처럼 체크하는 줄이 아니라, 누르면 그 일감의 수정 요청 구획으로 가는 줄이다.
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
    expect(within(row).getByRole("link")).toHaveAttribute("href", `/jobs/${job.id}#revisions`);

    // 할 일 줄의 체크 동작은 그대로다.
    fireEvent.click(within(focus).getByRole("button", { name: "시안 보내기 완료 처리" }));
    expect(toggleTask).toHaveBeenCalledWith(job.id, "request-task");
  });

  it("확인 대기 요청이 없으면 요청 줄이 없다", () => {
    const job = { ...seed.jobs[0], status: "active" as const };
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
    expect(screen.queryByTestId(`today-pending-request-${job.id}`)).not.toBeInTheDocument();
  });
});

describe("TodayDashboard 받은 곳", () => {
  it("우선 처리 줄의 일감 이름 옆에 받은 곳을 작게 보인다", () => {
    const job = {
      ...seed.jobs[0],
      status: "active" as const,
      source: "kmong" as const,
      dueDate: "2099-01-01",
      tasks: [{ ...seed.jobs[0].tasks[0], id: "source-task", title: "시안 보내기", status: "todo" as const, dueDate: "2020-01-01" }],
    };
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
    const row = screen.getByRole("button", { name: "시안 보내기 완료 처리" }).closest("article")!;
    expect(row).toHaveTextContent("모라스튜디오 브랜드 사이트 · 크몽");
    // 다가오는 마감 줄에도 같은 모양으로 받은 곳을 붙인다.
    const upcoming = document.querySelectorAll(".upcomingItem p");
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]).toHaveTextContent(/^모라스튜디오 브랜드 사이트 · 크몽$/);
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
    // 우선 처리는 일감마다 한 줄이라, 줄이 7개를 넘으려면 일감이 여러 개여야 한다.
    const manyJobs = Array.from({ length: 8 }, (_, index) => ({
      ...jobs[0],
      id: `many-job-${index}`,
      title: `로고 제작 ${index}`,
      tasks: [{ ...jobs[0].tasks[0], id: `many-${index}`, title: `로고 작업 ${index}` }],
    }));
    setup(manyJobs);
    fireEvent.click(screen.getByRole("button", { name: /나머지 .*개도 보기/ }));
    expect(screen.getByRole("button", { name: "로고 작업 7 완료 처리" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "일감별로 보기" }), { target: { value: manyJobs[0].id } });
    expect(screen.queryByRole("button", { name: "로고 작업 7 완료 처리" })).not.toBeInTheDocument();
  });
});

describe("TodayDashboard 일감마다 한 줄", () => {
  // 시작일이 과거라 할 일 6개가 모두 밀린 일감 하나, 마감이 아직 남은 일감 하나.
  const overdueJob = {
    ...seed.jobs[0],
    id: "job-overdue",
    clientLabel: "온새미 공방",
    status: "active" as const,
    dueDate: "2020-01-20",
    revisions: [],
    tasks: Array.from({ length: 6 }, (_, index) => ({
      ...seed.jobs[0].tasks[0],
      id: `overdue-${index}`,
      title: `밀린 할 일 ${index}`,
      status: "todo" as const,
      dueDate: `2020-01-0${index + 1}`,
    })),
  };
  const laterJob = {
    ...seed.jobs[1],
    id: "job-later",
    clientLabel: "필라테스 온유",
    status: "active" as const,
    dueDate: "2099-01-01",
    revisions: [],
    tasks: [{ ...seed.jobs[1].tasks[0], id: "later-task", title: "다음 할 일", status: "todo" as const, dueDate: "2099-01-01" }],
  };
  const toggleTask = vi.fn();

  function setup(currentJobs: typeof seed.jobs) {
    vi.mocked(useWorkspace).mockReturnValue({
      jobs: currentJobs,
      alerts: [],
      settings: seed.settings,
      runtimeMode: "local",
      toggleTask,
      toggleJobWaiting: vi.fn(),
      resetDemo: resetDemoSpy,
    } as unknown as ReturnType<typeof useWorkspace>);
    return render(<TodayDashboard />);
  }

  beforeEach(() => toggleTask.mockReset());

  it("밀린 할 일이 여러 개인 일감은 가장 급한 할 일 한 줄과 '밀린 할 일 N개 더'로 묶는다", () => {
    setup([overdueJob, laterJob]);
    const rows = document.querySelectorAll(".focusSection .taskRow");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("밀린 할 일 0");
    expect(rows[0]).toHaveTextContent("밀린 할 일 5개 더");
    expect(screen.queryByRole("button", { name: "밀린 할 일 1 완료 처리" })).not.toBeInTheDocument();
    // '오늘' 숫자는 할 일 6개가 아니라 처리할 일감 1건이다.
    expect(screen.getByLabelText("오늘 업무 요약")).toHaveTextContent("오늘1");
    expect(screen.getByText("1개", { selector: ".focusSection .sectionCount" })).toBeInTheDocument();
  });

  it("마감이 지난 일감도 '다가오는 마감' 맨 위에 지연으로 남긴다", () => {
    setup([laterJob, overdueJob]);
    const upcoming = document.querySelectorAll(".upcomingItem");
    expect(upcoming).toHaveLength(2);
    expect(upcoming[0]).toHaveTextContent("온새미 공방");
    expect(upcoming[0]).toHaveTextContent("지연");
    expect(upcoming[0]).toHaveAttribute("data-overdue", "true");
    expect(upcoming[1]).toHaveTextContent("필라테스 온유");
  });

  it("받을 자료나 답이 남은 진행 중 일감을 '자료 대기'로 센다", () => {
    const waitingMaterial = {
      ...laterJob,
      id: "job-material",
      intakeItems: [{ id: "i1", label: "로고 파일" }, { id: "i2", label: "사진", receivedAt: "2026-11-01T00:00:00.000Z" }],
      briefQuestions: [],
    };
    const waitingAnswer = {
      ...laterJob,
      id: "job-answer",
      intakeItems: [],
      briefQuestions: [{ id: "q1", question: "목적은?" }],
    };
    const allReceived = {
      ...laterJob,
      id: "job-done-material",
      intakeItems: [{ id: "i3", label: "로고", receivedAt: "2026-11-01T00:00:00.000Z" }],
      briefQuestions: [{ id: "q2", question: "목적은?", answeredAt: "2026-11-01T00:00:00.000Z" }],
    };
    setup([waitingMaterial, waitingAnswer, allReceived, { ...waitingMaterial, id: "job-finished", status: "completed" as const }]);
    expect(screen.getByLabelText("오늘 업무 요약")).toHaveTextContent("자료 대기2");
  });

  it("할 일을 체크하면 알림에 '되돌리기'가 있고, 누르면 체크를 되돌린다", () => {
    setup([overdueJob]);
    fireEvent.click(screen.getByRole("button", { name: "밀린 할 일 0 완료 처리" }));
    expect(toggleTask).toHaveBeenCalledWith("job-overdue", "overdue-0");
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("밀린 할 일 0 완료했어요");
    fireEvent.click(within(toast).getByRole("button", { name: "되돌리기" }));
    expect(toggleTask).toHaveBeenCalledTimes(2);
    expect(toggleTask).toHaveBeenLastCalledWith("job-overdue", "overdue-0");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("TodayDashboard '이번 달 돈' 카드(디자인 A)", () => {
  const nowIso = new Date().toISOString();
  const base = { ...seed.jobs[0], revisions: [], dueDate: "2099-01-01" };
  const active = { ...base, id: "money-active", status: "active" as const, amount: 1_000_000, feeRate: 20 };
  const activeNoFee = { ...base, id: "money-active-2", status: "active" as const, amount: 500_000 };
  const done = { ...base, id: "money-done", status: "completed" as const, amount: 790_000, completedAt: nowIso, updatedAt: nowIso };

  function setup(currentJobs: typeof seed.jobs) {
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

  it("맨 위 카드에 받을 돈 큰 숫자 하나와 작업 중·완료·수수료 칸을 보인다(수수료 빼고 기준)", () => {
    setup([active, activeNoFee, done] as typeof seed.jobs);
    const card = screen.getByRole("region", { name: "이번 달 돈" });
    // 오늘 화면 맨 위(일감 범위 고르기·요약보다 먼저)
    expect(card.compareDocumentPosition(screen.getByLabelText("오늘 업무 요약")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).getByTestId("month-money-total")).toHaveTextContent("2,090,000원");
    expect(card).toHaveTextContent("수수료 빼고");
    expect(within(card).getByTestId("month-money-in-progress")).toHaveTextContent("1,500,000원");
    expect(within(card).getByTestId("month-money-in-progress")).toHaveTextContent("2건");
    expect(within(card).getByTestId("month-money-completed")).toHaveTextContent("790,000원");
    expect(within(card).getByTestId("month-money-fee")).toHaveTextContent("200,000원");
  });

  it("수수료가 없으면 수수료 칸과 '수수료 빼고' 말을 숨긴다", () => {
    setup([activeNoFee, done] as typeof seed.jobs);
    const card = screen.getByRole("region", { name: "이번 달 돈" });
    expect(within(card).getByTestId("month-money-total")).toHaveTextContent("1,290,000원");
    expect(within(card).queryByTestId("month-money-fee")).not.toBeInTheDocument();
    expect(card).not.toHaveTextContent("수수료 빼고");
  });

  it("휴대폰 '금액 보기' 규칙을 따른다: 처음엔 접혀 있고 누르면 펼친다(데스크톱은 CSS로 늘 펼침)", () => {
    setup([active] as typeof seed.jobs);
    const card = screen.getByRole("region", { name: "이번 달 돈" });
    const toggle = within(card).getByRole("button", { name: /금액 보기/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(card).toHaveAttribute("data-money-open", "false");
    fireEvent.click(toggle);
    expect(within(card).getByRole("button", { name: /금액 접기/ })).toHaveAttribute("aria-expanded", "true");
    expect(card).toHaveAttribute("data-money-open", "true");
  });

  it("월별 정리로 가는 링크가 있다", () => {
    setup([active] as typeof seed.jobs);
    const card = screen.getByRole("region", { name: "이번 달 돈" });
    expect(within(card).getByRole("link", { name: /월별 정리/ })).toHaveAttribute("href", "/jobs/summary");
  });
});

describe("TodayDashboard 날짜 칸(디자인 A)", () => {
  it("우선 처리·다가오는 마감 줄 왼쪽에 D-day 날짜 칸이 있다", () => {
    const job = {
      ...seed.jobs[0], id: "tile-job", status: "active" as const, revisions: [], dueDate: "2020-01-20",
      tasks: [{ ...seed.jobs[0].tasks[0], id: "tile-task", title: "밀린 일", status: "todo" as const, dueDate: "2020-01-05" }],
    };
    vi.mocked(useWorkspace).mockReturnValue({
      jobs: [job], alerts: [], settings: seed.settings, runtimeMode: "local",
      toggleTask: vi.fn(), toggleJobWaiting: vi.fn(), resetDemo: resetDemoSpy,
    } as unknown as ReturnType<typeof useWorkspace>);
    render(<TodayDashboard />);
    const taskTile = document.querySelector(".focusSection .taskRow .dueTile");
    expect(taskTile).toHaveAttribute("data-tone", "late");
    expect(taskTile).toHaveTextContent("1.05");
    const upcomingTile = document.querySelector(".upcomingItem .dueTile");
    expect(upcomingTile).toHaveAttribute("data-tone", "late");
    expect(upcomingTile).toHaveTextContent("1.20");
  });
});
