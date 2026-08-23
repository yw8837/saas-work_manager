import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SITES_STATIC_SPA_ROUTES, prepareSitesSpaRoutes } from "./prepare-sites-spa-routes.mjs";

describe("Sites static SPA routes", () => {
  it("materializes the app shell for direct bookmark routes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ilgamcheck-sites-routes-"));
    await writeFile(join(directory, "index.html"), "<html>일감체크</html>", "utf8");

    await prepareSitesSpaRoutes(directory);

    await expect(readFile(join(directory, "today", "index.html"), "utf8")).resolves.toContain("일감체크");
    await expect(readFile(join(directory, "privacy", "index.html"), "utf8")).resolves.toContain("일감체크");
    expect(SITES_STATIC_SPA_ROUTES).toContain("auth/reset");
  });
});
