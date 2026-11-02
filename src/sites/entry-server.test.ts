import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ILGAMCHECK_RUNTIME_CONTRACT } from "@/lib/supabase";
import { runtimePublicConfigDigest } from "@/lib/runtime-public-config";
import worker from "./entry-server";

describe("Sites Worker entry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it('does not reuse a consumed HEAD request stream when falling back to the SPA', async () => {
    // Workers can expose a consumed zero-byte HEAD stream. Node forbids HEAD
    // bodies at construction, so model that platform shape with a method getter.
    const request=new Request('https://beta.example.test/today',{
      method:'POST',body:'',headers:{Accept:'text/html'},
    });
    Object.defineProperty(request,'method',{value:'HEAD'});
    const response=await worker.fetch(request,{ASSETS:{fetch:async(input)=>{
      if(new URL(input.url).pathname==='/app-shell.payload') {
        expect(input.method).toBe('HEAD');
        expect(input.body).toBeNull();
        return new Response(null,{headers:{'Content-Type':'application/octet-stream'}});
      }
      await input.text();
      return new Response(null,{status:404});
    }}});
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get('content-type')).toContain('text/html');
  });
  it.each(["/today", "/privacy", "/terms", "/auth/callback", "/r/key.with.dots"])(
    "keeps HEAD %s consistent with its successful HTML GET without returning a body",
    async (path) => {
      const environment = { ASSETS: {
        fetch: async (request: Request) => new URL(request.url).pathname === "/app-shell.payload"
          ? new Response("<html><head></head><body>일감체크</body></html>")
          : new Response("not found", { status: 404 }),
      } };
      const get = await worker.fetch(new Request(`https://beta.example.test${path}`, {
        headers: { Accept: "text/html" },
      }), environment);
      const head = await worker.fetch(new Request(`https://beta.example.test${path}`, {
        method: "HEAD", headers: { Accept: "text/html" },
      }), environment);
      expect(get.status).toBe(200);
      expect(head.status).toBe(get.status);
      expect(head.headers.get("content-type")).toBe(get.headers.get("content-type"));
      expect(head.headers.get("x-robots-tag")).toBe(get.headers.get("x-robots-tag"));
      expect(head.headers.get("content-security-policy")).toBe(get.headers.get("content-security-policy"));
      expect(head.body).toBeNull();
    },
  );
  it.each([undefined, "*/*"])("serves the homepage for a root GET probe with Accept %s", async (accept) => {
    const response = await worker.fetch(
      new Request("https://beta.example.test/", {
        headers: accept ? { Accept: accept } : undefined,
      }),
      {
        ASSETS: {
          fetch: async (request) => new URL(request.url).pathname === "/app-shell.payload"
            ? new Response('<html><head></head><body>일감체크</body></html>', {
              headers: { "Content-Type": "application/octet-stream" },
            })
            : new Response("not found", { status: 404 }),
        },
        NEXT_PUBLIC_OPERATOR_NAME: "상태검사 테스트 운영자",
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const html = await response.text();
    expect(html).toContain("일감체크");
    expect(html).toContain("__ILGAMCHECK_PUBLIC_ENV__");
    expect(html).toContain("상태검사 테스트 운영자");
  });

  it.each([undefined, "*/*", "text/html"])("serves a bodyless homepage for a root HEAD probe with Accept %s", async (accept) => {
    const response = await worker.fetch(
      new Request("https://beta.example.test/?probe=1", {
        method: "HEAD",
        headers: accept ? { Accept: accept } : undefined,
      }),
      {
        ASSETS: {
          fetch: async (request) => new URL(request.url).pathname === "/app-shell.payload"
            ? new Response('<html><head></head><body>일감체크</body></html>', {
              headers: { "Content-Type": "application/octet-stream" },
            })
            : new Response("not found", { status: 404 }),
        },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.body).toBeNull();
    await expect(response.text()).resolves.toBe("");
  });

  it.each([
    ["GET", "/assets/missing.js"],
    ["GET", "/assets/missing"],
    ["GET", "/qa-missing-20261006.js"],
    ["GET", "/missing.css"],
    ["GET", "/favicon.ico"],
    ["GET", "/api/unknown"],
    ["GET", "/api"],
    ["POST", "/"],
    ["POST", "/today"],
    ["HEAD", "/assets/missing.js"],
    ["HEAD", "/api/unknown"],
  ])("does not disguise a missing %s %s request as a successful HTML page", async (method, path) => {
    const response = await worker.fetch(
      new Request(`https://beta.example.test${path}`, {
        method,
        headers: { Accept: "text/html" },
      }),
      {
        ASSETS: {
          fetch: async (request) => new URL(request.url).pathname === "/app-shell.payload"
            ? new Response("<html>일감체크</html>")
            : new Response("not found", { status: 404 }),
        },
      },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    if (method === "HEAD") expect(response.body).toBeNull();
    expect(await response.text()).not.toContain("__ILGAMCHECK_PUBLIC_ENV__");
  });

  it.each(["/r/key", "/r/key.with.dots", "/jobs/job.with.dots", "/auth/callback", "/demo/r", "/guide", "/today?invite=TESTCODE"])(
    "preserves the HTML application route %s and its privacy headers",
    async (path) => {
      const response = await worker.fetch(
        new Request(`https://beta.example.test${path}`, { headers: { Accept: "text/html" } }),
        {
          ASSETS: {
            fetch: async (request) => new URL(request.url).pathname === "/app-shell.payload"
              ? new Response('<html><head></head><body>일감체크</body></html>')
              : new Response("not found", { status: 404 }),
          },
          NEXT_PUBLIC_STORAGE_MODE: "hosted",
          SUPABASE_SERVICE_ROLE_KEY: "sb_secret_never_in_navigation",
        },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      // 고객 링크·체험은 noarchive까지 막는다. beta.example.test는 운영 주소(ilgam.studioyeolmae.com)가 아니라
      // 작업 화면이 아닌 /guide도 noindex다(운영 주소 기준 공개 페이지는 아래 '검색 노출' 시험).
      expect(response.headers.get("x-robots-tag")).toBe(
        path.startsWith("/r/") || path.startsWith("/demo/") ? "noindex, nofollow, noarchive" : "noindex, nofollow",
      );
      const html = await response.text();
      expect(html).toContain("__ILGAMCHECK_PUBLIC_ENV__");
      expect(html).not.toContain("sb_secret_never_in_navigation");
      // 초대 링크 코드는 서버가 HTML에 되돌려 쓰지 않는다(no-referrer와 함께 밖으로 새지 않게).
      expect(html).not.toContain("TESTCODE");
    },
  );

  it("keeps direct root HEAD responses bodyless even when the asset service returns HTML bytes", async () => {
    const response = await worker.fetch(
      new Request("https://beta.example.test/", { method: "HEAD" }),
      {
        ASSETS: {
          fetch: async () => new Response("<html>일감체크</html>", {
            headers: { "Content-Type": "text/html; charset=utf-8", ETag: '"direct-shell"' },
          }),
        },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"direct-shell"');
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.body).toBeNull();
  });

  it("serves the root probe instead of preserving an asset-service redirect back to the root", async () => {
    const response = await worker.fetch(
      new Request("https://beta.example.test/"),
      {
        ASSETS: {
          fetch: async (request) => new URL(request.url).pathname === "/app-shell.payload"
            ? new Response('<html><head></head><body>일감체크</body></html>')
            : new Response(null, { status: 307, headers: { Location: "/" } }),
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("일감체크");
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

const PRODUCTION_ORIGIN = "https://ilgam.studioyeolmae.com";
const shellOnlyAssets = {
  fetch: async (request: Request) => new URL(request.url).pathname === "/app-shell.payload"
    ? new Response("<html><head></head><body>일감체크</body></html>")
    : new Response("not found", { status: 404 }),
};

function htmlRequest(url: string) {
  return new Request(url, { headers: { Accept: "text/html" } });
}

describe("Sites 검색 노출 헤더", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "/today", "/today?invite=TESTCODE", "/jobs", "/jobs/new", "/jobs/summary", "/jobs/job.with.dots",
    "/packages", "/settings", "/feedback", "/auth/callback",
  ])("운영 주소에서도 작업 화면 %s는 noindex, nofollow로 검색에서 뺀다", async (path) => {
    const response = await worker.fetch(htmlRequest(`${PRODUCTION_ORIGIN}${path}`), { ASSETS: shellOnlyAssets });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it.each(["/", "/guide", "/privacy", "/terms"])("운영 주소의 공개 페이지 %s에는 noindex가 없다", async (path) => {
    const response = await worker.fetch(htmlRequest(`${PRODUCTION_ORIGIN}${path}`), { ASSETS: shellOnlyAssets });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });

  it.each(["/r/key", "/demo/r"])("운영 주소에서도 고객 링크·체험 %s는 noarchive까지 막는다", async (path) => {
    const response = await worker.fetch(htmlRequest(`${PRODUCTION_ORIGIN}${path}`), { ASSETS: shellOnlyAssets });
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
  });

  // 라우터(react-router)는 대소문자를 가리지 않고 끝 슬래시도 같은 화면으로 연다. 판정도 같게 한다(토큰 값은 그대로).
  it.each(["/r/key/", "/R/key", "/r/Key.With.Dots/", "/demo/r/", "/DEMO/R", "/Demo/r/"])(
    "대소문자·끝 슬래시가 달라도 고객 링크·체험 %s는 noarchive까지 막는다",
    async (path) => {
      const response = await worker.fetch(htmlRequest(`${PRODUCTION_ORIGIN}${path}`), { ASSETS: shellOnlyAssets });
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    },
  );

  it.each(["/JOBS", "/Today/", "/jobs/Summary/", "/PACKAGES"])("대소문자·끝 슬래시가 달라도 작업 화면 %s는 noindex, nofollow", async (path) => {
    const response = await worker.fetch(htmlRequest(`${PRODUCTION_ORIGIN}${path}`), { ASSETS: shellOnlyAssets });
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it.each([
    "https://ilgamcheck.bsfire1237.workers.dev",
    "https://ilgamcheck-beta.bsfire1237.chatgpt.site",
    "https://www.ilgam.studioyeolmae.com",
  ])("운영 주소가 아닌 호스트 %s로 오면 공개 페이지도 검색에서 뺀다", async (origin) => {
    for (const path of ["/", "/guide", "/privacy", "/terms"]) {
      const response = await worker.fetch(htmlRequest(`${origin}${path}`), { ASSETS: shellOnlyAssets });
      expect(response.headers.get("x-robots-tag"), path).toBe("noindex, nofollow");
    }
  });

  it("운영 주소는 빌드 때 정한 NEXT_PUBLIC_SITE_ORIGIN을 따른다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_ORIGIN", "https://beta.example.test");
    const own = await worker.fetch(htmlRequest("https://beta.example.test/guide"), { ASSETS: shellOnlyAssets });
    const other = await worker.fetch(htmlRequest(`${PRODUCTION_ORIGIN}/guide`), { ASSETS: shellOnlyAssets });
    expect(own.headers.get("x-robots-tag")).toBeNull();
    expect(other.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("API JSON 응답도 검색에서 뺀다", async () => {
    const response = await worker.fetch(new Request(`${PRODUCTION_ORIGIN}/api/public-config`), { NEXT_PUBLIC_STORAGE_MODE: "hosted" });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("운영 주소의 robots.txt는 noindex 없이 그대로 나간다", async () => {
    const assets = { fetch: async () => new Response("User-agent: *\nAllow: /\n", { headers: { "Content-Type": "text/plain" } }) };
    const response = await worker.fetch(new Request(`${PRODUCTION_ORIGIN}/robots.txt`), { ASSETS: assets });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBeNull();
    await expect(response.text()).resolves.toBe("User-agent: *\nAllow: /\n");
  });
});

describe("Sites 고객 링크·체험 공유 미리보기", () => {
  // 모든 화면이 같은 첫 화면(index.html)을 쓰므로, 실제 첫 화면 파일로 응답을 만든다.
  const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const indexAssets = {
    fetch: async (request: Request) => new URL(request.url).pathname === "/app-shell.payload"
      ? new Response(indexHtml)
      : new Response("not found", { status: 404 }),
  };
  const pageHtml = async (path: string) => (await worker.fetch(htmlRequest(`${PRODUCTION_ORIGIN}${path}`), { ASSETS: indexAssets })).text();

  it.each(["/r/token_abc", "/r/key.with.dots", "/demo/r", "/r/token_abc/", "/R/token_abc", "/demo/r/", "/DEMO/R"])("%s는 소개용 슬로건·그림 대신 차분한 공유 미리보기를 낸다", async (path) => {
    const html = await pageHtml(path);
    expect(html).toContain('property="og:title" content="수정 요청 링크"');
    expect(html).toContain('property="og:description" content="작업자가 보낸 수정 요청 페이지예요. 로그인 없이 열려요."');
    expect(html).toContain('name="twitter:card" content="summary"');
    expect(html).not.toMatch(/property="og:image|name="twitter:image|property="og:url/);
    // 실행 설정 주입은 그대로 한다.
    expect(html).toContain("__ILGAMCHECK_PUBLIC_ENV__");
  });

  it.each(["/", "/guide", "/jobs/job_1"])("%s는 소개용 공유 미리보기를 그대로 둔다", async (path) => {
    const html = await pageHtml(path);
    expect(html).toContain('property="og:title" content="일감체크 · 운영은 덜고 작업에 집중하세요"');
    expect(html).toContain('property="og:image"');
    expect(html).not.toContain("수정 요청 링크");
  });
});
