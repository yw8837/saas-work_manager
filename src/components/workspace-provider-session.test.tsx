import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {} from "vitest/jsdom";

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
    channel,
  };
});

const mobile = vi.hoisted(() => ({
  platform: "web",
  initialize: vi.fn().mockResolvedValue(undefined),
  start: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn().mockResolvedValue(undefined),
  resume: null as null | (() => Promise<void>),
  stopResume: vi.fn(),
  pushInit: vi.fn().mockResolvedValue(undefined),
  pushDispose: vi.fn().mockResolvedValue(undefined),
  pushDisable: vi.fn().mockResolvedValue(undefined),
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
  const { jobs, saveStatus, realtimeStatus, realtimeError, updateSettings, signInWithGoogle, signOut } = useWorkspace();
  return (
    <div>
      <span data-testid="workspace-owner">{jobs[0]?.clientLabel}</span>
      <span data-testid="save-status">{saveStatus}</span>
      <span data-testid="realtime-status">{realtimeStatus}</span>
      <span data-testid="realtime-error">{realtimeError}</span>
      <button type="button" onClick={() => updateSettings({ morningDigestEnabled: false })}>edit workspace</button>
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
    mobile.pushInit.mockReset().mockResolvedValue(undefined);
    mobile.pushDisable.mockReset().mockResolvedValue(undefined);
    mobile.pushDispose.mockReset().mockResolvedValue(undefined);
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
      options: { redirectTo: `${origin}/today` },
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
