import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pinnedNpxInvocation, resolveWindowsNpxCli } from "./pinned-npx.mjs";

describe("shell-free pinned npx launcher", () => {
  it("uses node.exe plus npx-cli.js on Windows instead of an unspawnable .cmd shim", () => {
    expect(pinnedNpxInvocation("vercel@59.1.3", ["--version"], "win32", {
      nodeExecutable: "C:\\node\\node.exe",
      npxCliPath: "C:\\node\\npm\\npx-cli.js",
    })).toEqual({
      executable: "C:\\node\\node.exe",
      args: ["C:\\node\\npm\\npx-cli.js", "-y", "vercel@59.1.3", "--version"],
    });
  });

  it.runIf(process.platform === "win32")("can actually spawn the installed npx CLI with shell=false", () => {
    const npxCliPath = resolveWindowsNpxCli();
    expect(existsSync(npxCliPath)).toBe(true);
    const result = spawnSync(process.execPath, [npxCliPath, "--version"], {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
