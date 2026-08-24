import { describe, expect, it } from "vitest";

import { normalizeSitesDeploymentUrl, runSitesRemoteSmoke } from "./sites-remote-smoke.mjs";

const htmlHeaders = {
  "content-type": "text/html; charset=utf-8",
};

describe("Sites remote smoke", () => {
  it("rejects non-HTTPS deployment origins", () => {
    expect(() => normalizeSitesDeploymentUrl("http://beta.example.test")).toThrow(/HTTPS/);
  });

  it("checks the Sites Worker health, SPA routes, and install files", async () => {
    const fetchImpl = async (request) => {
      const path = new URL(request).pathname;
      if (path === "/api/health") return new Response(JSON.stringify({ status: "ok", ready: true }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      if (path === "/api/public-config") return new Response(JSON.stringify({ config: {
        NEXT_PUBLIC_STORAGE_MODE: "hosted",
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
      } }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      if (["/", "/today", "/privacy", "/terms"].includes(path)) return new Response('<html><meta http-equiv="Content-Security-Policy" content="object-src \'none\'"><script>window.location.replace("about:blank")</script>일감체크</html>', { headers: htmlHeaders });
      if (path === "/manifest.webmanifest") return new Response(JSON.stringify({ name: "일감체크" }), { headers: { "content-type": "application/manifest+json" } });
      if (path === "/sw.js") return new Response("self.addEventListener('fetch', () => {})", { headers: { "content-type": "text/javascript" } });
      return new Response("missing", { status: 404 });
    };

    await expect(runSitesRemoteSmoke("https://beta.example.test", fetchImpl)).resolves.toMatchObject({
      baseUrl: "https://beta.example.test",
      checks: expect.arrayContaining(["public-config(hosted/no-secret/no-store)", "/today(html/spa-route)", "manifest", "service-worker"]),
    });
  });
});
