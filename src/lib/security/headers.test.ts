import { afterEach, describe, expect, it } from "vitest";

import { buildBearerRouteHeaders, buildContentSecurityPolicy, buildSecurityHeaders } from "./headers";

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
