import { afterEach, describe, expect, it, vi } from "vitest";

import { loadSitesPublicEnvironment } from "./public-config-client";

afterEach(() => {
  delete globalThis.__ILGAMCHECK_PUBLIC_ENV__;
});

describe("Sites public runtime bootstrap", () => {
  it("loads runtime values before the app renders", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      config: {
        NEXT_PUBLIC_STORAGE_MODE: "hosted",
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_public_test",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await loadSitesPublicEnvironment(request);

    expect(request).toHaveBeenCalledWith("/api/public-config", expect.objectContaining({ cache: "no-store" }));
    expect(globalThis.__ILGAMCHECK_PUBLIC_ENV__).toMatchObject({
      NEXT_PUBLIC_STORAGE_MODE: "hosted",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_public_test",
    });
  });

  it("fails closed when the bootstrap response contains a non-public key", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      config: {
        NEXT_PUBLIC_STORAGE_MODE: "hosted",
        SUPABASE_SERVICE_ROLE_KEY: "must-not-enter-browser-state",
      },
    }), { status: 200 }));

    await expect(loadSitesPublicEnvironment(request)).rejects.toThrow("PUBLIC_CONFIG_INVALID");
    expect(globalThis.__ILGAMCHECK_PUBLIC_ENV__).toBeUndefined();
  });
});
