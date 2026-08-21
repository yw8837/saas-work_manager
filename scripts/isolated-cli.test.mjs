import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { isolatedCliInvocation, runIsolatedCli } from "./isolated-cli.mjs";

const ref = "abcdefghijklmnopqrst";

describe("isolated pinned CLI wrappers", () => {
  it("pins the exact Supabase and Vercel commands without a shell", () => {
    const runtime = { nodeExecutable: "C:\\node\\node.exe", npxCliPath: "C:\\node\\npm\\npx-cli.js" };
    expect(isolatedCliInvocation("supabase-login", "win32", runtime)).toMatchObject({
      executable: "C:\\node\\node.exe",
      args: ["C:\\node\\npm\\npx-cli.js", "-y", "supabase@2.114.0", "login"],
    });
    expect(isolatedCliInvocation("vercel-link", "win32", runtime)).toMatchObject({
      executable: "C:\\node\\node.exe",
      args: ["C:\\node\\npm\\npx-cli.js", "-y", "vercel@59.1.3", "link"],
    });
    expect(() => isolatedCliInvocation("arbitrary-command")).toThrow(/허용된/);
  });

  it("does not pass parent deployment secrets to login children", () => {
    const spawn = vi.fn().mockReturnValue({ status: 0 });
    expect(runIsolatedCli({
      action: "supabase-login",
      spawn,
      env: {
        PATH: "C:\\bin",
        USERPROFILE: "C:\\Users\\tester",
        SUPABASE_ACCESS_TOKEN: "pat-secret",
        SUPABASE_SERVICE_ROLE_KEY: "service-secret",
        VERCEL_TOKEN: "vercel-secret",
        ILGAMCHECK_TEST_A_PASSWORD: "password-a",
        AWS_SECRET_ACCESS_KEY: "aws-secret",
      },
    })).toBe(0);
    expect(spawn).toHaveBeenCalledOnce();
    expect(spawn.mock.calls[0][2]).toMatchObject({
      env: { PATH: "C:\\bin", USERPROFILE: "C:\\Users\\tester" },
      shell: false,
    });
  });

  it("checks the linked Supabase target before listing remote migrations", () => {
    const root = mkdtempSync(join(tmpdir(), "ilgamcheck-isolated-cli-"));
    try {
      mkdirSync(join(root, "supabase", ".temp"), { recursive: true });
      writeFileSync(join(root, "supabase", ".temp", "project-ref"), ref, "utf8");
      const spawn = vi.fn()
        .mockReturnValueOnce({
          status: 0,
          stdout: JSON.stringify([{ id: ref, region: "ap-northeast-2" }]),
        })
        .mockReturnValueOnce({ status: 0 });
      expect(runIsolatedCli({
        action: "supabase-migrations",
        root,
        spawn,
        env: {
          PATH: "C:\\bin",
          NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
          SUPABASE_SERVICE_ROLE_KEY: "must-not-propagate",
        },
      })).toBe(0);
      expect(spawn).toHaveBeenCalledTimes(2);
      expect(spawn.mock.calls[1][1]).toEqual(expect.arrayContaining(["migration", "list"]));
      expect(spawn.mock.calls[1][2].env).toEqual({ PATH: "C:\\bin" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
