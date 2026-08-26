import { afterEach, describe, expect, it, vi } from "vitest";
import { ILGAMCHECK_RUNTIME_CONTRACT } from "@/lib/supabase";
import { runtimePublicConfigDigest } from "@/lib/runtime-public-config";
import worker from "./entry-server";

describe("Sites Worker entry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("serves the app shell after an HTML route misses the asset path", async () => {
    const assets = {
      fetch: vi.fn(async (request: Request) => {
        const path = new URL(request.url).pathname;
        return path === "/app-shell.payload"
          ? new Response("<html>일감체크</html>", {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          })
          : new Response("not found", { status: 404 });
      }),
    };

    const response = await worker.fetch(
      new Request("https://beta.example.test/jobs/new", { headers: { Accept: "text/html" } }),
      { ASSETS: assets },
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("일감체크");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(assets.fetch).toHaveBeenCalledTimes(2);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(new URL(assets.fetch.mock.calls[1]?.[0].url).pathname).toBe("/app-shell.payload");
  });

  it("preserves a direct app route when the asset service redirects it to the root", async () => {
    const assets = {
      fetch: vi.fn(async (request: Request) => {
        const path = new URL(request.url).pathname;
        return path === "/app-shell.payload"
          ? new Response("<html>일감체크</html>", { status: 200 })
          : new Response(null, { status: 307, headers: { Location: "/" } });
      }),
    };

    const response = await worker.fetch(
      new Request("https://beta.example.test/jobs/new", { headers: { Accept: "text/html" } }),
      { ASSETS: assets },
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("일감체크");
    expect(new URL(assets.fetch.mock.calls[1]?.[0].url).pathname).toBe("/app-shell.payload");
  });

  it("preserves a bodyless 304 response when the browser revalidates a cached asset", async () => {
    const assets = {
      fetch: vi.fn(async () => new Response(null, {
        status: 304,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ETag: '"cached-shell"',
        },
      })),
    };

    const response = await worker.fetch(
      new Request("https://beta.example.test/", {
        headers: {
          Accept: "text/html",
          "If-None-Match": '"cached-shell"',
        },
      }),
      { ASSETS: assets },
    );

    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
    expect(response.headers.get("etag")).toBe('"cached-shell"');
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("injects only allowlisted public runtime values into HTML before the client module", async () => {
    const assets = {
      fetch: vi.fn(async () => new Response(
        '<html><head></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>',
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
      )),
    };
    const response = await worker.fetch(
      new Request("https://beta.example.test/today", { headers: { Accept: "text/html" } }),
      {
        ASSETS: assets,
        NEXT_PUBLIC_STORAGE_MODE: "hosted",
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_public_test",
        NEXT_PUBLIC_OPERATOR_NAME: "일감체크 운영자",
        NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com",
        NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "true",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_never_in_html",
      },
    );
    const html = await response.text();

    expect(html).toContain("__ILGAMCHECK_PUBLIC_ENV__");
    expect(html).toContain("NEXT_PUBLIC_STORAGE_MODE");
    expect(html).toContain("sb_publishable_public_test");
    expect(html.indexOf("__ILGAMCHECK_PUBLIC_ENV__")).toBeLessThan(html.indexOf('type="module"'));
    expect(html).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(html).not.toContain("sb_secret_never_in_html");
  });

  it("serves only allowlisted public runtime values from the bootstrap endpoint", async () => {
    const response = await worker.fetch(
      new Request("https://beta.example.test/api/public-config"),
      {
        NEXT_PUBLIC_STORAGE_MODE: "hosted",
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_public_test",
        NEXT_PUBLIC_OPERATOR_NAME: "일감체크 운영자",
        NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com",
        NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "true",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_never_in_json",
      },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(body)).toMatchObject({
      config: {
        NEXT_PUBLIC_STORAGE_MODE: "hosted",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_public_test",
      },
    });
    expect(body).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(body).not.toContain("sb_secret_never_in_json");
  });

  it("allows only the native app origins to read public bootstrap values", async () => {
    const response = await worker.fetch(
      new Request("https://beta.example.test/api/public-config", {
        headers: { Origin: "capacitor://localhost" },
      }),
      { NEXT_PUBLIC_STORAGE_MODE: "hosted" },
    );
    const rejected = await worker.fetch(
      new Request("https://beta.example.test/api/public-config", {
        headers: { Origin: "https://attacker.example" },
      }),
      { NEXT_PUBLIC_STORAGE_MODE: "hosted" },
    );

    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(response.headers.get("vary")).toContain("Origin");
    expect(rejected.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("fails closed when the health endpoint has no server configuration", async () => {
    const assets = { fetch: vi.fn() };

    const response = await worker.fetch(
      new Request("https://beta.example.test/api/health"),
      { ASSETS: assets },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "misconfigured",
      ready: false,
      hostedConfigured: false,
      databaseContractDetected: null,
      serviceRoleContractCurrent: false,
    });
    expect(assets.fetch).not.toHaveBeenCalled();
  });

  it("reports ready only after the bound service role proves the current database contract", async () => {
    const endpoint = "https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/get_ilgamcheck_service_role_contract";
    vi.stubGlobal("fetch", vi.fn(async () => {
      const upstream = new Response(JSON.stringify(ILGAMCHECK_RUNTIME_CONTRACT), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      Object.defineProperty(upstream, "url", { configurable: true, value: endpoint });
      return upstream;
    }));

    const response = await worker.fetch(
      new Request("https://beta.example.test/api/health"),
      {
        NEXT_PUBLIC_STORAGE_MODE: "hosted",
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_public_test",
        NEXT_PUBLIC_OPERATOR_NAME: "일감체크 운영자",
        NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com",
        NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "true",
        SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_only",
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      ready: true,
      service: "ilgamcheck",
      runtimeRequested: "hosted",
      runtimeEffective: "hosted",
      hostedConfigured: true,
      hostedAdapterReady: true,
      supabaseProjectRefConfigured: "abcdefghijklmnopqrst",
      publicConfigDigest: runtimePublicConfigDigest({
        operatorName: "일감체크 운영자",
        supportEmail: "support@example.com",
        betaSignupEnabled: true,
      }),
      publicIdentityConfigured: true,
      signupPolicyConfigured: true,
      databaseContractExpected: ILGAMCHECK_RUNTIME_CONTRACT,
      databaseContractDetected: ILGAMCHECK_RUNTIME_CONTRACT,
      serviceRoleContractCurrent: true,
      policyPublication: { databaseMatches: true },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fails closed on a stale database contract without exposing the key or upstream body", async () => {
    const sentinel = "sb_secret_do_not_expose";
    const endpoint = "https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/get_ilgamcheck_service_role_contract";
    vi.stubGlobal("fetch", vi.fn(async () => {
      const upstream = new Response(JSON.stringify(`stale ${sentinel}`), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      Object.defineProperty(upstream, "url", { configurable: true, value: endpoint });
      return upstream;
    }));

    const response = await worker.fetch(
      new Request("https://beta.example.test/api/health"),
      {
        SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: sentinel,
      },
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toMatchObject({
      status: "misconfigured",
      ready: false,
      databaseContractDetected: null,
      serviceRoleContractCurrent: false,
    });
    expect(body).not.toContain(sentinel);
    expect(body).not.toContain("stale");
  });

  it("keeps account deletion inside the Worker instead of serving an asset", async () => {
    const assets = { fetch: vi.fn() };
    const response = await worker.fetch(
      new Request("https://beta.example.test/api/account/delete", { method: "POST" }),
      { ASSETS: assets },
    );

    expect(response.status).toBe(403);
    expect(assets.fetch).not.toHaveBeenCalled();
  });
});
