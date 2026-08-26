import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import { useWorkspace } from "./workspace-provider";

vi.mock("next/navigation", () => ({ usePathname: () => "/today" }));
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

  it("shows the 30-day survey link after beta Pro expires", () => {
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

    expect(screen.getByText("30일 사용은 어떠셨나요?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "설문 작성하기" })).toHaveAttribute("href", formUrl);
  });

  it("does not ask for the 30-day survey while beta Pro is active", () => {
    vi.stubEnv("NEXT_PUBLIC_FEEDBACK_FORM_URL", "https://docs.google.com/forms/d/e/TEST/viewform");
    vi.mocked(useWorkspace).mockReturnValue({
      ...baseWorkspace,
      planAccess: {
        ...baseWorkspace.planAccess,
        source: "beta",
        plan: "pro",
        remainingDays: 12,
        expiresAt: "2026-09-07T00:00:00.000Z",
      },
    });

    render(<AppShell><p>workspace</p></AppShell>);

    expect(screen.queryByText("30일 사용은 어떠셨나요?")).not.toBeInTheDocument();
  });
});
