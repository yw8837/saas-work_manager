import { afterEach, describe, expect, it, vi } from "vitest";

const createClient = vi.hoisted(() => vi.fn(() => ({ auth: {} })));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  createClient.mockClear();
});

describe("server-only Supabase admin client", () => {
  it("rejects a non-Supabase URL before binding the service-role key", async () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://attacker.example.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_server_only";

    const { getSupabaseAdminClient } = await import("./server-admin");

    expect(getSupabaseAdminClient()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("uses only the canonical HTTPS origin of an exact Supabase project", async () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co/";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_server_only";

    const { getSupabaseAdminClient } = await import("./server-admin");

    expect(getSupabaseAdminClient()).not.toBeNull();
    expect(createClient).toHaveBeenCalledWith(
      "https://abcdefghijklmnopqrst.supabase.co",
      "sb_secret_server_only",
      expect.any(Object),
    );
  });
});
