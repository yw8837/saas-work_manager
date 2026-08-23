import { describe, expect, it } from "vitest";

import { normalizeSitesDeploymentUrl, runSitesRemoteSmoke } from "./sites-remote-smoke.mjs";

const securityHeaders = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": "default-src 'self'; object-src 'none'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=()",
};

describe("Sites remote smoke", () => {
  it("rejects non-HTTPS deployment origins", () => {
    expect(() => normalizeSitesDeploymentUrl("http://beta.example.test")).toThrow(/HTTPS/);
  });

  it("checks the Sites Worker health, SPA routes, and install files", async () => {
    const fetchImpl = async (request) => {
      const path = new URL(request).pathname;
      if (path === "/api/health") return new Response(JSON.stringify({ status: "ok", ready: true }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      if (["/", "/today", "/privacy", "/terms"].includes(path)) return new Response("<html>일감체크</html>", { headers: securityHeaders });
      if (path === "/manifest.webmanifest") return new Response(JSON.stringify({ name: "일감체크" }), { headers: { "content-type": "application/manifest+json" } });
      if (path === "/sw.js") return new Response("self.addEventListener('fetch', () => {})", { headers: { "content-type": "text/javascript" } });
      return new Response("missing", { status: 404 });
    };

    await expect(runSitesRemoteSmoke("https://beta.example.test", fetchImpl)).resolves.toMatchObject({
      baseUrl: "https://beta.example.test",
      checks: expect.arrayContaining(["/today(html/security-headers)", "manifest", "service-worker"]),
    });
  });
});
