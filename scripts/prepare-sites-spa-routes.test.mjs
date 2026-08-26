import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SITES_STATIC_SPA_ROUTES, prepareSitesSpaRoutes } from "./prepare-sites-spa-routes.mjs";

describe("Sites static SPA routes", () => {
  it("keeps every HTML navigation behind the Worker security-header boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ilgamcheck-sites-routes-"));
    await writeFile(join(directory, "index.html"), "<html>일감체크</html>", "utf8");

    await prepareSitesSpaRoutes(directory);

    await expect(readFile(join(directory, "app-shell.payload"), "utf8")).resolves.toContain("일감체크");
    await expect(access(join(directory, "index.html"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(directory, "today", "index.html"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(directory, "privacy", "index.html"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(SITES_STATIC_SPA_ROUTES).not.toContain("auth/reset");
  });

  it("writes security headers for static HTML responses that bypass the Worker", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ilgamcheck-sites-headers-"));
    await writeFile(join(directory, "index.html"), "<html>일감체크</html>", "utf8");

    await prepareSitesSpaRoutes(directory);

    const headers = await readFile(join(directory, "_headers"), "utf8");
    expect(headers).toContain("/*");
    expect(headers).toContain("Content-Security-Policy: default-src 'self'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("Strict-Transport-Security: max-age=31536000; includeSubDomains");
  });
});
