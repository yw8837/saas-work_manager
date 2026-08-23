import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

describe("Sites build boundary", () => {
  it("declares a Vite Sites build and the required Worker entry", () => {
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

  it("puts browser assets in the Sites public output directory", () => {
    const config = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    expect(config).toContain('outDir: "dist/public"');
    expect(packageJson).toContain('scripts/clean-sites-output.mjs');
  });
});
