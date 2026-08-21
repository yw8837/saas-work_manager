import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VERCEL_RUNTIME_ENV_NAMES } from "./vercel-env-push-policy.mjs";
import { pushVercelRuntimeEnvironment } from "./vercel-env-push-runner.mjs";

const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Vercel env push target lock", () => {
  it("keeps all seven writes on the captured project and scope after a mid-run re-link", () => {
    const root = mkdtempSync(join(tmpdir(), "ilgamcheck-vercel-env-target-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".vercel"));

    const projectPath = join(root, ".vercel", "project.json");
    const captured = { projectId: "prj_captured", orgId: "team_captured" };
    const attacker = { projectId: "prj_attacker", orgId: "team_attacker" };
    writeFileSync(projectPath, JSON.stringify(captured));

    const values = Object.fromEntries(
      VERCEL_RUNTIME_ENV_NAMES.map((name, index) => [name, `private-value-${index}`]),
    );
    const isolatedRoots = [];
    const isolatedLinks = [];
    const spawn = vi.fn((...call) => {
      const options = call[2];
      isolatedRoots.push(options.cwd);
      isolatedLinks.push(JSON.parse(readFileSync(join(options.cwd, ".vercel", "project.json"), "utf8")));
      if (spawn.mock.calls.length === 1) {
        writeFileSync(projectPath, JSON.stringify(attacker));
        captured.projectId = attacker.projectId;
        captured.orgId = attacker.orgId;
      }
      return { status: 0 };
    });

    const result = pushVercelRuntimeEnvironment({
      target: "preview",
      vercelProject: captured,
      values,
      env: {
        PATH: "safe-path",
        USERPROFILE: "safe-profile",
        VERCEL_TOKEN: "must-not-propagate",
        VERCEL_PROJECT_ID: "prj_attacker_env",
        VERCEL_ORG_ID: "team_attacker_env",
        SUPABASE_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY,
      },
      spawn,
    });

    expect(result).toEqual({
      ok: true,
      count: 7,
      projectId: "prj_captured",
      orgId: "team_captured",
    });
    expect(JSON.parse(readFileSync(projectPath, "utf8"))).toEqual(attacker);
    expect(spawn).toHaveBeenCalledTimes(7);
    expect(new Set(isolatedRoots).size).toBe(1);
    expect(isolatedRoots[0]).not.toBe(root);
    expect(isolatedLinks).toEqual(Array(7).fill({ projectId: "prj_captured", orgId: "team_captured" }));
    expect(existsSync(isolatedRoots[0])).toBe(false);

    for (const [index, [executable, args, options]] of spawn.mock.calls.entries()) {
      expect(typeof executable).toBe("string");
      expect(args.slice(args.indexOf("--project"), args.indexOf("--project") + 2)).toEqual([
        "--project",
        "prj_captured",
      ]);
      expect(args).not.toContain("--scope");
      expect(args).not.toEqual(expect.arrayContaining(["prj_attacker", "team_attacker"]));
      expect(args).not.toContain(values[VERCEL_RUNTIME_ENV_NAMES[index]]);
      expect(options).toMatchObject({
        cwd: isolatedRoots[0],
        env: { PATH: "safe-path", USERPROFILE: "safe-profile" },
        input: `${values[VERCEL_RUNTIME_ENV_NAMES[index]]}\n`,
        shell: false,
        windowsHide: true,
      });
    }
  });

  it("removes the isolated target directory after a failed write without exposing the value", () => {
    const values = Object.fromEntries(
      VERCEL_RUNTIME_ENV_NAMES.map((name, index) => [name, `failure-secret-${index}`]),
    );
    let isolatedRoot;
    const spawn = vi.fn((...call) => {
      isolatedRoot = call[2].cwd;
      return { status: 23 };
    });

    const result = pushVercelRuntimeEnvironment({
      target: "production",
      vercelProject: { projectId: "prj_captured", orgId: "team_captured" },
      values,
      env: { PATH: "safe-path" },
      spawn,
    });

    expect(result).toEqual({
      ok: false,
      name: VERCEL_RUNTIME_ENV_NAMES[0],
      status: 23,
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(existsSync(isolatedRoot)).toBe(false);
    expect(spawn.mock.calls[0][1]).not.toContain(values[VERCEL_RUNTIME_ENV_NAMES[0]]);
  });
});
