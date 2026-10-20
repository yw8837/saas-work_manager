import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NATIVE_AUTH_CALLBACK } from "./auth";

const native = vi.hoisted(() => ({
  platform: "android",
  values: new Map<string, string>(),
  handlers: new Map<string, (data?: { url: string }) => Promise<void>>(),
  launch: undefined as { url: string } | undefined,
  opens: [] as string[],
  exchangeCount: 0,
  removed: 0,
  assignments: [] as string[],
  callbackDuringOpen: false,
}));

vi.mock("./platform", () => ({ nativePlatform: () => native.platform }));
vi.mock("./secure-storage", () => ({
  createSecureSessionStore: () => ({
    async getItem(key: string) { return native.values.get(key) ?? null; },
    async setItem(key: string, value: string) { native.values.set(key, value); },
    async removeItem(key: string) { native.values.delete(key); },
  }),
}));
vi.mock("@capacitor/app", () => ({
  App: {
    async addListener(name: string, handler: (data?: { url: string }) => Promise<void>) {
      native.handlers.set(name, handler);
      return { async remove() { native.removed++; native.handlers.delete(name); } };
    },
    async getLaunchUrl() { return native.launch; },
  },
}));
vi.mock("@capacitor/browser", () => ({
  Browser: {
    async addListener(name: string, handler: (data?: { url: string }) => Promise<void>) {
      native.handlers.set(name, handler);
      return { async remove() { native.removed++; native.handlers.delete(name); } };
    },
    async open({ url }: { url: string }) {
      native.opens.push(url);
      if (native.callbackDuringOpen) await native.handlers.get("appUrlOpen")?.({ url: `${"com.yeolmaestudio.ilgamcheck://auth/callback"}?code=fast` });
    },
    async close() {},
  },
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      async signInWithOAuth() { return { data: { url: "https://abcdefghijklmnopqrst.supabase.co/auth/v1/authorize?provider=google" }, error: null }; },
      async exchangeCodeForSession() { native.exchangeCount++; return { data: { session: { user: { id: "account-a" } } }, error: null }; },
      async signOut() { return { error: null }; },
    },
  }),
}));

beforeEach(() => {
  vi.resetModules();
  native.platform = "android";
  native.values.clear(); native.handlers.clear(); native.opens = []; native.assignments = [];
  native.launch = undefined; native.exchangeCount = 0; native.removed = 0;
  native.callbackDuringOpen = false;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnopqrst.supabase.co");
  // Only the native navigation side effect is replaced, not the authentication state machine.
  vi.stubGlobal("window", {
    location: { assign: (path: string) => native.assignments.push(path) },
    sessionStorage: {
      setItem: (key: string, value: string) => native.values.set(`web:${key}`, value),
      removeItem: (key: string) => native.values.delete(`web:${key}`),
    },
  });
});
afterEach(async () => {
  const runtime = await import("./auth-runtime");
  await runtime.disposeNativeAuth();
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

describe("native auth runtime", () => {
  it("does not register native listeners on web", async () => {
    native.platform = "web";
    await (await import("./auth-runtime")).initializeNativeAuth();
    expect(native.handlers.size).toBe(0);
  });
  it("registers once, completes one callback and removes listeners", async () => {
    const runtime = await import("./auth-runtime");
    await Promise.all([runtime.initializeNativeAuth(), runtime.initializeNativeAuth()]);
    expect(native.handlers.size).toBe(2);
    await runtime.startNativeOAuth("google", "/today");
    expect(runtime.nativeAuthStatus().pending).toBe(true);
    await native.handlers.get("appUrlOpen")?.({ url: `${NATIVE_AUTH_CALLBACK}?code=x` });
    expect(native.exchangeCount).toBe(1);
    expect(native.assignments).toEqual(["/today"]);
    expect(runtime.nativeAuthStatus().pending).toBe(false);
    await runtime.disposeNativeAuth();
    expect(native.handlers.size).toBe(0);
  });
  it("handles a cold launch from the encrypted pending request", async () => {
    native.values.set("ilgam-native-auth-pending", JSON.stringify({
      version: 1, createdAt: Date.now(), path: "/today", owner: null,
    }));
    native.launch = { url: `${NATIVE_AUTH_CALLBACK}?code=cold` };
    await (await import("./auth-runtime")).initializeNativeAuth();
    expect(native.exchangeCount).toBe(1);
    expect(native.assignments).toEqual(["/today"]);
  });
  it("restores the exact existing web reauthentication guard before cold exchange", async () => {
    native.values.set("ilgam-native-auth-pending", JSON.stringify({
      version: 1, createdAt: Date.now(), path: "/settings", owner: "account-a",
    }));
    native.launch = { url: `${NATIVE_AUTH_CALLBACK}?code=reauth` };
    await (await import("./auth-runtime")).initializeNativeAuth();
    expect(native.values.get("web:ilgamcheck:google-reauth-owner")).toBe("account-a");
  });
  it("does not reopen pending UI when callback finishes before Browser.open resolves", async () => {
    native.callbackDuringOpen = true;
    const runtime = await import("./auth-runtime");
    await runtime.startNativeOAuth("google", "/today");
    expect(runtime.nativeAuthStatus().pending).toBe(false);
    expect(native.assignments).toEqual(["/today"]);
  });
  it("browser dismissal allows a retry and removes the verifier", async () => {
    const runtime = await import("./auth-runtime");
    await runtime.startNativeOAuth("google", "/today");
    native.values.set("sb-abcdefghijklmnopqrst-auth-token-code-verifier", "verifier");
    await native.handlers.get("browserFinished")?.();
    expect(runtime.nativeAuthStatus().pending).toBe(false);
    expect(native.values.has("sb-abcdefghijklmnopqrst-auth-token-code-verifier")).toBe(false);
    await runtime.startNativeOAuth("google", "/today");
    expect(native.opens.length).toBe(2);
  });
  it("does not advertise or start Apple auth without provider and revocation setup", async () => {
    await expect((await import("./auth-runtime")).startNativeOAuth("apple", "/today"))
      .rejects.toThrow("Apple 로그인");
    expect(native.opens).toEqual([]);
  });
});
