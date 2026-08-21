import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeHostedEnv } from "./init-hosted-env.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "ilgamcheck-env-init-"));
  roots.push(root);
  return root;
}

describe("hosted env initializer", () => {
  it("copies the template exactly once", () => {
    const root = tempRoot();
    writeFileSync(join(root, ".env.hosted.example"), "SAFE_TEMPLATE=1\n", "utf8");
    initializeHostedEnv(root);
    expect(readFileSync(join(root, ".env.local"), "utf8")).toBe("SAFE_TEMPLATE=1\n");
  });

  it("never overwrites an existing env file", () => {
    const root = tempRoot();
    writeFileSync(join(root, ".env.hosted.example"), "PLACEHOLDER=1\n", "utf8");
    writeFileSync(join(root, ".env.local"), "REAL_SECRET=preserved\n", "utf8");
    expect(() => initializeHostedEnv(root)).toThrow(/덮어쓰지 않았습니다/);
    expect(readFileSync(join(root, ".env.local"), "utf8")).toBe("REAL_SECRET=preserved\n");
  });
});
