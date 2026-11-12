import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { betaSurveyPromptKey } from "@/lib/beta-survey-prompt";
import { AppShell } from "./app-shell";
import { BETA_SURVEY_DIALOG_TITLE } from "./beta-survey-dialog";
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

describe("AppShell 이용권이 끝난 뒤 설문 팝업", () => {
  const formUrl = "https://docs.google.com/forms/d/e/TEST/viewform";
  const DAY_MS = 86_400_000;
  let accountSeq = 0;

  function expiredWorkspace(userId: string) {
    return {
      ...baseWorkspace,
      userId,
      planAccess: { ...baseWorkspace.planAccess, betaExpired: true },
    } as unknown as ReturnType<typeof useWorkspace>;
  }

  /** 시험마다 새 계정을 써서 이번 방문 기억(모듈 변수)이 서로 섞이지 않게 한다. */
  function nextAccount() {
    accountSeq += 1;
    return `user-test-${accountSeq}`;
  }

  function readRecord(account: string) {
    return JSON.parse(window.localStorage.getItem(betaSurveyPromptKey(account)) ?? "null");
  }

  async function settle() {
    await act(async () => {});
  }

  class MemoryStorage {
    private values = new Map<string, string>();
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { this.values.set(key, value); }
    removeItem(key: string) { this.values.delete(key); }
    clear() { this.values.clear(); }
  }

  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: new MemoryStorage() });
    vi.stubEnv("NEXT_PUBLIC_FEEDBACK_FORM_URL", formUrl);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("이용권이 끝난 계정이 작업 화면에 들어오면 팝업이 뜨고, 떠 있는 동안 띠는 숨긴다", async () => {
    const account = nextAccount();
    vi.mocked(useWorkspace).mockReturnValue(expiredWorkspace(account));
    const { container } = render(<AppShell><p>workspace</p></AppShell>);

    const dialog = await screen.findByRole("dialog", { name: BETA_SURVEY_DIALOG_TITLE });
    expect(dialog).toHaveAttribute("data-testid", "beta-survey-dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(BETA_SURVEY_DIALOG_TITLE).toBe("Pro 14일 이용권이 끝났어요. 써 보니 어떠셨나요?");
    expect(dialog).toHaveTextContent("설문 답변은 일감체크의 기능과 요금을 정하는 데 써요.");
    expect(dialog).toHaveTextContent("지금은 무료 플랜(동시 2건·누적 10건)으로 계속 쓸 수 있어요.");
    expect(dialog).toHaveTextContent("고객 이름이나 연락처 같은 개인정보는 적지 말아주세요.");
    // 시간 숫자('1분이면' 같은)는 쓰지 않는다.
    expect(dialog).not.toHaveTextContent(/\d+\s*(초|분|시간)/);
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(container.querySelector(".betaSurveyBanner")).toBeNull();
  });

  it("'설문 작성하기'는 새 탭 링크이고, 누르면 닫히고 다시 뜨지 않으며 띠도 숨긴다", async () => {
    const account = nextAccount();
    vi.mocked(useWorkspace).mockReturnValue(expiredWorkspace(account));
    const first = render(<AppShell><p>workspace</p></AppShell>);

    const link = await screen.findByTestId("beta-survey-open");
    expect(link).toHaveAttribute("href", formUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(link);

    expect(screen.queryByTestId("beta-survey-dialog")).toBeNull();
    expect(first.container.querySelector(".betaSurveyBanner")).toBeNull();
    expect(readRecord(account)).toMatchObject({ answer: "opened" });

    first.unmount();
    const second = render(<AppShell><p>workspace</p></AppShell>);
    await settle();
    expect(screen.queryByTestId("beta-survey-dialog")).toBeNull();
    expect(second.container.querySelector(".betaSurveyBanner")).toBeNull();
  });

  it("'나중에 할게요'는 닫고 띠를 다시 보이며, 바로 다시 들어오면 안 뜨고 3일 뒤에는 뜬다", async () => {
    const account = nextAccount();
    vi.mocked(useWorkspace).mockReturnValue(expiredWorkspace(account));
    const first = render(<AppShell><p>workspace</p></AppShell>);

    fireEvent.click(await screen.findByTestId("beta-survey-later"));
    expect(screen.queryByTestId("beta-survey-dialog")).toBeNull();
    expect(within(first.container.querySelector(".betaSurveyBanner") as HTMLElement).getByRole("link", { name: "설문 작성하기" }))
      .toHaveAttribute("href", formUrl);
    const record = readRecord(account);
    expect(record).toMatchObject({ laterCount: 1, answer: null });

    first.unmount();
    const again = render(<AppShell><p>workspace</p></AppShell>);
    await settle();
    expect(screen.queryByTestId("beta-survey-dialog")).toBeNull();
    again.unmount();

    // 기록 시각을 3일 전으로 옮기면 다음 접속에 다시 뜬다.
    window.localStorage.setItem(betaSurveyPromptKey(account), JSON.stringify({
      ...record,
      lastLaterAt: new Date(Date.now() - 3 * DAY_MS - 1000).toISOString(),
    }));
    render(<AppShell><p>workspace</p></AppShell>);
    expect(await screen.findByTestId("beta-survey-dialog")).toBeInTheDocument();
  });

  it("'나중에 할게요'를 3번 고른 계정에는 더는 띄우지 않는다", async () => {
    const account = nextAccount();
    window.localStorage.setItem(betaSurveyPromptKey(account), JSON.stringify({
      laterCount: 3,
      lastLaterAt: new Date(Date.now() - 30 * DAY_MS).toISOString(),
      answer: null,
    }));
    vi.mocked(useWorkspace).mockReturnValue(expiredWorkspace(account));
    const { container } = render(<AppShell><p>workspace</p></AppShell>);
    await settle();
    expect(screen.queryByTestId("beta-survey-dialog")).toBeNull();
    expect(container.querySelector(".betaSurveyBanner")).not.toBeNull();
  });

  it("'다시 보지 않기'는 닫고 띠도 숨기며 다시 뜨지 않는다", async () => {
    const account = nextAccount();
    vi.mocked(useWorkspace).mockReturnValue(expiredWorkspace(account));
    const first = render(<AppShell><p>workspace</p></AppShell>);

    fireEvent.click(await screen.findByTestId("beta-survey-never"));
    expect(screen.queryByTestId("beta-survey-dialog")).toBeNull();
    expect(first.container.querySelector(".betaSurveyBanner")).toBeNull();
    expect(readRecord(account)).toMatchObject({ answer: "never" });

    first.unmount();
    const second = render(<AppShell><p>workspace</p></AppShell>);
    await settle();
    expect(screen.queryByTestId("beta-survey-dialog")).toBeNull();
    expect(second.container.querySelector(".betaSurveyBanner")).toBeNull();
  });

  it.each([
    ["Esc", () => fireEvent.keyDown(document, { key: "Escape" })],
    ["닫기(X)", () => fireEvent.click(screen.getByRole("button", { name: "닫기" }))],
    ["바깥 누르기", () => fireEvent.mouseDown(document.querySelector(".betaSurveyOverlay") as HTMLElement)],
  ])("%s는 '나중에 할게요'와 같다", async (_label, close) => {
    const account = nextAccount();
    vi.mocked(useWorkspace).mockReturnValue(expiredWorkspace(account));
    const { container } = render(<AppShell><p>workspace</p></AppShell>);
    await screen.findByTestId("beta-survey-dialog");

    close();

    expect(screen.queryByTestId("beta-survey-dialog")).toBeNull();
    expect(container.querySelector(".betaSurveyBanner")).not.toBeNull();
    expect(readRecord(account)).toMatchObject({ laterCount: 1, answer: null });
  });

  it("팝업 안을 누르는 것은 바깥 누르기로 치지 않는다", async () => {
    vi.mocked(useWorkspace).mockReturnValue(expiredWorkspace(nextAccount()));
    render(<AppShell><p>workspace</p></AppShell>);
    const dialog = await screen.findByTestId("beta-survey-dialog");
    fireEvent.mouseDown(dialog);
    expect(screen.getByTestId("beta-survey-dialog")).toBeInTheDocument();
  });

  it("탭 이동은 팝업 안에서만 돌고, 닫으면 초점이 원래 자리로 돌아간다", async () => {
    vi.mocked(useWorkspace).mockReturnValue(expiredWorkspace(nextAccount()));
    render(<AppShell><button type="button">작업 버튼</button></AppShell>);
    const origin = screen.getByRole("button", { name: "작업 버튼" });
    origin.focus();

    const dialog = await screen.findByTestId("beta-survey-dialog");
    expect(document.activeElement).toBe(dialog);
    const close = within(dialog).getByRole("button", { name: "닫기" });
    const never = within(dialog).getByTestId("beta-survey-never");

    never.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(never);

    origin.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.click(within(dialog).getByTestId("beta-survey-later"));
    expect(document.activeElement).toBe(origin);
  });

  it("계정마다 기록을 따로 둔다(한 계정의 '다시 보지 않기'가 다른 계정에 번지지 않는다)", async () => {
    const accountA = nextAccount();
    const accountB = nextAccount();
    vi.mocked(useWorkspace).mockReturnValue(expiredWorkspace(accountA));
    const first = render(<AppShell><p>workspace</p></AppShell>);
    fireEvent.click(await screen.findByTestId("beta-survey-never"));
    first.unmount();

    vi.mocked(useWorkspace).mockReturnValue(expiredWorkspace(accountB));
    render(<AppShell><p>workspace</p></AppShell>);
    expect(await screen.findByTestId("beta-survey-dialog")).toBeInTheDocument();
    expect(readRecord(accountA)).toMatchObject({ answer: "never" });
    expect(readRecord(accountB)).toBeNull();
  });

  it("로컬 모드는 이 기기 하나를 계정으로 보고 기록한다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({
      ...expiredWorkspace("ignored"),
      runtimeMode: "local",
      userId: null,
    } as unknown as ReturnType<typeof useWorkspace>);
    render(<AppShell><p>workspace</p></AppShell>);
    fireEvent.click(await screen.findByTestId("beta-survey-later"));
    expect(readRecord("local")).toMatchObject({ laterCount: 1 });
  });

  it("브라우저 저장소를 못 쓰면 오류 없이 이번 방문에 한 번만 띄운다", async () => {
    const own = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() { throw new Error("저장소 차단"); },
    });
    try {
      vi.mocked(useWorkspace).mockReturnValue(expiredWorkspace(nextAccount()));
      const first = render(<AppShell><p>workspace</p></AppShell>);
      expect(await screen.findByTestId("beta-survey-dialog")).toBeInTheDocument();
      // 고르지 않고 화면을 다시 그려도 이번 방문에는 다시 뜨지 않는다.
      first.unmount();
      const second = render(<AppShell><p>workspace</p></AppShell>);
      await settle();
      expect(screen.queryByTestId("beta-survey-dialog")).toBeNull();
      expect(second.container.querySelector(".betaSurveyBanner")).not.toBeNull();
    } finally {
      if (own) Object.defineProperty(window, "localStorage", own);
      else delete (window as { localStorage?: Storage }).localStorage;
    }
  });

  it("이용권을 쓰는 중(7일째 이후)에는 팝업 없이 띠만 보인다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({
      ...baseWorkspace,
      userId: nextAccount(),
      planAccess: { ...baseWorkspace.planAccess, source: "beta", plan: "pro", remainingDays: 3, expiresAt: "2026-11-15T00:00:00.000Z" },
    } as unknown as ReturnType<typeof useWorkspace>);
    const { container } = render(<AppShell><p>workspace</p></AppShell>);
    await settle();
    expect(screen.queryByTestId("beta-survey-dialog")).toBeNull();
    expect(container.querySelector(".betaSurveyBanner")).not.toBeNull();
  });

  it("유료·기본 플랜처럼 betaExpired가 거짓이면 띄우지 않는다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({
      ...baseWorkspace,
      userId: nextAccount(),
      planAccess: { ...baseWorkspace.planAccess, plan: "basic", basePlan: "basic" },
    } as unknown as ReturnType<typeof useWorkspace>);
    render(<AppShell><p>workspace</p></AppShell>);
    await settle();
    expect(screen.queryByTestId("beta-survey-dialog")).toBeNull();
  });

  it("설문 주소가 없으면 띄우지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_FEEDBACK_FORM_URL", "");
    vi.mocked(useWorkspace).mockReturnValue(expiredWorkspace(nextAccount()));
    render(<AppShell><p>workspace</p></AppShell>);
    await settle();
    expect(screen.queryByTestId("beta-survey-dialog")).toBeNull();
  });

  it("로그인 모드에서 계정 id가 아직 없으면 판정하지 않는다", async () => {
    vi.mocked(useWorkspace).mockReturnValue({
      ...expiredWorkspace("ignored"),
      userId: null,
    } as unknown as ReturnType<typeof useWorkspace>);
    render(<AppShell><p>workspace</p></AppShell>);
    await settle();
    expect(screen.queryByTestId("beta-survey-dialog")).toBeNull();
  });
});
