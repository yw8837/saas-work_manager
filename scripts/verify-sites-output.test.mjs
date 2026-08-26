import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const verifier = resolve(process.cwd(), "scripts/verify-sites-output.mjs");

async function writeFixture(root, path, contents = "fixture") {
  const destination = join(root, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents, "utf8");
}

describe("Sites output verifier", () => {
  it("accepts only a Worker-routed app shell for HTML navigation", async () => {
    const root = await mkdtemp(join(tmpdir(), "ilgamcheck-sites-output-"));
    await writeFixture(root, "dist/server/index.js", "__ILGAMCHECK_PUBLIC_ENV__ /api/health");
    await writeFixture(root, "dist/client/app-shell.html", "<html>일감체크</html>");
    await writeFixture(root, "dist/.openai/hosting.json", "{}");

    const result = spawnSync(process.execPath, [verifier], { cwd: root, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Sites output verified");
  });
});
