import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {} from "vitest/jsdom";

import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/policies";
import { FREE_PLAN_TEXT, INVITE_OTHER_TEXT, INVITE_READY_TEXT, SIGNUP_NEXT_TEXT, signupStartHref } from "@/lib/signup-start";

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

  it("개발 용어 없이 비밀번호를 저장하지 않는다고 말하고, 버튼 아래에 가입하면 어떻게 되는지(약관 동의 뒤 작업공간·무료 범위·카드 없음)를 알린다", () => {
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);
    expect(document.body).not.toHaveTextContent(/Supabase|Auth|OAuth/);
    expect(document.body).toHaveTextContent("Google 비밀번호는 일감체크에 저장되지 않아요.");
    const next = screen.getByTestId("auth-signup-next");
    expect(next).toHaveTextContent(SIGNUP_NEXT_TEXT);
    expect(next).toHaveTextContent("약관에 동의하면 작업공간이 열려요.");
    expect(next).toHaveTextContent(FREE_PLAN_TEXT);
    expect(next).toHaveTextContent("카드 등록은 없어요");
    // 버튼 아래에 있다.
    const button = screen.getByRole("button", { name: "Google로 계속하기" });
    expect(button.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 시간 숫자는 쓰지 않는다.
    expect(document.body.textContent ?? "").not.toMatch(/\d+\s*(초|분)/);
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
    expect(screen.queryByText("가입할 때 들어온 링크의 유입 경로(메일·블로그 등)를 한 번 기록하는 항목 추가")).not.toBeInTheDocument();

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
    expect(screen.getByText("가입할 때 들어온 링크의 유입 경로(메일·블로그 등)를 한 번 기록하는 항목 추가")).toBeInTheDocument();
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

  it("로그인 전에 주소의 코드를 이 탭에 옮겨 두고 주소에서 지운 뒤, 자동으로 들어간다고 알린다(모르는 코드면 값·혜택을 말하지 않음)", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?invite=MAILCODE" });
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);
    expect(window.location.search).toBe("");
    expect(window.sessionStorage.getItem("ilgamcheck:pending-invite")).toBe("MAILCODE");
    const notice = await screen.findByTestId("invite-ready");
    expect(notice).toHaveTextContent(INVITE_OTHER_TEXT);
    expect(notice).toHaveTextContent("베타 코드가 자동으로 들어가요");
    expect(notice).not.toHaveTextContent(/BETA2026|Pro를/);
    // 화면 어디에도 코드 값을 그대로 보여 주지 않는다.
    expect(document.body.textContent).not.toContain("MAILCODE");
  });

  it("공개 시작 버튼의 코드(BETA2026)로 들어오면 코드와 혜택(Pro 14일, 계정당 한 번)을 보여 주고 '초대 링크로 들어오셨어요'라고 하지 않는다", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today?invite=BETA2026" });
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);
    const notice = await screen.findByTestId("invite-ready");
    expect(notice).toHaveTextContent(INVITE_READY_TEXT);
    expect(notice).toHaveTextContent("베타 코드 BETA2026이 자동으로 들어가요. Pro를 14일 동안 무료로 써요(계정당 한 번).");
    expect(document.body).not.toHaveTextContent("초대 링크로 들어오셨어요");
    expect(window.sessionStorage.getItem("ilgamcheck:pending-invite")).toBe("BETA2026");
  });

  it("업종과 베타 코드가 같이 붙어 와도(예시 화면 버튼) 둘 다 이 탭에 남고 주소에서는 지워진다", async () => {
    jsdom.reconfigure({ url: `https://ilgam.example${signupStartHref("design")}` });
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);
    expect(window.location.search).toBe("");
    expect(window.sessionStorage.getItem("ilgamcheck:pending-starter")).toBe("design");
    expect(window.sessionStorage.getItem("ilgamcheck:pending-invite")).toBe("BETA2026");
    expect(await screen.findByTestId("invite-ready")).toHaveTextContent(INVITE_READY_TEXT);
  });

  it("초대 값이 있든 없든 주 버튼 모양(클래스)은 같다", async () => {
    jsdom.reconfigure({ url: "https://ilgam.example/today" });
    const { unmount } = render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);
    const plain = (await screen.findByRole("button", { name: "Google로 계속하기" })).className;
    unmount();
    jsdom.reconfigure({ url: "https://ilgam.example/today?invite=BETA2026" });
    render(<WorkspaceAuthGate><div>private workspace</div></WorkspaceAuthGate>);
    await screen.findByTestId("invite-ready");
    expect(screen.getByRole("button", { name: "Google로 계속하기" }).className).toBe(plain);
    expect(plain).toBe("primaryButton authPrimary");
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
