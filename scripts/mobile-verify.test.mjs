import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const fromRoot = (path) => resolve(root, path);
const configPath = fromRoot("capacitor.config.ts");

describe("mobile shell", () => {
  it("declares one production web bundle for the Android and iOS wrappers", () => {
    expect(existsSync(configPath)).toBe(true);

    const config = readFileSync(configPath, "utf8");
    expect(config).toContain('appId: "com.yeolmaestudio.ilgamcheck"');
    expect(config).toContain('appName: "일감체크"');
    expect(config).toContain('webDir: "dist/client"');
    expect(config).not.toContain("bundledWebRuntime");
  });

  it("contains both native projects and the mobile verification command", async () => {
    expect(existsSync(fromRoot("android/app"))).toBe(true);
    expect(existsSync(fromRoot("ios/App"))).toBe(true);

    const packageJson = JSON.parse(readFileSync(fromRoot("package.json"), "utf8"));
    expect(packageJson.scripts["mobile:verify"]).toBeDefined();
  });
});
