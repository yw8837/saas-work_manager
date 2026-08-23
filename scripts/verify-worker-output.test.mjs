import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("verify-worker-output", () => {
  it("does not use Next.js's reserved module identifier", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify-worker-output.mjs"), "utf8");

    expect(script).not.toMatch(/\b(?:const|let|var)\s+module\b/);
  });
});
