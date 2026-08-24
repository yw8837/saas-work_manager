import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BetaActivationGate } from "./beta-activation-gate";
import { useWorkspace } from "./workspace-provider";

vi.mock("./workspace-provider", () => ({ useWorkspace: vi.fn() }));

const activateInviteCode = vi.fn();
const updateSettings = vi.fn();

const hostedWorkspace = {
  hydrated: true,
  runtimeMode: "hosted",
  settings: { betaCodeOnboardingCompletedAt: undefined },
  planAccess: {
    plan: "free",
    basePlan: "free",
    source: "base",
    expiresAt: null,
    remainingDays: 0,
    trialExpired: false,
    betaExpired: false,
  },
  activateInviteCode,
  updateSettings,
} as unknown as ReturnType<typeof useWorkspace>;

describe("BetaActivationGate", () => {
  beforeEach(() => {
    activateInviteCode.mockReset().mockResolvedValue({
      ok: true,
      message: "코드를 확인했어요. 30일 동안 Pro를 무제한으로 써요.",
    });
    updateSettings.mockReset();
    vi.mocked(useWorkspace).mockReturnValue(hostedWorkspace);
  });

  it("첫 Hosted 진입에서 코드 입력과 무료 시작을 함께 보여준다", () => {
    render(<BetaActivationGate><div>작업공간</div></BetaActivationGate>);

    expect(screen.getByRole("heading", { name: "베타 코드가 있나요?" })).toBeInTheDocument();
    expect(screen.getByLabelText("베타 이용 코드")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "코드 적용하고 Pro 시작" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "코드 없이 무료로 시작" })).toBeInTheDocument();
    expect(screen.queryByText("작업공간")).not.toBeInTheDocument();
  });

  it("코드 적용 성공 뒤 완료 상태를 저장하고 작업공간을 연다", async () => {
    render(<BetaActivationGate><div>작업공간</div></BetaActivationGate>);

    fireEvent.change(screen.getByLabelText("베타 이용 코드"), { target: { value: " beta2026 " } });
    fireEvent.click(screen.getByRole("button", { name: "코드 적용하고 Pro 시작" }));

    await waitFor(() => expect(activateInviteCode).toHaveBeenCalledWith(" beta2026 "));
    expect(updateSettings).toHaveBeenCalledWith({
      betaCodeOnboardingCompletedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(await screen.findByText("작업공간")).toBeInTheDocument();
  });

  it("코드가 없어도 무료 플랜으로 건너뛰고 다시 묻지 않을 상태를 저장한다", () => {
    render(<BetaActivationGate><div>작업공간</div></BetaActivationGate>);

    fireEvent.click(screen.getByRole("button", { name: "코드 없이 무료로 시작" }));

    expect(activateInviteCode).not.toHaveBeenCalled();
    expect(updateSettings).toHaveBeenCalledWith({
      betaCodeOnboardingCompletedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(screen.getByText("작업공간")).toBeInTheDocument();
  });

  it("이미 안내를 마쳤거나 베타 권한이 있으면 바로 작업공간을 연다", () => {
    vi.mocked(useWorkspace).mockReturnValue({
      ...hostedWorkspace,
      settings: { betaCodeOnboardingCompletedAt: "2026-08-25T00:00:00.000Z" },
    } as unknown as ReturnType<typeof useWorkspace>);
    const { rerender } = render(<BetaActivationGate><div>작업공간</div></BetaActivationGate>);
    expect(screen.getByText("작업공간")).toBeInTheDocument();

    vi.mocked(useWorkspace).mockReturnValue({
      ...hostedWorkspace,
      settings: {},
      planAccess: { ...hostedWorkspace.planAccess, plan: "pro", source: "beta" },
    } as unknown as ReturnType<typeof useWorkspace>);
    rerender(<BetaActivationGate><div>베타 작업공간</div></BetaActivationGate>);
    expect(screen.getByText("베타 작업공간")).toBeInTheDocument();
  });

  it("로컬 데모에서는 안내를 끼우지 않는다", () => {
    vi.mocked(useWorkspace).mockReturnValue({
      ...hostedWorkspace,
      runtimeMode: "local",
    } as unknown as ReturnType<typeof useWorkspace>);

    render(<BetaActivationGate><div>로컬 작업공간</div></BetaActivationGate>);
    expect(screen.getByText("로컬 작업공간")).toBeInTheDocument();
  });

  it("코드 확인 중에는 중복 제출을 막고 실패 문구를 보여준다", async () => {
    let resolveRequest!: (value: { ok: boolean; message: string }) => void;
    activateInviteCode.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    render(<BetaActivationGate><div>작업공간</div></BetaActivationGate>);

    fireEvent.change(screen.getByLabelText("베타 이용 코드"), { target: { value: "WRONG" } });
    fireEvent.click(screen.getByRole("button", { name: "코드 적용하고 Pro 시작" }));
    expect(screen.getByRole("button", { name: "코드 확인 중…" })).toBeDisabled();

    resolveRequest({ ok: false, message: "확인되지 않는 코드예요." });
    expect(await screen.findByText("확인되지 않는 코드예요.")).toBeInTheDocument();
    expect(screen.queryByText("작업공간")).not.toBeInTheDocument();
  });
});
