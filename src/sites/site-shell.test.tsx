import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Sites build boundary", () => {
  it("declares a Vite Sites build and the required Worker entry", () => {
    const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

    expect(packageJson).toContain('"build:sites"');
    expect(existsSync(resolve(root, "vite.config.ts"))).toBe(true);
    expect(readFileSync(resolve(root, "vite.config.ts"), "utf8")).toContain("sites()");
    expect(existsSync(resolve(root, "src/sites/entry-server.tsx"))).toBe(true);
  });

  it("injects only build-time public configuration for the browser bundle", () => {
    const config = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    expect(config).toContain('"process.env"');
    expect(config).toContain('startsWith("NEXT_PUBLIC_")');
  });
});
