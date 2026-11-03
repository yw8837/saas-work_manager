import { render, screen, within } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import { useWorkspace } from "./workspace-provider";

vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/today") }));
vi.mock("./workspace-provider", () => ({ useWorkspace: vi.fn() }));

const baseWorkspace = {
  jobs: [],
  alerts: [],
  runtimeMode: "hosted",
  userEmail: "owner@example.com",
  saveStatus: "saved",
  saveError: null,
  realtimeStatus: "connected",
  realtimeError: null,
  planAccess: {
    plan: "free",
    basePlan: "free",
    source: "base",
    remainingDays: 0,
    expiresAt: null,
    trialExpired: false,
    betaExpired: false,
  },
} as unknown as ReturnType<typeof useWorkspace>;

describe("AppShell runtime status", () => {
  beforeEach(() => {
    vi.mocked(useWorkspace).mockReturnValue(baseWorkspace);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows a global actionable warning when Hosted Realtime disconnects", () => {
    vi.mocked(useWorkspace).mockReturnValue({
      ...baseWorkspace,
      realtimeStatus: "error",
      realtimeError: "실시간 연결이 끊겼어요.",
    });

    render(<AppShell><p>workspace</p></AppShell>);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("새 수정 요청 자동 반영이 멈췄을 수 있어요");
    expect(screen.getByRole("link", { name: "연결 확인" })).toHaveAttribute("href", "/settings");
  });

  it("does not show the warning while Realtime is connected", () => {
    render(<AppShell><p>workspace</p></AppShell>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the survey link visible after beta Pro expires", () => {
    const formUrl = "https://docs.google.com/forms/d/e/TEST/viewform";
    vi.stubEnv("NEXT_PUBLIC_FEEDBACK_FORM_URL", formUrl);
    vi.mocked(useWorkspace).mockReturnValue({
      ...baseWorkspace,
      planAccess: {
        ...baseWorkspace.planAccess,
        betaExpired: true,
      },
    });

    render(<AppShell><p>workspace</p></AppShell>);

    expect(screen.getByText("써 보니 어떠셨나요?")).toBeInTheDocument();
    // 설문 안내에는 기간 말을 넣지 않는다(이용권이 끝난 뒤에도 그대로 읽히게).
    expect(document.body).not.toHaveTextContent(/\d+일 동안/);
    expect(screen.getByRole("link", { name: "설문 작성하기" })).toHaveAttribute("href", formUrl);
  });

  it("shows the survey from day 7 of the 14-day beta while Pro remains active", () => {
    vi.stubEnv("NEXT_PUBLIC_FEEDBACK_FORM_URL", "https://docs.google.com/forms/d/e/TEST/viewform");
    vi.mocked(useWorkspace).mockReturnValue({
      ...baseWorkspace,
      planAccess: {
        ...baseWorkspace.planAccess,
        source: "beta",
        plan: "pro",
        remainingDays: 7,
        expiresAt: "2026-09-11T00:00:00.000Z",
      },
    });

    render(<AppShell><p>workspace</p></AppShell>);

    expect(screen.getByText("써 보니 어떠셨나요?")).toBeInTheDocument();
  });

  it("does not ask for the survey before day 7 of beta use", () => {
    vi.stubEnv("NEXT_PUBLIC_FEEDBACK_FORM_URL", "https://docs.google.com/forms/d/e/TEST/viewform");
    vi.mocked(useWorkspace).mockReturnValue({
      ...baseWorkspace,
      planAccess: {
        ...baseWorkspace.planAccess,
        source: "beta",
        plan: "pro",
        remainingDays: 8,
        expiresAt: "2026-09-12T00:00:00.000Z",
      },
    });

    render(<AppShell><p>workspace</p></AppShell>);

    expect(screen.queryByText("써 보니 어떠셨나요?")).not.toBeInTheDocument();
  });
});

describe("AppShell 머리 제목", () => {
  beforeEach(() => {
    vi.mocked(useWorkspace).mockReturnValue(baseWorkspace);
  });

  afterEach(() => {
    vi.mocked(usePathname).mockReturnValue("/today");
  });

  it("월별 정리 화면에서는 머리 제목이 일감 상세가 아니라 월별 정리다", () => {
    vi.mocked(usePathname).mockReturnValue("/jobs/summary");
    const { container } = render(<AppShell><p>workspace</p></AppShell>);
    expect(container.querySelector(".topbarContext strong")).toHaveTextContent("월별 정리");
    expect(screen.queryByText("일감 상세")).not.toBeInTheDocument();
  });

  it("일감 화면은 지금처럼 일감 상세다", () => {
    vi.mocked(usePathname).mockReturnValue("/jobs/job_seed_mora");
    const { container } = render(<AppShell><p>workspace</p></AppShell>);
    expect(container.querySelector(".topbarContext strong")).toHaveTextContent("일감 상세");
  });
});

describe("AppShell 새 일감 버튼", () => {
  beforeEach(() => {
    vi.mocked(useWorkspace).mockReturnValue(baseWorkspace);
  });

  afterEach(() => {
    vi.mocked(usePathname).mockReturnValue("/today");
  });

  it.each(["/today", "/jobs", "/jobs/job_seed_mora", "/packages", "/settings"])("데스크톱 사이드바에 '새 일감' 버튼이 늘 있다(%s)", (path) => {
    vi.mocked(usePathname).mockReturnValue(path);
    const { container } = render(<AppShell><p>workspace</p></AppShell>);
    const sidebar = container.querySelector(".desktopSidebar") as HTMLElement;
    const create = within(sidebar).getByRole("link", { name: /새 일감/ });
    expect(create).toHaveAttribute("href", "/jobs/new");
    // 휴대폰 하단 바는 지금처럼 다섯 칸(오늘·일감·새 일감·패키지·설정)이다.
    const bottom = screen.getByRole("navigation", { name: "모바일 주요 메뉴" });
    expect(within(bottom).getAllByRole("link").map((link) => link.textContent?.trim())).toEqual(["오늘", "일감", "새 일감", "패키지", "설정"]);
  });

  it("새 일감 화면에서는 사이드바 버튼이 지금 위치로 표시된다", () => {
    vi.mocked(usePathname).mockReturnValue("/jobs/new");
    const { container } = render(<AppShell><p>workspace</p></AppShell>);
    const sidebar = container.querySelector(".desktopSidebar") as HTMLElement;
    expect(within(sidebar).getByRole("link", { name: /새 일감/ })).toHaveAttribute("aria-current", "page");
    // 일감 메뉴는 새 일감 화면에서 '지금 위치'로 겹쳐 표시하지 않는다.
    expect(within(sidebar).getByRole("link", { name: /^일감\s*\d+$/ })).not.toHaveAttribute("aria-current");
  });
});
