import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/policies";

const auth = vi.hoisted(() => ({
  authStatus: "signed_out" as "signed_out" | "signed_in",
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  hasAcceptance: vi.fn(),
  recordAcceptance: vi.fn(),
  client: {},
}));

const mobile = vi.hoisted(() => ({
  platform: "web",
  status: { pending: false, error: null as string | null },
  subscribers: new Set<() => void>(),
}));
vi.mock("@/lib/native/platform", () => ({ nativePlatform: () => mobile.platform }));
vi.mock("@/lib/native/auth-runtime", () => ({
  nativeAuthStatus: () => mobile.status,
  subscribeNativeAuth: (listener: () => void) => {
    mobile.subscribers.add(listener);
    return () => { mobile.subscribers.delete(listener); };
  },
  async cancelNativeOAuth() {
    mobile.status = { pending: false, error: null };
    mobile.subscribers.forEach((listener) => listener());
  },
}));

vi.mock("./workspace-provider", () => ({
  useWorkspace: () => ({
    runtimeMode: "hosted",
    authStatus: auth.authStatus,
    authError: null,
    signInWithGoogle: auth.signInWithGoogle,
    signOut: auth.signOut,
  }),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseBrowserClient: vi.fn(() => auth.client),
  hasCurrentPolicyAcceptance: auth.hasAcceptance,
  recordCurrentPolicyAcceptance: auth.recordAcceptance,
}));

import { WorkspaceAuthGate } from "./workspace-auth-gate";

describe("WorkspaceAuthGate Google login", () => {
  beforeEach(() => {
    mobile.platform = "web";
    mobile.status = { pending: false, error: null };
    mobile.subscribers.clear();
    auth.authStatus = "signed_out";
    auth.signInWithGoogle.mockReset().mockResolvedValue(undefined);
    auth.signOut.mockReset().mockResolvedValue(undefined);
    auth.hasAcceptance.mockReset().mockResolvedValue(false);
    auth.recordAcceptance.mockReset().mockResolvedValue(undefined);
    vi.stubEnv("NEXT_PUBLIC_OPERATOR_NAME", "테스트 운영자");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "support@example.com");
    vi.stubEnv("NEXT_PUBLIC_BETA_SIGNUP_ENABLED", "true");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("offers one Google login action without email or password fields", () => {
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);

    expect(screen.getByRole("heading", { name: "Google 계정으로 시작하기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google로 계속하기" })).toBeInTheDocument();
    expect(screen.queryByLabelText("이메일")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("비밀번호")).not.toBeInTheDocument();
    expect(screen.queryByText(/초대형|폐쇄 베타|베타 계정/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
  });

  it("starts Google OAuth from the only login action", async () => {
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);

    fireEvent.click(screen.getByRole("button", { name: "Google로 계속하기" }));
    await waitFor(() => expect(auth.signInWithGoogle).toHaveBeenCalledWith());
  });
  it("allows cancelling and retrying a native browser login", async () => {
    mobile.platform = "android";
    auth.signInWithGoogle.mockImplementation(async () => {
      mobile.status = { pending: true, error: null };
      mobile.subscribers.forEach((listener) => listener());
    });
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);
    fireEvent.click(screen.getByRole("button", { name: "Google로 계속하기" }));
    const cancel = await screen.findByRole("button", { name: "로그인 취소" });
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.getByRole("button", { name: "Google로 계속하기" })).toBeEnabled());
  });

  it("blocks a signed-in account until the current policies are recorded", async () => {
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
