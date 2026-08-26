import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSeedState } from "@/lib/store";
import { PLAN_LIMITS, PLAN_PRICES } from "@/lib/domain";
import { SettingsPanel } from "./settings-panel";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", () => ({ useWorkspace: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  getNotificationCapability: () => ({ permission: "default", supported: true }),
  requestBrowserNotificationPermission: vi.fn(),
  sendTestNotification: vi.fn(),
}));

const deleteAccount = vi.fn();
const signInWithGoogle = vi.fn();
const signOut = vi.fn();
const activateInviteCode = vi.fn();
const seed = createSeedState("2026-08-16");
const hostedWorkspace = {
  ...seed,
  runtimeMode: "hosted",
  userEmail: "owner@example.test",
  updateSettings: vi.fn(),
  signOut,
  signInWithGoogle,
  deleteAccount,
  saveStatus: "saved",
  saveError: null,
  realtimeStatus: "connected",
  realtimeError: null,
  // 3단계 플랜 도입으로 플랜 섹션이 읽는 값이 늘었다.
  plan: "free",
  basePlan: "free",
  planAccess: {
    plan: "free",
    basePlan: "free",
    source: "base",
    expiresAt: null,
    remainingDays: 0,
    trialExpired: false,
    betaExpired: false,
  },
  limits: PLAN_LIMITS.free,
  activeJobCount: 2,
  canCreateJob: true,
  jobLimitHit: null,
  canCreatePackage: true,
  canCreateOption: true,
  activateInviteCode,
} as unknown as ReturnType<typeof useWorkspace>;

describe("SettingsPanel account deletion", () => {
  beforeEach(() => {
    deleteAccount.mockReset();
    deleteAccount.mockResolvedValue(undefined);
    signOut.mockReset().mockResolvedValue(undefined);
    signInWithGoogle.mockReset().mockResolvedValue(undefined);
    activateInviteCode.mockReset().mockResolvedValue({ ok: true, message: "코드를 확인했어요." });
    vi.mocked(useWorkspace).mockReturnValue(hostedWorkspace);
  });

  it("honestly disables server account deletion in local demo mode", () => {
    vi.mocked(useWorkspace).mockReturnValue({
      ...hostedWorkspace,
      runtimeMode: "local",
      userEmail: null,
    });

    render(<SettingsPanel />);
    expect(screen.getByText(/지울 서버 계정이 없어요/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "계정 삭제 검토" })).toBeDisabled();
  });

  it("requires Google reauthentication and the exact destructive phrase", async () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "계정 삭제 검토" }));

    expect(screen.getByText(/먼저 JSON 백업을 내려받아/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Google로 본인 확인" }));
    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledWith("/settings?accountDelete=1"));
    const finalButton = screen.getByRole("button", { name: "계정과 모든 데이터 영구 삭제" });
    expect(finalButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/확인 문구/), { target: { value: "삭제" } });
    expect(finalButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/확인 문구/), { target: { value: "계정 삭제" } });
    expect(finalButton).toBeEnabled();
    fireEvent.click(finalButton);

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith());
  });

  it("shows a reauthentication failure without closing the confirmation", async () => {
    deleteAccount.mockRejectedValueOnce(new Error("Google로 다시 본인 확인한 뒤 시도해주세요."));
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "계정 삭제 검토" }));
    fireEvent.change(screen.getByLabelText(/확인 문구/), { target: { value: "계정 삭제" } });
    fireEvent.click(screen.getByRole("button", { name: "계정과 모든 데이터 영구 삭제" }));

    expect(await screen.findByText("Google로 다시 본인 확인한 뒤 시도해주세요.")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "정말 영구 삭제할까요?" })).toBeInTheDocument();
  });

  it("offers an explicit local-session exit when unsaved changes block normal logout", async () => {
    signOut
      .mockRejectedValueOnce(Object.assign(new Error("미저장 변경이 있어요."), { code: "UNSAVED_WORKSPACE" }))
      .mockResolvedValueOnce(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SettingsPanel />);

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByRole("button", { name: "미저장 변경 버리고 로그아웃" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "미저장 변경 버리고 로그아웃" }));

    await waitFor(() => expect(signOut).toHaveBeenLastCalledWith({ discardUnsaved: true }));
  });
});

describe("SettingsPanel 플랜 섹션", () => {
  beforeEach(() => {
    activateInviteCode.mockReset().mockResolvedValue({ ok: true, message: "코드를 확인했어요. 30일 동안 Pro를 무제한으로 써요." });
    vi.mocked(useWorkspace).mockReturnValue(hostedWorkspace);
  });

  it("세 단계 요금과 현재 사용량을 보여주고 결제는 준비 중으로 남긴다", () => {
    render(<SettingsPanel />);
    expect(screen.getByTestId("current-plan")).toHaveTextContent("무료");
    const tiers = screen.getByTestId("plan-tiers");
    expect(tiers).toHaveTextContent(`무료 · ${PLAN_PRICES.free.label}`);
    expect(tiers).toHaveTextContent(`Basic · ${PLAN_PRICES.basic.label}`);
    expect(tiers).toHaveTextContent(`Pro · ${PLAN_PRICES.pro.label}`);
    expect(tiers).toHaveTextContent(
      `동시 ${PLAN_LIMITS.free.activeJobs}건 · 누적 ${PLAN_LIMITS.free.totalJobs}건`,
    );
    expect(screen.getByTestId("plan-usage")).toHaveTextContent(
      `지금까지 만든 일감 ${seed.jobsCreatedTotal}건 / ${PLAN_LIMITS.free.totalJobs}건`,
    );
    // 결제가 아직 없다는 사실을 감추지 않는다.
    expect(screen.getByTestId("upgrade-cta")).toBeDisabled();
  });

  it("입력한 베타 이용 코드를 그대로 넘기고 30일 Pro와 파운더 혜택을 설명한다", async () => {
    render(<SettingsPanel />);
    fireEvent.change(screen.getByLabelText("베타 이용 코드"), { target: { value: " beta2026 " } });
    fireEvent.click(screen.getByTestId("redeem-invite"));

    expect(activateInviteCode).toHaveBeenCalledWith(" beta2026 ");
    // 서버 확인을 기다리므로 문구도 응답 뒤에 나타난다.
    expect(await screen.findByText(/30일 동안 Pro를 무제한으로 써요./)).toBeInTheDocument();
    expect(screen.getByText(/Basic 정가 월 14,900원을 월 9,900원에 12개월/)).toBeInTheDocument();
  });

  it("틀린 코드는 실패 문구를 보여준다", async () => {
    activateInviteCode.mockResolvedValue({ ok: false, message: "확인되지 않는 코드예요. 받은 코드를 다시 확인해주세요." });
    render(<SettingsPanel />);
    fireEvent.change(screen.getByLabelText("베타 이용 코드"), { target: { value: "NOPE" } });
    fireEvent.click(screen.getByTestId("redeem-invite"));

    expect(await screen.findByText(/확인되지 않는 코드예요./)).toBeInTheDocument();
  });

  it("서버 내부 표식은 숨기고 베타 Pro 적용 상태와 만료일만 보여준다", () => {
    vi.mocked(useWorkspace).mockReturnValue({
      ...hostedWorkspace,
      betaAccess: { code: "server", grantedAt: "2026-08-25T00:00:00.000Z", expiresAt: "2026-09-24T00:00:00.000Z" },
      plan: "pro",
      limits: PLAN_LIMITS.pro,
      planAccess: {
        ...hostedWorkspace.planAccess,
        plan: "pro",
        source: "beta",
        expiresAt: "2026-09-24T00:00:00.000Z",
        remainingDays: 30,
      },
    } as unknown as ReturnType<typeof useWorkspace>);

    render(<SettingsPanel />);
    const applied = screen.getByTestId("beta-code-applied");
    expect(applied).toHaveTextContent("베타 Pro 적용됨");
    expect(applied).toHaveTextContent("2026. 9. 24.");
    expect(applied).not.toHaveTextContent("server");
    expect(applied).not.toHaveTextContent("적용한 코드");
  });

  it("코드 확인 중에는 적용 버튼을 비활성화해 중복 요청을 막는다", async () => {
    activateInviteCode.mockReturnValue(new Promise(() => undefined));
    render(<SettingsPanel />);
    fireEvent.change(screen.getByLabelText("베타 이용 코드"), { target: { value: "BETA2026" } });
    fireEvent.click(screen.getByTestId("redeem-invite"));

    await waitFor(() => expect(screen.getByTestId("redeem-invite")).toBeDisabled());
    expect(screen.getByTestId("redeem-invite")).toHaveTextContent("적용 중");
    fireEvent.click(screen.getByTestId("redeem-invite"));
    expect(activateInviteCode).toHaveBeenCalledTimes(1);
  });

  it("체험 중이면 남은 일수를 보여준다", () => {
    vi.mocked(useWorkspace).mockReturnValue({
      ...hostedWorkspace,
      plan: "pro",
      limits: PLAN_LIMITS.pro,
      planAccess: { ...hostedWorkspace.planAccess, plan: "pro", source: "trial", remainingDays: 5 },
    } as unknown as ReturnType<typeof useWorkspace>);

    render(<SettingsPanel />);
    expect(screen.getByTestId("current-plan")).toHaveTextContent("Pro");
    expect(screen.getByTestId("plan-status")).toHaveTextContent("5일 남음");
    expect(screen.queryByTestId("plan-expiry-notice")).not.toBeInTheDocument();
  });

  it("베타 코드가 끝나면 무료로 돌아온 이유를 알려준다", () => {
    vi.mocked(useWorkspace).mockReturnValue({
      ...hostedWorkspace,
      planAccess: { ...hostedWorkspace.planAccess, source: "base", trialExpired: true, betaExpired: true },
    } as unknown as ReturnType<typeof useWorkspace>);

    render(<SettingsPanel />);
    expect(screen.getByTestId("plan-expiry-notice")).toHaveTextContent("베타 이용 기간이 끝나 무료 플랜으로 돌아왔어요.");
  });
});
