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
