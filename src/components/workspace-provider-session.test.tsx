import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {} from "vitest/jsdom";

import { completeRevision, recordRevision } from "@/lib/domain";
import { createSeedState } from "@/lib/store";

type AuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT";
type AuthCallback = (event: AuthEvent, session: Session | null) => void;
type RealtimeStatusCallback = (status: string) => void;
type HostedDocument = {
  state: ReturnType<typeof createSeedState>;
  documentVersion: number;
  updatedAt: string;
};

const hosted = vi.hoisted(() => {
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return {
    authCallback: null as AuthCallback | null,
    realtimeCallback: null as (() => void) | null,
    realtimeStatusCallback: null as RealtimeStatusCallback | null,
    getSession: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
    load: vi.fn<(client: unknown, ownerId: string) => Promise<HostedDocument | null>>(),
    save: vi.fn(),
    sync: vi.fn(),
    removeChannel: vi.fn(),
    rejectedEdit: vi.fn(),
    channel,
  };
});

const mobile = vi.hoisted(() => ({
  platform: "web",
  initialize: vi.fn().mockResolvedValue(undefined),
  start: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn().mockResolvedValue(undefined),
  validateOwner: vi.fn().mockResolvedValue(undefined),
  resume: null as null | (() => Promise<void>),
  stopResume: vi.fn(),
  pushInit: vi.fn().mockResolvedValue(undefined),
  pushDispose: vi.fn().mockResolvedValue(undefined),
  pushDisable: vi.fn().mockResolvedValue(undefined),
  snapshotSave: vi.fn().mockResolvedValue(undefined),
  snapshotClear: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/native/offline", () => ({
  saveNativeOfflineSnapshot: mobile.snapshotSave,
  clearNativeOfflineSnapshot: mobile.snapshotClear,
}));
vi.mock("@/lib/native/push", () => ({
  initializeNativePush: mobile.pushInit,
  disposeNativePush: mobile.pushDispose,
  disableNativePush: mobile.pushDisable,
}));
vi.mock("@/lib/native/lifecycle", () => ({
  subscribeNativeResume: vi.fn(async (callback: () => Promise<void>) => {
    mobile.resume = callback;
    return mobile.stopResume;
  }),
}));
vi.mock("@/lib/native/platform", async () => ({
  ...await vi.importActual<typeof import("@/lib/native/platform")>("@/lib/native/platform"),
  nativePlatform: () => mobile.platform,
}));
vi.mock("@/lib/native/auth-runtime", () => ({
  initializeNativeAuth: mobile.initialize,
  startNativeOAuth: mobile.start,
  disposeNativeAuth: mobile.dispose,
  validateNativeSessionOwner: mobile.validateOwner,
}));

vi.mock("@/lib/notifications", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");
  return { ...actual, registerIlgamcheckServiceWorker: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  const client = {
    auth: {
      getSession: hosted.getSession,
      signInWithOAuth: hosted.signInWithOAuth,
      signOut: hosted.signOut,
      onAuthStateChange: vi.fn((callback: AuthCallback) => {
        hosted.authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    channel: vi.fn(() => hosted.channel),
    removeChannel: hosted.removeChannel,
  };
  return {
    ...actual,
    getHostedRuntimeBoundary: () => ({ requestedMode: "hosted", configured: true }),
    getSupabaseBrowserClient: () => client,
    loadHostedWorkspace: hosted.load,
    saveHostedWorkspace: hosted.save,
    syncHostedRevisionPortals: hosted.sync,
  };
});

import { WorkspaceProvider, useWorkspace } from "./workspace-provider";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function session(userId: string): Session {
  return { user: { id: userId, email: `${userId}@example.test` } } as Session;
}

function remote(version = 7): HostedDocument {
  return {
    state: createSeedState("2026-08-15"),
    documentVersion: version,
    updatedAt: "2026-08-15T00:00:00.000Z",
  };
}

function markedRemote(owner: string, version: number): HostedDocument {
  const document = remote(version);
  document.state.jobs[0].clientLabel = `${owner}-workspace`;
  return document;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function Probe() {
  const {
    jobs, authStatus, saveStatus, realtimeStatus, realtimeError, updateSettings, signInWithGoogle, signOut,
    recordRevision: recordJobRevision, completeRevision: completeJobRevision,
  } = useWorkspace();
  return (
    <div>
      <span data-testid="workspace-owner">{jobs[0]?.clientLabel}</span>
      <span data-testid="auth-status">{authStatus}</span>
      <span data-testid="save-status">{saveStatus}</span>
      <span data-testid="realtime-status">{realtimeStatus}</span>
      <span data-testid="realtime-error">{realtimeError}</span>
      <button type="button" onClick={() => {
        try { updateSettings({ morningDigestEnabled: false }); }
        catch (error) { hosted.rejectedEdit(error); }
      }}>edit workspace</button>
      <button type="button" onClick={() => updateSettings({ morningDigestTime: "08:30" })}>edit digest time</button>
      <button type="button" onClick={() => recordJobRevision(jobs[0].id, "직접 고친 수정", "kakao", true)}>record done manually</button>
      <button type="button" onClick={() => completeJobRevision(jobs[0].id, "rev_here")}>complete here</button>
      <button type="button" onClick={() => void signInWithGoogle()}>google login</button>
      <button type="button" onClick={() => void signInWithGoogle("/settings")}>google reauth</button>
      <button type="button" onClick={() => void signOut().catch(() => undefined)}>logout</button>
    </div>
  );
}

describe("hosted auth activation", () => {
  const originalUrl = window.location.href;
  const deploymentOrigins = [
    "https://ilgamcheck-beta.bsfire1237.chatgpt.site",
    "https://ilgam.studioyeolmae.com",
  ];
  afterEach(() => {
    jsdom.reconfigure({ url: originalUrl });
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    mobile.platform = "web";
    mobile.resume = null; mobile.stopResume.mockClear();
    mobile.initialize.mockClear(); mobile.start.mockClear(); mobile.dispose.mockClear();
    mobile.validateOwner.mockReset().mockResolvedValue(undefined);
    mobile.pushInit.mockReset().mockResolvedValue(undefined);
    mobile.pushDisable.mockReset().mockResolvedValue(undefined);
    mobile.pushDispose.mockReset().mockResolvedValue(undefined);
    mobile.snapshotSave.mockReset().mockResolvedValue(undefined);
    mobile.snapshotClear.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(window, "localStorage", { configurable: true, value: new MemoryStorage() });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: new MemoryStorage() });
    hosted.authCallback = null;
    hosted.realtimeCallback = null;
    hosted.realtimeStatusCallback = null;
    hosted.getSession.mockReset();
    hosted.signInWithOAuth.mockReset().mockResolvedValue({ data: { url: "https://accounts.google.com" }, error: null });
    hosted.signOut.mockReset().mockResolvedValue({ error: null });
    hosted.load.mockReset();
    hosted.save.mockReset();
    hosted.sync.mockReset();
    hosted.removeChannel.mockReset();
    hosted.rejectedEdit.mockReset();
    hosted.channel.on.mockReset();
    hosted.channel.on.mockImplementation((...args: unknown[]) => {
      hosted.realtimeCallback = args.at(-1) as () => void;
      return hosted.channel;
    });
    hosted.channel.subscribe.mockReset();
    hosted.channel.subscribe.mockImplementation((callback?: RealtimeStatusCallback) => {
      hosted.realtimeStatusCallback = callback ?? null;
      return hosted.channel;
    });
  });

  it.each(["android", "ios"])("starts native Google OAuth on %s without a WebView redirect", async (platform) => {
    mobile.platform = platform;
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    fireEvent.click(screen.getByRole("button", { name: "google login" }));
    await waitFor(() => expect(mobile.start).toHaveBeenCalledWith("google", "/today", null));
    expect(hosted.signInWithOAuth).not.toHaveBeenCalled();
    expect(mobile.initialize).toHaveBeenCalled();
  });

  it("keeps the owner binding for native reauthentication", async () => {
    mobile.platform = "android";
    hosted.load.mockResolvedValue(remote());
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(hosted.load).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "google reauth" }));
    await waitFor(() => expect(mobile.start).toHaveBeenCalledWith("google", "/settings", "owner-a"));
    expect(hosted.signInWithOAuth).not.toHaveBeenCalled();
  });
  it.each(["owner validation", "channel removal"])("locks the previous workspace before awaiting %s on account change", async (delay) => {
    mobile.platform = "android";
    hosted.load.mockImplementation(async (_client, owner) => markedRemote(owner, 7));
    hosted.save.mockResolvedValue({ documentVersion: 8, updatedAt: "" });
    hosted.sync.mockResolvedValue(undefined);
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(screen.getByTestId("workspace-owner")).toHaveTextContent("owner-a-workspace"));
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("saved"));
    const pending = deferred<void>();
    if (delay === "owner validation") mobile.validateOwner.mockReturnValueOnce(pending.promise);
    else hosted.removeChannel.mockReturnValueOnce(pending.promise);
    hosted.save.mockClear();

    await act(async () => hosted.authCallback?.("SIGNED_IN", session("owner-b")));
    expect(screen.getByTestId("auth-status")).toHaveTextContent("loading");
    expect(screen.getByTestId("workspace-owner")).not.toHaveTextContent("owner-a-workspace");
    fireEvent.click(screen.getByRole("button", { name: "edit workspace" }));
    await act(async () => undefined);
    expect(hosted.save).not.toHaveBeenCalled();
    await act(async () => pending.resolve());
    await waitFor(() => expect(screen.getByTestId("workspace-owner")).toHaveTextContent("owner-b-workspace"));
  });

  it("locks old data while rejecting a wrong-account Google reauthentication", async () => {
    mobile.platform = "android";
    hosted.load.mockResolvedValue(markedRemote("owner-a", 7));
    hosted.save.mockResolvedValue({ documentVersion: 8, updatedAt: "" });
    hosted.sync.mockResolvedValue(undefined);
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("saved"));
    fireEvent.click(screen.getByRole("button", { name: "google reauth" }));
    await waitFor(() => expect(mobile.start).toHaveBeenCalledWith("google", "/settings", "owner-a"));
    const pending = deferred<{ error: null }>();
    hosted.signOut.mockReturnValueOnce(pending.promise);
    hosted.save.mockClear();
    await act(async () => hosted.authCallback?.("SIGNED_IN", session("owner-b")));
    expect(screen.getByTestId("auth-status")).not.toHaveTextContent("signed_in");
    expect(screen.getByTestId("workspace-owner")).not.toHaveTextContent("owner-a-workspace");
    fireEvent.click(screen.getByRole("button", { name: "edit workspace" }));
    await act(async () => undefined);
    expect(hosted.save).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ error: null }));
    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("signed_out"));
  });

  it("rejects a restored wrong-account session before loading data or registering push", async () => {
    mobile.platform = "android";
    mobile.validateOwner.mockRejectedValue(new Error("AUTH_ACCOUNT_MISMATCH"));
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-b")));
    await waitFor(() => expect(hosted.signOut).toHaveBeenCalled());
    expect(hosted.load).not.toHaveBeenCalled();
    expect(mobile.pushInit).not.toHaveBeenCalledWith("owner-b");
  });
  it("uses a native read-only offline gate when initial remote loading fails, without writing", async () => {
    mobile.platform = "android";
    hosted.load.mockRejectedValue(new Error("offline"));
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("offline"));
    expect(hosted.save).not.toHaveBeenCalled();
    expect(mobile.snapshotSave).not.toHaveBeenCalled();
  });

  it("registers the push owner and revokes the device before native sign-out", async () => {
    mobile.platform = "android";
    hosted.load.mockResolvedValue(remote());
    hosted.save.mockResolvedValue({ documentVersion: 8, updatedAt: "" });
    hosted.sync.mockResolvedValue(undefined);
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(mobile.pushInit).toHaveBeenCalledWith("owner-a"));
    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() => expect(hosted.signOut).toHaveBeenCalled());
    expect(mobile.pushDisable.mock.invocationCallOrder[0]).toBeLessThan(hosted.signOut.mock.invocationCallOrder[0]);
  });
  it("keeps the JWT when native push revocation fails", async () => {
    mobile.platform = "android";
    mobile.pushDisable.mockRejectedValue(new Error("offline"));
    hosted.load.mockResolvedValue(remote());
    hosted.save.mockResolvedValue({ documentVersion: 8, updatedAt: "" });
    hosted.sync.mockResolvedValue(undefined);
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(hosted.load).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() => expect(mobile.pushDisable).toHaveBeenCalled());
    expect(hosted.signOut).not.toHaveBeenCalled();
  });

  it.each(deploymentOrigins)("starts Google OAuth on the visited origin %s", async (origin) => {
    jsdom.reconfigure({ url: origin });
    vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", "https://ilgam.studioyeolmae.com");
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    fireEvent.click(screen.getByRole("button", { name: "google login" }));

    await waitFor(() => expect(hosted.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      // 구글 계정이 여럿이면 고를 수 있어야 한다(한 계정으로 바로 들어가 버리면 다른 계정으로 가입할 길이 없다). 앱 로그인과 같다.
      options: { redirectTo: `${origin}/today`, queryParams: { prompt: "select_account" } },
    }));
  });

  it.each(deploymentOrigins)("binds settings reauthentication to the current owner at %s", async (origin) => {
    jsdom.reconfigure({ url: origin });
    vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", "https://ilgam.studioyeolmae.com");
    hosted.load.mockResolvedValue(remote());
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    await waitFor(() => expect(hosted.authCallback).not.toBeNull());
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(hosted.load).toHaveBeenCalledWith(expect.anything(), "owner-a"));

    fireEvent.click(screen.getByRole("button", { name: "google reauth" }));

    await waitFor(() => expect(hosted.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${origin}/settings`,
        queryParams: { prompt: "select_account" },
      },
    }));
    expect(window.sessionStorage.getItem("ilgamcheck:google-reauth-owner")).toBe("owner-a");
  });

  it("signs out instead of activating a different account after Google reauthentication", async () => {
    window.sessionStorage.setItem("ilgamcheck:google-reauth-owner", "owner-a");
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    await waitFor(() => expect(hosted.authCallback).not.toBeNull());

    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-b")));

    await waitFor(() => expect(hosted.signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(hosted.load).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("ilgamcheck:google-reauth-owner")).toBeNull();
  });

  it("uses INITIAL_SESSION as the single first-session entry without getSession double activation", async () => {
    hosted.load.mockResolvedValue(remote());
    render(<WorkspaceProvider><div>workspace</div></WorkspaceProvider>);

    await waitFor(() => expect(hosted.authCallback).not.toBeNull());
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(hosted.load).toHaveBeenCalledTimes(1));

    expect(hosted.getSession).not.toHaveBeenCalled();
    expect(hosted.load).toHaveBeenCalledWith(expect.anything(), "owner-a");
  });

  it("surfaces realtime connection status instead of failing silently", async () => {
    hosted.load.mockResolvedValue(remote());
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);

    await waitFor(() => expect(hosted.authCallback).not.toBeNull());
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(hosted.realtimeStatusCallback).not.toBeNull());

    act(() => hosted.realtimeStatusCallback?.("SUBSCRIBED"));
    expect(screen.getByTestId("realtime-status")).toHaveTextContent("connected");

    act(() => hosted.realtimeStatusCallback?.("CHANNEL_ERROR"));
    expect(screen.getByTestId("realtime-status")).toHaveTextContent("error");
    expect(screen.getByTestId("realtime-error")).toHaveTextContent("실시간 연결이 끊겼어요");
  });

  it("does not create a workspace after an older activation becomes stale during remote load", async () => {
    let resolveOwnerA: ((value: HostedDocument | null) => void) | null = null;
    hosted.load.mockImplementation((_client, ownerId) => {
      if (ownerId === "owner-a") {
        return new Promise((resolve) => { resolveOwnerA = resolve; });
      }
      return Promise.resolve(remote(11));
    });
    render(<WorkspaceProvider><div>workspace</div></WorkspaceProvider>);

    await waitFor(() => expect(hosted.authCallback).not.toBeNull());
    act(() => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(hosted.load).toHaveBeenCalledWith(expect.anything(), "owner-a"));

    act(() => hosted.authCallback?.("SIGNED_IN", session("owner-b")));
    await waitFor(() => expect(hosted.load).toHaveBeenCalledWith(expect.anything(), "owner-b"));
    await act(async () => { resolveOwnerA?.(null); });
    await waitFor(() => expect(hosted.load).toHaveBeenCalledTimes(2));

    // 로그인 완료 뒤 오늘 활동일을 기존 owner B 문서(version 11)에 기록할 수는 있다.
    // 이 검사의 핵심은 stale owner A의 `remote=null` 응답이 신규 문서(version 0)를
    // 만들지 못하게 하는 것이다.
    expect(hosted.save).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 0);
    expect(hosted.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ activityDates: [expect.any(String)] }),
      11,
    );
  });

  it("never writes owner B state into owner A cache when A's pending save rejects", async () => {
    const pendingSave = deferred<{ documentVersion: number; updatedAt: string }>();
    hosted.load.mockImplementation((_client, ownerId) => Promise.resolve(
      ownerId === "owner-a" ? markedRemote("owner-a", 7) : markedRemote("owner-b", 11),
    ));
    hosted.save.mockReturnValue(pendingSave.promise);
    hosted.sync.mockResolvedValue(undefined);
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);

    await waitFor(() => expect(hosted.authCallback).not.toBeNull());
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(screen.getByTestId("workspace-owner")).toHaveTextContent("owner-a-workspace"));
    fireEvent.click(screen.getByRole("button", { name: "edit workspace" }));
    await waitFor(() => expect(hosted.save).toHaveBeenCalledTimes(1));

    await act(async () => hosted.authCallback?.("SIGNED_IN", session("owner-b")));
    await waitFor(() => expect(screen.getByTestId("workspace-owner")).toHaveTextContent("owner-b-workspace"));
    await act(async () => pendingSave.reject(new Error("owner-a network failed")));

    await waitFor(() => expect(screen.getByTestId("workspace-owner")).toHaveTextContent("owner-b-workspace"));
    const ownerACache = window.localStorage.getItem("ilgamcheck:mvp:v2:user:owner-a") ?? "";
    expect(ownerACache).toContain("owner-a-workspace");
    expect(ownerACache).not.toContain("owner-b-workspace");
  });

  it.each(["realtime", "resume"])("ignores an owner A %s response that finishes after switching to owner B", async (source) => {
    const delayedRealtime = deferred<HostedDocument | null>();
    let ownerALoads = 0;
    hosted.load.mockImplementation((_client, ownerId) => {
      if (ownerId === "owner-b") return Promise.resolve(markedRemote("owner-b", 11));
      ownerALoads += 1;
      return ownerALoads === 1
        ? Promise.resolve(markedRemote("owner-a", 7))
        : delayedRealtime.promise;
    });
    hosted.sync.mockResolvedValue(undefined);
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);

    await waitFor(() => expect(hosted.authCallback).not.toBeNull());
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(hosted.realtimeCallback).not.toBeNull());
    const ownerARealtime = source === "resume" ? mobile.resume : hosted.realtimeCallback;
    expect(ownerARealtime).not.toBeNull();
    act(() => { void ownerARealtime?.(); });
    await waitFor(() => expect(ownerALoads).toBe(2));

    await act(async () => hosted.authCallback?.("SIGNED_IN", session("owner-b")));
    await waitFor(() => expect(screen.getByTestId("workspace-owner")).toHaveTextContent("owner-b-workspace"));
    await act(async () => delayedRealtime.resolve(markedRemote("owner-a-late", 8)));

    await waitFor(() => expect(screen.getByTestId("workspace-owner")).toHaveTextContent("owner-b-workspace"));
    expect(window.localStorage.getItem("ilgamcheck:mvp:v2:user:owner-b")).toContain("owner-b-workspace");
  });

  it("waits for queued saves before resume reload and releases listeners on unmount", async () => {
    const pendingSave = deferred<{ documentVersion: number; updatedAt: string }>();
    hosted.load.mockResolvedValue(markedRemote("owner-a", 7));
    hosted.save.mockReturnValue(pendingSave.promise);
    hosted.sync.mockResolvedValue(undefined);
    const view = render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(hosted.save).toHaveBeenCalledOnce());
    expect(mobile.resume).not.toBeNull();
    let resumed: Promise<void> | undefined;
    act(() => { resumed = mobile.resume?.(); });
    expect(hosted.load).toHaveBeenCalledOnce();
    hosted.load.mockResolvedValue(markedRemote("remote-new", 20));
    await act(async () => {
      pendingSave.resolve({ documentVersion: 8, updatedAt: "" });
      await resumed;
    });
    expect(screen.getByTestId("workspace-owner")).toHaveTextContent("remote-new-workspace");
    view.unmount();
    expect(mobile.stopResume).toHaveBeenCalledOnce();
  });

  type SavedState = HostedDocument["state"];
  const liveUsed = (state: SavedState) => state.jobs[0].revisions.filter((item) => !item.revertedAt && item.usage === "used").length;
  const usageOf = (state: SavedState, revisionId: string) => state.jobs[0].revisions.find((item) => item.id === revisionId)?.usage;

  /**
   * 첫 일감에 확인 대기 요청을 넣은 서버 문서로 로그인한다. 가짜 서버는 실제처럼 기대 버전이 다르면 충돌로 거부하고,
   * 성공하면 버전을 올려 그 문서를 서버본으로 삼는다. `hold`는 다음 저장 응답을 잠시 붙잡고, `failAt`은 n번째 저장을 실패시킨다.
   */
  async function signInWithPendingRevisions(revisionLimit: number, revisionIds: string[]) {
    const initial = remote(7);
    let job = { ...initial.state.jobs[0], revisionLimit };
    for (const revisionId of revisionIds) {
      job = recordRevision(job, { revisionId, source: "public", body: revisionId, submittedAt: "2026-08-15T01:00:00.000Z" }).job;
    }
    initial.state.jobs[0] = job;
    const server = { state: initial.state, version: initial.documentVersion, accepted: [] as SavedState[] };
    const saved: SavedState[] = [];
    const failAt = new Map<number, Error>();
    let gate: Promise<void> | null = null;
    hosted.load.mockImplementation(async () => ({ state: structuredClone(server.state), documentVersion: server.version, updatedAt: "" }));
    hosted.sync.mockResolvedValue(undefined);
    hosted.save.mockImplementation(async (_client: unknown, state: SavedState, expectedVersion: number) => {
      const index = saved.push(structuredClone(state)) - 1;
      const held = gate;
      gate = null;
      if (held) await held;
      const failure = failAt.get(index);
      if (failure) throw failure;
      if (expectedVersion !== server.version) throw Object.assign(new Error("version conflict"), { name: "HostedWorkspaceConflictError" });
      server.version += 1;
      server.state = structuredClone(state);
      server.accepted.push(server.state);
      return { documentVersion: server.version, updatedAt: "" };
    });
    let view = render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    const activate = async () => {
      await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
      await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("signed_in"));
      await waitFor(() => expect(hosted.realtimeCallback).not.toBeNull());
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    };
    await activate();
    return {
      server,
      saved,
      failAt,
      hold() {
        const release = deferred<void>();
        gate = release.promise;
        return () => release.resolve();
      },
      /** 같은 브라우저 저장소(캐시·보존 초안)를 그대로 두고 새로고침한 것처럼 다시 띄운다. */
      async reload() {
        view.unmount();
        view = render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
        await activate();
      },
      /** 다른 기기가 '수정 완료로 기록'한 새 수동 기록을 저장해 서버 문서가 한 버전 앞서 있다. */
      addManualDoneOnAnotherDevice() {
        const next = structuredClone(server.state);
        next.jobs[0] = recordRevision(next.jobs[0], { revisionId: "rev_manual_other", source: "manual", channel: "kakao", body: "다른 기기 수동 완료", submittedAt: "2026-08-15T02:00:00.000Z", completed: true }).job;
        server.state = next;
        server.version += 1;
      },
      /** 다른 기기가 그 요청을 '수정 완료'로 저장해 서버 문서가 한 버전 앞서 있다. */
      completeOnAnotherDevice(revisionId: string) {
        const next = structuredClone(server.state);
        next.jobs[0] = completeRevision(next.jobs[0], revisionId, "2026-08-15T02:00:00.000Z");
        server.state = next;
        server.version += 1;
      },
    };
  }

  // Codex 5차 P1: 첫 저장의 충돌 재시도가 다른 기기의 '수정 완료'를 합쳐 저장해도,
  // 그 전에 큐에 들어간 두 번째 저장이 찍어 둔 옛 스냅샷(확인 대기)을 그대로 저장하면 완료가 사라진다.
  // Codex 6차 P1: 문서 저장은 됐는데 링크 동기화가 실패해도 같은 일이 생기면 안 된다.
  // 재시도 저장 자체가 실패한 경우에도, 다음 저장은 서버본을 다시 합쳐야 한다.
  it.each([
    ["the conflict retry succeeds", "none"],
    ["portal sync fails after the document save", "sync"],
    ["the conflict retry save fails", "retry"],
  ])("keeps another device's revision completion through a second queued save (%s)", async (_, failure) => {
    const fake = await signInWithPendingRevisions(3, ["rev_other_device"]);
    fake.completeOnAnotherDevice("rev_other_device");
    const before = fake.saved.length;
    const acceptedBefore = fake.server.accepted.length;
    if (failure === "sync") hosted.sync.mockRejectedValueOnce(new Error("portal sync failed"));
    if (failure === "retry") fake.failAt.set(before + 1, new Error("network failed"));

    const release = fake.hold();
    fireEvent.click(screen.getByRole("button", { name: "edit workspace" }));
    await waitFor(() => expect(fake.saved).toHaveLength(before + 1));
    // 첫 저장이 서버 응답을 기다리는 동안 두 번째 편집이 큐에 들어간다.
    fireEvent.click(screen.getByRole("button", { name: "edit digest time" }));
    await act(async () => release());
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("saved"));

    expect(usageOf(fake.server.state, "rev_other_device")).toBe("used");
    // 서버가 받아들인 저장 가운데 완료를 확인 대기로 되돌린 것이 없어야 한다(충돌로 거부된 시도는 서버에 안 남는다).
    expect(fake.server.accepted.slice(acceptedBefore).map((state) => usageOf(state, "rev_other_device"))).not.toContain("pending");
    expect(fake.server.state.settings).toMatchObject({ morningDigestEnabled: false, morningDigestTime: "08:30" });
  });

  // Codex 6차 P2: 첫 저장 응답을 기다리는 동안 적은 '수정 완료로 기록'이 검사 뒤에 붙어 한도를 넘긴 채 저장되면 안 된다.
  it("checks a manual completed record added while the first save waits instead of saving over the limit", async () => {
    // 예시 일감은 이미 1회를 썼다. 한도 2에 확인 대기 1건.
    const fake = await signInWithPendingRevisions(2, ["rev_other_device"]);
    fake.completeOnAnotherDevice("rev_other_device");
    const before = fake.saved.length;

    const release = fake.hold();
    fireEvent.click(screen.getByRole("button", { name: "edit workspace" }));
    await waitFor(() => expect(fake.saved).toHaveLength(before + 1));
    fireEvent.click(screen.getByRole("button", { name: "record done manually" }));
    await act(async () => release());
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("error"));

    expect(fake.saved.slice(before).every((state) => liveUsed(state) <= state.jobs[0].revisionLimit)).toBe(true);
    expect(liveUsed(fake.server.state)).toBe(2);
  });

  // Codex 6차 P2: 두 기기의 서로 다른 완료로 멈춘 뒤 '이 기기 편집으로 재시도'가 한도 초과본을 저장하면 안 된다.
  it("does not let the keep-this-device recovery save two devices' completions over the limit", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fake = await signInWithPendingRevisions(2, ["rev_here", "rev_other_device"]);
    fake.completeOnAnotherDevice("rev_other_device");
    const before = fake.saved.length;

    fireEvent.click(screen.getByRole("button", { name: "complete here" }));
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("error"));
    expect(fake.saved).toHaveLength(before + 1);

    const loadsBefore = hosted.load.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "이 기기 편집으로 재시도" }));
    await waitFor(() => expect(hosted.load.mock.calls.length).toBeGreaterThan(loadsBefore));
    await waitFor(() => expect(screen.getByTestId("save-status")).not.toHaveTextContent("saving"));

    expect(fake.saved.slice(before).every((state) => liveUsed(state) <= state.jobs[0].revisionLimit)).toBe(true);
    expect(liveUsed(fake.server.state)).toBe(2);
    expect(screen.getByTestId("save-status")).toHaveTextContent("error");
  });

  // Codex 7차 P2: 양쪽 기기가 각각 '수정 완료로 기록'을 새로 추가하면 자동 저장은 멈추지만, 화면 보존 과정에서
  // 이 기기 화면이 한도 초과가 된다. 그 뒤 '이 기기 편집으로 재시도'나 새로고침 복구가 그 상태를 저장하면 안 된다.
  it.each(["keep-this-device retry", "reload recovery"])("does not save over the limit after both devices add a manual completed record (%s)", async (path) => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // 예시 일감은 이미 1회를 썼다. 한도 2.
    const fake = await signInWithPendingRevisions(2, []);
    fake.addManualDoneOnAnotherDevice();
    const acceptedBefore = fake.server.accepted.length;

    fireEvent.click(screen.getByRole("button", { name: "record done manually" }));
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("error"));
    expect(fake.server.accepted).toHaveLength(acceptedBefore);

    if (path === "keep-this-device retry") {
      const loadsBefore = hosted.load.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: "이 기기 편집으로 재시도" }));
      await waitFor(() => expect(hosted.load.mock.calls.length).toBeGreaterThan(loadsBefore));
      await waitFor(() => expect(screen.getByTestId("save-status")).not.toHaveTextContent("saving"));
    } else {
      await fake.reload();
    }

    expect(fake.server.accepted.slice(acceptedBefore).every((state) => liveUsed(state) <= state.jobs[0].revisionLimit)).toBe(true);
    expect(liveUsed(fake.server.state)).toBe(2);
    expect(screen.getByTestId("save-status")).toHaveTextContent("error");
  });

  it("does not let a rejected owner A recovery overwrite owner A with owner B state", async () => {
    const delayedRecovery = deferred<HostedDocument | null>();
    let ownerALoads = 0;
    hosted.load.mockImplementation((_client, ownerId) => {
      if (ownerId === "owner-b") return Promise.resolve(markedRemote("owner-b", 11));
      ownerALoads += 1;
      return ownerALoads === 1
        ? Promise.resolve(markedRemote("owner-a", 7))
        : delayedRecovery.promise;
    });
    hosted.save.mockRejectedValue(new Error("owner-a save failed"));
    hosted.sync.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);

    await waitFor(() => expect(hosted.authCallback).not.toBeNull());
    await act(async () => hosted.authCallback?.("INITIAL_SESSION", session("owner-a")));
    await waitFor(() => expect(screen.getByTestId("workspace-owner")).toHaveTextContent("owner-a-workspace"));
    fireEvent.click(screen.getByRole("button", { name: "edit workspace" }));
    await waitFor(() => expect(screen.getByTestId("save-status")).toHaveTextContent("error"));
    fireEvent.click(screen.getByRole("button", { name: "서버본 사용" }));
    await waitFor(() => expect(ownerALoads).toBe(2));

    await act(async () => hosted.authCallback?.("SIGNED_IN", session("owner-b")));
    await waitFor(() => expect(screen.getByTestId("workspace-owner")).toHaveTextContent("owner-b-workspace"));
    await act(async () => delayedRecovery.reject(new Error("late owner-a recovery failure")));

    await waitFor(() => expect(screen.getByTestId("workspace-owner")).toHaveTextContent("owner-b-workspace"));
    const ownerACache = window.localStorage.getItem("ilgamcheck:mvp:v2:user:owner-a") ?? "";
    expect(ownerACache).toContain("owner-a-workspace");
    expect(ownerACache).not.toContain("owner-b-workspace");
  });
});
