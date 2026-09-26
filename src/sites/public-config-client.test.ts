import { afterEach, describe, expect, it, vi } from "vitest";

import { loadSitesPublicEnvironment, publicConfigEndpoint } from "./public-config-client";

afterEach(() => {
  delete globalThis.__ILGAMCHECK_PUBLIC_ENV__;
  vi.unstubAllEnvs();
});

describe("Sites public runtime bootstrap", () => {
  it("uses the configured HTTPS origin for native WebViews, but same-origin for web", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", "https://ilgam.studioyeolmae.com/");
    expect(publicConfigEndpoint({ hostname: "localhost" })).toBe("https://ilgam.studioyeolmae.com/api/public-config");
    expect(publicConfigEndpoint({ hostname: "ilgam.studioyeolmae.com" })).toBe("/api/public-config");
    expect(publicConfigEndpoint({ hostname: "ilgamcheck-beta.bsfire1237.chatgpt.site" })).toBe("/api/public-config");
  });

  it.each(["http://example.com", "https://user:password@example.com", "https://example.com/path", "https://example.com/?key=secret", "https://example.com/#fragment", "https://example.com:444", "https://example.com/\" onload=\"alert(1)"])("rejects an unsafe configured origin: %s", (origin) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", origin);
    expect(() => publicConfigEndpoint({ hostname: "localhost" })).toThrow("SITE_ORIGIN_INVALID");
  });

  it("uses the deployed endpoint inside Android and iOS WebViews", () => {
    expect(publicConfigEndpoint({ hostname: "localhost" })).toBe(
      "https://ilgamcheck-beta.bsfire1237.chatgpt.site/api/public-config",
    );
    expect(publicConfigEndpoint({ hostname: "ilgamcheck-beta.bsfire1237.chatgpt.site" })).toBe("/api/public-config");
  });

  it("loads runtime values before the app renders", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      config: {
        NEXT_PUBLIC_STORAGE_MODE: "hosted",
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_public_test",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await loadSitesPublicEnvironment(request);

    expect(request).toHaveBeenCalledWith(publicConfigEndpoint(), expect.objectContaining({ cache: "no-store" }));
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
