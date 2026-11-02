import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";
import { planSummary } from "./profile-menu";
import { useWorkspace } from "./workspace-provider";

vi.mock("next/navigation", () => ({ usePathname: () => "/today" }));
vi.mock("./workspace-provider", () => ({ useWorkspace: vi.fn() }));

const signOut = vi.fn();
const baseWorkspace = {
  jobs: [],
  alerts: [],
  runtimeMode: "hosted",
  userEmail: "owner@example.com",
  saveStatus: "saved",
  saveError: null,
  realtimeStatus: "connected",
  realtimeError: null,
  signOut,
  planAccess: { plan: "pro", basePlan: "free", source: "beta", remainingDays: 12, expiresAt: null, trialExpired: false, betaExpired: false },
} as unknown as ReturnType<typeof useWorkspace>;

function openMenu() {
  render(<AppShell><p>workspace</p></AppShell>);
  const button = screen.getByRole("button", { name: "계정 메뉴 열기: owner@example.com" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(button);
  return button;
}

describe("상단바 계정 표시 → 프로필 메뉴", () => {
  beforeEach(() => {
    signOut.mockReset().mockResolvedValue(undefined);
    vi.mocked(useWorkspace).mockReturnValue(baseWorkspace);
  });

  it("누르면 로그인한 계정·요금제·설정·로그아웃을 보여 주고, Esc로 닫는다", () => {
    const button = openMenu();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("profile-email")).toHaveTextContent("owner@example.com");
    expect(screen.getByTestId("profile-plan")).toHaveTextContent("Pro 베타 · 12일 남음");
    expect(within(screen.getByTestId("profile-menu")).getByRole("link", { name: "설정" })).toHaveAttribute("href", "/settings");
    expect(screen.getByTestId("profile-sign-out")).toBeEnabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("profile-menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("로그아웃은 설정 화면과 같은 함수를 부르고, 성공하면 메뉴를 닫는다", async () => {
    openMenu();
    fireEvent.click(screen.getByTestId("profile-sign-out"));
    await waitFor(() => expect(screen.queryByTestId("profile-menu")).not.toBeInTheDocument());
    expect(signOut).toHaveBeenCalledWith();
  });

  it("저장 안 된 변경 때문에 멈추면 이유와 설정으로 가는 길을 보여 준다", async () => {
    signOut.mockRejectedValueOnce(new Error("미저장 변경이 있어 로그아웃을 멈췄어요."));
    openMenu();
    fireEvent.click(screen.getByTestId("profile-sign-out"));
    const alert = await screen.findByText(/미저장 변경이 있어 로그아웃을 멈췄어요/);
    expect(alert).toHaveAttribute("role", "alert");
    expect(screen.getByRole("link", { name: "설정에서 처리하기" })).toHaveAttribute("href", "/settings");
  });

  it("이 브라우저 저장 모드에서는 로그아웃 없이 저장 위치만 보여 준다", () => {
    vi.mocked(useWorkspace).mockReturnValue({ ...baseWorkspace, runtimeMode: "local", userEmail: null } as unknown as ReturnType<typeof useWorkspace>);
    render(<AppShell><p>workspace</p></AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "계정 메뉴 열기: 이 브라우저에 저장" }));
    expect(screen.getByTestId("profile-email")).toHaveTextContent("이 브라우저에 저장");
    expect(screen.queryByTestId("profile-sign-out")).not.toBeInTheDocument();
  });

  it("요금제 한 줄: 무료·Basic은 이름만, 베타·체험은 남은 날까지", () => {
    expect(planSummary({ plan: "free", source: "base", remainingDays: 0 })).toBe("무료");
    expect(planSummary({ plan: "basic", source: "base", remainingDays: 0 })).toBe("Basic");
    expect(planSummary({ plan: "pro", source: "trial", remainingDays: 3 })).toBe("Pro 체험 · 3일 남음");
  });
});
