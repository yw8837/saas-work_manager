import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock("@supabase/supabase-js"); vi.doUnmock("@/lib/native/platform"); });

describe("Supabase native session configuration", () => {
  it.each(["android", "ios", "web"])("selects safe session behavior on %s", async (platform) => {
    vi.stubEnv("NEXT_PUBLIC_STORAGE_MODE", "hosted");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnopqrst.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test");
    const createClient = vi.fn((...args: unknown[]) => ({ args }));
    vi.doMock("@supabase/supabase-js", () => ({ createClient }));
    vi.doMock("@/lib/native/platform", () => ({ nativePlatform: () => platform }));
    const { getSupabaseBrowserClient } = await import("./client");
    getSupabaseBrowserClient();
    const { auth } = createClient.mock.calls[0][2] as {
      auth: { detectSessionInUrl: boolean; flowType?: string; storage?: Record<string, unknown> };
    };
    expect(auth.detectSessionInUrl).toBe(platform === "web");
    if (platform !== "web") {
      expect(auth.flowType).toBe("pkce");
      expect(auth.storage?.getItem).toBeTypeOf("function");
      expect(auth.storage?.setItem).toBeTypeOf("function");
      expect(auth.storage?.removeItem).toBeTypeOf("function");
    } else {
      expect(auth.storage).toBeUndefined();
    }
  });
});
