import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/policies";

const auth = vi.hoisted(() => ({
  authStatus: "signed_out" as "signed_out" | "signed_in",
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  hasAcceptance: vi.fn(),
  recordAcceptance: vi.fn(),
  client: {},
}));

vi.mock("./workspace-provider", () => ({
  useWorkspace: () => ({
    runtimeMode: "hosted",
    authStatus: auth.authStatus,
    authError: null,
    signIn: auth.signIn,
    signUp: auth.signUp,
    signOut: auth.signOut,
  }),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseBrowserClient: vi.fn(() => auth.client),
  hasCurrentPolicyAcceptance: auth.hasAcceptance,
  recordCurrentPolicyAcceptance: auth.recordAcceptance,
}));

import { WorkspaceAuthGate } from "./workspace-auth-gate";

describe("WorkspaceAuthGate beta signup", () => {
  beforeEach(() => {
    auth.authStatus = "signed_out";
    auth.signIn.mockReset();
    auth.signUp.mockReset().mockResolvedValue("확인 메일을 보냈어요.");
    auth.signOut.mockReset().mockResolvedValue(undefined);
    auth.hasAcceptance.mockReset().mockResolvedValue(false);
    auth.recordAcceptance.mockReset().mockResolvedValue(undefined);
    vi.stubEnv("NEXT_PUBLIC_OPERATOR_NAME", "테스트 운영자");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "support@example.com");
    vi.stubEnv("NEXT_PUBLIC_BETA_SIGNUP_ENABLED", "false");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("keeps hosted signup closed unless the deployment explicitly enables it", () => {
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);

    expect(screen.getByText("지금은 초대형 폐쇄 베타예요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "베타 계정 만들기" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
  });

  it("requires one explicit checkbox and passes the displayed versions to signup", async () => {
    vi.stubEnv("NEXT_PUBLIC_BETA_SIGNUP_ENABLED", "true");
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);

    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "beta@example.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "long-password" } });
    fireEvent.click(screen.getByRole("button", { name: "베타 계정 만들기" }));

    const consent = screen.getByRole("checkbox");
    expect(consent).toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "동의하고 베타 가입" }));
    expect(auth.signUp).not.toHaveBeenCalled();

    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "동의하고 베타 가입" }));

    await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith(
      "beta@example.com",
      "long-password",
      { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    ));
  });

  it("blocks an invited signed-in account until the current policies are recorded", async () => {
    auth.authStatus = "signed_in";
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);

    expect(screen.queryByText("private workspace")).not.toBeInTheDocument();
    await screen.findByRole("heading", { name: "첫 사용 전 동의가 필요해요" });
    expect(auth.hasAcceptance).toHaveBeenCalledWith(auth.client);

    const consent = screen.getByRole("checkbox");
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "동의하고 작업공간 열기" }));

    await waitFor(() => expect(auth.recordAcceptance).toHaveBeenCalledWith(
      auth.client,
      { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    ));
    expect(await screen.findByText("private workspace")).toBeInTheDocument();
  });
});
