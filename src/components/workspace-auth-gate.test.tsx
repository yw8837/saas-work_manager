import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {} from "vitest/jsdom";

import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/policies";

const auth = vi.hoisted(() => ({
  authStatus: "signed_out" as "signed_out" | "signed_in" | "offline",
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  acceptanceState: vi.fn(),
  recordAcceptance: vi.fn(),
  client: {} as object | null,
}));

const mobile = vi.hoisted(() => ({
  platform: "web",
  status: { pending: false, error: null as string | null },
  subscribers: new Set<() => void>(),
}));
vi.mock("@/lib/native/platform", () => ({ nativePlatform: () => mobile.platform }));
vi.mock("./native-offline-workspace", () => ({
  NativeOfflineWorkspace: () => <div>offline read-only workspace</div>,
}));
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
  readPolicyAcceptanceState: auth.acceptanceState,
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
    auth.acceptanceState.mockReset().mockResolvedValue("none");
    auth.recordAcceptance.mockReset().mockResolvedValue(undefined);
    auth.client = {};
    vi.stubEnv("NEXT_PUBLIC_OPERATOR_NAME", "테스트 운영자");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "support@example.com");
    vi.stubEnv("NEXT_PUBLIC_BETA_SIGNUP_ENABLED", "true");
  });

  afterEach(() => vi.unstubAllEnvs());
  it("does not expose editable children or attempt policy writes in native offline mode", () => {
    mobile.platform = "android";
    auth.authStatus = "offline";
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);
    expect(screen.getByText("offline read-only workspace")).toBeInTheDocument();
    expect(screen.queryByText("private workspace")).not.toBeInTheDocument();
    expect(auth.recordAcceptance).not.toHaveBeenCalled();
  });

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

  it("온라인 저장 연결이 없으면 개발 말 없이 설정을 확인하라고 알린다", async () => {
    auth.authStatus = "signed_in";
    auth.client = null;
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);

    expect(await screen.findByRole("heading", { name: "온라인 저장 설정을 확인해 주세요" })).toBeInTheDocument();
    expect(screen.getByText("정책 동의 기록을 확인할 서버 연결이 없어요.")).toBeInTheDocument();
    expect(screen.queryByText("private workspace")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Hosted|Supabase|migration/);
  });

  it("blocks a signed-in account until the current policies are recorded", async () => {
    auth.authStatus = "signed_in";
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);

    expect(screen.queryByText("private workspace")).not.toBeInTheDocument();
    await screen.findByRole("heading", { name: "첫 사용 전 동의가 필요해요" });
    expect(auth.acceptanceState).toHaveBeenCalledWith(auth.client);
    expect(screen.queryByText("베타 이용 코드 Pro 기간 14일 · 호스팅 사업자 Cloudflare로 표기")).not.toBeInTheDocument();

    const consent = screen.getByRole("checkbox");
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole("button", { name: "동의하고 작업공간 열기" }));

    await waitFor(() => expect(auth.recordAcceptance).toHaveBeenCalledWith(
      auth.client,
      { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    ));
    expect(await screen.findByText("private workspace")).toBeInTheDocument();
  });

  it("예전 버전에 동의한 계정에는 '약관이 바뀌었어요'와 바뀐 점을 보여 주고 새 버전 동의를 받는다", async () => {
    auth.authStatus = "signed_in";
    auth.acceptanceState.mockResolvedValue("outdated");
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);

    await screen.findByRole("heading", { name: "약관이 바뀌었어요" });
    expect(screen.getByText("베타 이용 코드 Pro 기간 14일 · 호스팅 사업자 Cloudflare로 표기")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "첫 사용 전 동의가 필요해요" })).not.toBeInTheDocument();
    expect(screen.queryByText("private workspace")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 작업공간 열기" }));
    await waitFor(() => expect(auth.recordAcceptance).toHaveBeenCalledWith(
      auth.client,
      { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    ));
    expect(await screen.findByText("private workspace")).toBeInTheDocument();
  });

  it("지금 버전에 이미 동의한 계정은 동의 화면 없이 바로 연다", async () => {
    auth.authStatus = "signed_in";
    auth.acceptanceState.mockResolvedValue("current");
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);

    expect(await screen.findByText("private workspace")).toBeInTheDocument();
    expect(auth.recordAcceptance).not.toHaveBeenCalled();
  });
});

describe("WorkspaceAuthGate 초대 링크", () => {
  class MemoryStorage {
    values = new Map<string, string>();
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { this.values.set(key, value); }
    removeItem(key: string) { this.values.delete(key); }
    clear() { this.values.clear(); }
  }
  const originalUrl = window.location.href;

  beforeEach(() => {
    mobile.platform = "web";
    auth.authStatus = "signed_out";
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: new MemoryStorage() });
  });
  afterEach(() => jsdom.reconfigure({ url: originalUrl }));

  it("로그인 전에 주소의 코드를 이 탭에 옮겨 두고 주소에서 지운 뒤, 자동 적용된다고 알린다", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?invite=MAILCODE" });
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);
    expect(window.location.search).toBe("");
    expect(window.sessionStorage.getItem("ilgamcheck:pending-invite")).toBe("MAILCODE");
    expect(await screen.findByTestId("invite-ready")).toHaveTextContent("베타 코드가 자동으로 적용돼요");
    // 화면 어디에도 코드 값을 그대로 보여 주지 않는다.
    expect(document.body.textContent).not.toContain("MAILCODE");
  });

  it("업종 예시 링크: 로그인 전에 주소의 업종을 이 탭에 옮겨 두고 주소에서 지운다(Google 복귀 주소 /today에 없어도 살아 있게)", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=design" });
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);
    expect(window.location.search).toBe("");
    expect(window.sessionStorage.getItem("ilgamcheck:pending-starter")).toBe("design");
    await waitFor(() => expect(screen.getByRole("button", { name: /Google로 계속하기/ })).toBeInTheDocument());
    // 로그인 화면에서는 아직 적용하지 않아 값을 그대로 둔다.
    expect(window.sessionStorage.getItem("ilgamcheck:pending-starter")).toBe("design");
  });

  it("초대 링크가 아니면 안내를 띄우지 않는다", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today" });
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);
    await waitFor(() => expect(screen.getByRole("button", { name: /Google로 계속하기/ })).toBeInTheDocument());
    expect(screen.queryByTestId("invite-ready")).not.toBeInTheDocument();
  });
});
