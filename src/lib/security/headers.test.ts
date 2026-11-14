import { afterEach, describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";
import {
  buildBearerRouteHeaders,
  buildContentSecurityPolicy,
  buildPrivateAreaHeaders,
  buildSecurityHeaders,
  isPrivateAreaPath,
  PRIVATE_AREA_ROUTE_SOURCES,
} from "./headers";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("production security headers", () => {
  it("blocks framing, MIME sniffing and unnecessary browser capabilities", () => {
    const headers = new Map(buildSecurityHeaders(false).map(({ key, value }) => [key, value]));

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
  });

  it("does not pin HSTS while running localhost development", () => {
    const headers = new Map(buildSecurityHeaders(true).map(({ key, value }) => [key, value]));
    expect(headers.has("Strict-Transport-Security")).toBe(false);
  });

  it("permits only the configured HTTPS Supabase origin", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project-ref.supabase.co/path";
    const csp = buildContentSecurityPolicy(false);

    expect(csp).toContain("https://project-ref.supabase.co");
    expect(csp).toContain("wss://project-ref.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("does not trust an insecure configured backend", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://attacker.invalid";
    expect(buildContentSecurityPolicy(false)).not.toContain("attacker.invalid");
  });

  it("기본 CSP는 지금과 같고 Clarity 주소를 열지 않는다", () => {
    const csp = buildContentSecurityPolicy(false, "https://project-ref.supabase.co");
    expect(csp).toBe([
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://project-ref.supabase.co wss://project-ref.supabase.co",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "));
    expect(csp).not.toMatch(/clarity|bing/);
  });

  it("Clarity 화면 CSP는 공식 안내 주소를 script·connect·img에만 더하고 나머지는 그대로 둔다", () => {
    const base = buildContentSecurityPolicy(false, "https://project-ref.supabase.co").split("; ");
    const clarity = buildContentSecurityPolicy(false, "https://project-ref.supabase.co", { clarity: true }).split("; ");
    const changed = clarity.filter((directive) => !base.includes(directive));

    expect(changed).toEqual([
      "script-src 'self' 'unsafe-inline' https://*.clarity.ms",
      "img-src 'self' data: blob: https://*.clarity.ms https://c.bing.com",
      "connect-src 'self' https://project-ref.supabase.co wss://project-ref.supabase.co https://*.clarity.ms",
    ]);
    expect(clarity).toHaveLength(base.length);
    expect(clarity.join("; ")).not.toContain("unsafe-eval");
    expect(clarity).toContain("default-src 'self'");
    expect(clarity).toContain("frame-ancestors 'none'");
  });

  it("prevents bearer-token customer routes from being indexed or archived", () => {
    const headers = new Map(buildBearerRouteHeaders().map(({ key, value }) => [key, value]));
    expect(headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
  });
});

// 작업 화면(로그인 뒤)·API와 공개 페이지. 작업 화면은 robots.txt로 막지 않고 noindex 헤더·메타로 막는다.
const WORKSPACE_PATHS = [
  "/today", "/jobs", "/jobs/new", "/jobs/summary", "/jobs/job_seed_mora",
  "/packages", "/settings", "/feedback", "/auth/callback", "/api/health",
];
const PUBLIC_PATHS = ["/", "/guide", "/privacy", "/terms"];

/** Next `headers()`의 source(`/x/:path*` 꼴)가 경로에 맞는지 본다. `:path*`는 0개 이상의 하위 경로다. */
function sourceMatches(source: string, pathname: string): boolean {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = source.endsWith("/:path*")
    ? `^${escape(source.slice(0, -"/:path*".length))}(?:/.*)?$`
    : `^${escape(source)}$`;
  return new RegExp(pattern).test(pathname);
}

describe("작업 화면 검색 차단 헤더", () => {
  it("작업 화면·API 경로만 noindex, nofollow 대상이다", () => {
    expect(buildPrivateAreaHeaders()).toEqual([{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
    for (const path of WORKSPACE_PATHS) expect(isPrivateAreaPath(path), path).toBe(true);
    for (const path of [...PUBLIC_PATHS, "/r/token", "/demo/r", "/jobsx", "/todays", "/guide/01-signup.webp", "/robots.txt"]) {
      expect(isPrivateAreaPath(path), path).toBe(false);
    }
  });

  it("Sites 라우터처럼 대소문자와 끝 슬래시를 가리지 않는다(같은 화면이 열리는 주소는 같이 뺀다)", () => {
    for (const path of ["/JOBS", "/Jobs/", "/today/", "/TODAY", "/jobs/Summary", "/Settings/", "/API/health"]) {
      expect(isPrivateAreaPath(path), path).toBe(true);
    }
    for (const path of ["/JOBSX", "/Guide", "/R/token"]) expect(isPrivateAreaPath(path), path).toBe(false);
  });

  it("Next headers()는 작업 화면에만 noindex를 붙이고 공개 페이지에는 붙이지 않는다", async () => {
    const rules = await nextConfig.headers!();
    const robotsFor = (path: string) => rules
      .filter((rule) => sourceMatches(rule.source, path))
      .flatMap((rule) => rule.headers)
      .filter((header) => header.key === "X-Robots-Tag")
      .map((header) => header.value);

    for (const path of WORKSPACE_PATHS) expect(robotsFor(path), path).toEqual(["noindex, nofollow"]);
    for (const path of PUBLIC_PATHS) expect(robotsFor(path), path).toEqual([]);
    expect(robotsFor("/r/token")).toEqual(["noindex, nofollow, noarchive"]);
    expect(robotsFor("/demo/r")).toEqual(["noindex, nofollow, noarchive"]);
    // Next 규칙과 Sites Worker 판정(isPrivateAreaPath)이 같은 경로를 본다.
    for (const source of PRIVATE_AREA_ROUTE_SOURCES) {
      expect(isPrivateAreaPath(source.slice(0, -"/:path*".length)), source).toBe(true);
    }
  });
});

describe("방문 기록 도구(Microsoft Clarity) CSP는 메인·둘러보기 문서에만", () => {
  /** 같은 이름의 헤더는 뒤 규칙이 이긴다(Next headers 문서·OpenNext getNextConfigHeaders). 그 경로의 최종 CSP. */
  async function effectiveCsp(path: string): Promise<string | undefined> {
    const rules = await nextConfig.headers!();
    return rules
      .filter((rule) => sourceMatches(rule.source, path))
      .flatMap((rule) => rule.headers)
      .filter((header) => header.key === "Content-Security-Policy")
      .map((header) => header.value)
      .at(-1);
  }
  const OTHER_PATHS = ["/guide", "/examples", "/privacy", "/terms", "/demo/r", "/r/token", ...WORKSPACE_PATHS];

  it("프로젝트 ID가 있으면 / 와 /try 문서만 Clarity 주소를 연다", async () => {
    process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID = "testproject1";
    for (const path of ["/", "/try"]) {
      const csp = await effectiveCsp(path);
      expect(csp, path).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp, path).toMatch(/script-src [^;]*https:\/\/\*\.clarity\.ms/);
      expect(csp, path).toMatch(/connect-src [^;]*https:\/\/\*\.clarity\.ms/);
      expect(csp, path).toMatch(/img-src [^;]*https:\/\/c\.bing\.com/);
    }
    for (const path of OTHER_PATHS) {
      const csp = await effectiveCsp(path);
      expect(csp, path).toBeDefined();
      expect(csp, path).not.toMatch(/clarity|bing/);
    }
  });

  it.each([undefined, "", "Bad-ID"])("프로젝트 ID가 없거나 틀리면(%j) 어느 문서도 Clarity 주소를 열지 않는다", async (value) => {
    if (value === undefined) delete process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
    else process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID = value;
    for (const path of ["/", "/try", ...OTHER_PATHS]) {
      expect(await effectiveCsp(path), path).not.toMatch(/clarity|bing/);
    }
  });
});
