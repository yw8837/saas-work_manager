/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hosted = vi.hoisted(() => {
  const channel: any = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return {
    authCallback: null as any,
    signOut: vi.fn(async () => ({ error: null })),
    load: vi.fn(),
    save: vi.fn(),
    sync: vi.fn(),
    removeChannel: vi.fn(),
    policy: vi.fn(async () => "current"),
    channel,
  };
});
vi.mock("@/lib/native/offline", () => ({ saveNativeOfflineSnapshot: vi.fn(async () => undefined), clearNativeOfflineSnapshot: vi.fn(async () => undefined) }));
vi.mock("@/lib/native/push", () => ({ initializeNativePush: vi.fn(async () => undefined), disposeNativePush: vi.fn(async () => undefined), disableNativePush: vi.fn(async () => undefined) }));
vi.mock("@/lib/native/lifecycle", () => ({ subscribeNativeResume: vi.fn(async () => () => undefined) }));
vi.mock("@/lib/notifications", async () => ({ ...(await vi.importActual<any>("@/lib/notifications")), registerIlgamcheckServiceWorker: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<any>("@/lib/supabase");
  const client = {
    auth: {
      getSession: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: hosted.signOut,
      onAuthStateChange: vi.fn((callback: any) => { hosted.authCallback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; }),
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
    readPolicyAcceptanceState: hosted.policy,
  };
});

import { composeJob } from "@/lib/domain";
import { createStarterState, INDUSTRY_STARTERS } from "@/lib/store";
import { PENDING_STARTER_KEY } from "@/lib/starter-link";
import { WorkspaceProvider, useWorkspace } from "@/components/workspace-provider";
import { WorkspaceAuthGate } from "@/components/workspace-auth-gate";
import { BetaActivationGate } from "@/components/beta-activation-gate";
import { StarterLinkNotice } from "@/components/starter-link-notice";

class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(i: number) { return [...this.values.keys()][i] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
const originalUrl = window.location.href;
const session = (id: string) => ({ user: { id, email: `${id}@example.test` } }) as any;
const today = "2026-11-05";
function baseDoc(version = 7, patch: (s: any) => any = (s) => s) {
  const state = createStarterState(today);
  state.settings = { ...state.settings, betaCodeOnboardingCompletedAt: "2026-11-01T00:00:00.000Z" } as any;
  return { state: patch(state), documentVersion: version, updatedAt: "2026-11-05T00:00:00.000Z" };
}
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

const seen: any[] = [];
let live: any;
function Probe() {
  const w: any = useWorkspace();
  // 시험 전용: 렌더마다 작업공간 값을 밖에서 읽으려고 기록한다.
  // eslint-disable-next-line react-hooks/globals
  live = w;
  seen.push({ hydrated: w.hydrated, auth: w.authStatus, jobIds: w.jobs.map((j: any) => j.id) });
  return null;
}
function App() {
  return (
    <WorkspaceProvider>
      <Probe />
      <WorkspaceAuthGate>
        <BetaActivationGate>
          <div data-testid="app-open"><StarterLinkNotice /></div>
        </BetaActivationGate>
      </WorkspaceAuthGate>
    </WorkspaceProvider>
  );
}
const auth = (event: string, s: any) => act(async () => { hosted.authCallback(event, s); await Promise.resolve(); });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const livePkgIds = () => live.packages.filter((p: any) => !p.archivedAt).map((p: any) => p.id);
const designIds = INDUSTRY_STARTERS.design.packages.map((p) => p.id);
const webIds = INDUSTRY_STARTERS.web.packages.map((p) => p.id);

beforeEach(() => {
  seen.length = 0; live = null;
  hosted.authCallback = null;
  hosted.load.mockReset();
  hosted.save.mockReset();
  hosted.save.mockImplementation(async (_c: unknown, _s: unknown, v: number) => ({ documentVersion: v + 1, updatedAt: "2026-11-05T01:00:00.000Z" }));
  hosted.sync.mockReset(); hosted.sync.mockResolvedValue(undefined);
  hosted.signOut.mockClear();
  hosted.policy.mockReset(); hosted.policy.mockResolvedValue("current");
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: new MemoryStorage() });
  Object.defineProperty(window, "localStorage", { configurable: true, value: new MemoryStorage() });
});
afterEach(() => { cleanup(); jsdom.reconfigure({ url: originalUrl }); });

describe("업종 예시 링크: 실제 작업공간 제공자와 관문으로 돌린 순서 시험", () => {
  it("작업공간을 불러오기 전에는 앱을 열지 않고, 불러온 뒤 고친 패키지를 덮어쓰지 않는다", async () => {
    const d = deferred<any>();
    hosted.load.mockReturnValue(d.promise);
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=design" });
    render(<App />);
    await auth("INITIAL_SESSION", session("u1"));
    await flush();
    expect(window.location.search).toBe("");
    expect(window.sessionStorage.getItem(PENDING_STARTER_KEY)).toBe("design");
    expect(screen.queryByTestId("app-open")).toBeNull();
    expect(hosted.save).not.toHaveBeenCalled();
    const doc = baseDoc(7, (s) => ({ ...s, packages: s.packages.map((p: any, i: number) => i === 0 ? { ...p, price: 999_000 } : p) }));
    await act(async () => { d.resolve(doc); });
    await screen.findByTestId("starter-link-notice");
    expect(screen.getByTestId("starter-link-notice").textContent).toContain("바꾸지 않았어요");
    for (const c of hosted.save.mock.calls) expect(c[1].packages.filter((p: any) => !p.archivedAt).map((p: any) => p.id)).toEqual(webIds);
    expect(live.packages[0].price).toBe(999_000);
    expect(window.sessionStorage.getItem(PENDING_STARTER_KEY)).toBeNull();
  });

  it("서버에 일감이 있으면 기기 캐시가 비어 있어도 적용하지 않는다", async () => {
    const doc = baseDoc(9, (s) => ({ ...s, jobs: [composeJob({ jobId: "job_real", clientLabel: "real", startDate: today, package: s.packages[0], now: `${today}T00:00:00.000Z` })], jobsCreatedTotal: 1 }));
    hosted.load.mockResolvedValue(doc);
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=design" });
    render(<App />);
    await auth("INITIAL_SESSION", session("u2"));
    await screen.findByTestId("starter-link-notice");
    expect(screen.getByTestId("starter-link-notice").textContent).toContain("바꾸지 않았어요");
    expect(livePkgIds()).toEqual(webIds);
    expect(live.jobs.map((j: any) => j.id)).toEqual(["job_real"]);
  });

  it("새 계정은 베타 관문까지 값을 들고 있다가 한 번만 적용하고 서버에 저장한다", async () => {
    hosted.load.mockResolvedValue(null);
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=design" });
    render(<App />);
    await auth("INITIAL_SESSION", session("u4"));
    await screen.findByRole("button", { name: "코드 없이 무료로 시작" });
    expect(window.sessionStorage.getItem(PENDING_STARTER_KEY)).toBe("design");
    fireEvent.click(screen.getByRole("button", { name: "코드 없이 무료로 시작" }));
    const note = await screen.findByTestId("starter-link-notice");
    expect(note.getAttribute("data-tone")).toBe("ok");
    expect(livePkgIds()).toEqual(designIds);
    await flush();
    const last = hosted.save.mock.calls.at(-1)!;
    expect(last[1].packages.filter((p: any) => !p.archivedAt).map((p: any) => p.id)).toEqual(designIds);
    expect(window.sessionStorage.getItem(PENDING_STARTER_KEY)).toBeNull();
  });

  it("계정을 바꾸는 동안 준비 상태에 다른 계정 데이터가 섞이지 않는다", async () => {
    const a = deferred<any>();
    hosted.load.mockReturnValueOnce(a.promise).mockResolvedValueOnce(baseDoc(5, (s) => ({ ...s, jobsCreatedTotal: 1 })));
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=design" });
    render(<App />);
    await auth("INITIAL_SESSION", session("uA"));
    await act(async () => { a.resolve(baseDoc(4)); });
    await screen.findByTestId("starter-link-notice");
    expect(livePkgIds()).toEqual(designIds);
    const savesAfterA = hosted.save.mock.calls.length;
    await auth("SIGNED_IN", session("uB"));
    await waitFor(() => expect(live.userEmail).toBe("uB@example.test"));
    await flush();
    await flush();
    expect(livePkgIds()).toEqual(webIds);
    for (const call of hosted.save.mock.calls.slice(savesAfterA)) {
      expect(call[1].packages.filter((p: any) => !p.archivedAt).map((p: any) => p.id)).toEqual(webIds);
    }
    const bad = seen.filter((r) => r.hydrated && r.auth === "signed_in" && r.jobIds.includes("job_seed_mora"));
    expect(bad).toHaveLength(0);
  });

  it("로그아웃하면 받아 둔 업종을 지워서 다음에 로그인한 다른 계정에 적용되지 않는다", async () => {
    hosted.policy.mockResolvedValue("missing");
    hosted.load.mockResolvedValue(baseDoc(3));
    jsdom.reconfigure({ url: "https://ilgam.example/today?starter=design" });
    render(<App />);
    await auth("INITIAL_SESSION", session("uA"));
    await screen.findByRole("button", { name: "다른 계정으로 로그인" });
    expect(window.sessionStorage.getItem(PENDING_STARTER_KEY)).toBe("design");
    fireEvent.click(screen.getByRole("button", { name: "다른 계정으로 로그인" }));
    await flush();
    await auth("SIGNED_OUT", null);
    await flush();
    expect(window.sessionStorage.getItem(PENDING_STARTER_KEY)).toBeNull();
    hosted.policy.mockResolvedValue("current");
    await auth("SIGNED_IN", session("uB"));
    await screen.findByTestId("app-open");
    await flush();
    expect(screen.queryByTestId("starter-link-notice")).toBeNull();
    expect(livePkgIds()).toEqual(webIds);
  });
});
