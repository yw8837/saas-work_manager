import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildVercelDeployCommand,
  buildVercelPromoteCommand,
  parseDeployTarget,
  parseVercelDeployOutput,
  runVercelDeploy,
} from "./vercel-deploy.mjs";

const hash = "c".repeat(64);
const project = { id: "prj_123", name: "ilgamcheck" };
const tempRoots = [];

function linkedRoot() {
  const root = mkdtempSync(join(tmpdir(), "ilgamcheck-vercel-deploy-"));
  tempRoots.push(root);
  mkdirSync(join(root, ".vercel"), { recursive: true });
  writeFileSync(join(root, ".vercel", "project.json"), JSON.stringify({
    projectId: "prj_123",
    orgId: "team_123",
  }));
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Vercel release deployment wrapper", () => {
  it("defaults to preview and accepts only explicit preview/production targets", () => {
    expect(parseDeployTarget([])).toBe("preview");
    expect(parseDeployTarget(["--target", "preview"])).toBe("preview");
    expect(parseDeployTarget(["--target=production"])).toBe("production");
    expect(() => parseDeployTarget(["--prod"])).toThrow(/사용법/);
    expect(() => parseDeployTarget(["--token", "secret"])).toThrow(/사용법/);
  });

  it("builds a pinned non-shell command with public source metadata and exact target", () => {
    const command = buildVercelDeployCommand({
      target: "production",
      projectId: "prj_123",
      fingerprint: hash,
      platform: "win32",
      runtime: {
        nodeExecutable: "C:\\node\\node.exe",
        npxCliPath: "C:\\node\\npm\\npx-cli.js",
      },
    });

    expect(command).toEqual({
      executable: "C:\\node\\node.exe",
      args: [
        "C:\\node\\npm\\npx-cli.js", "-y", "vercel@59.1.3", "deploy", "--yes", "--json", "--meta",
        `ilgamcheckReleaseFingerprint=${hash}`,
        "--project", "prj_123", "--target", "production", "--skip-domain",
      ],
    });
    expect(command.args.join(" ")).not.toMatch(/--token|secret|credential/i);

    const preview = buildVercelDeployCommand({
      target: "preview",
      projectId: "prj_123",
      fingerprint: hash,
    });
    expect(preview.args).not.toContain("--skip-domain");
    expect(buildVercelPromoteCommand("dpl_123").args).toEqual(expect.arrayContaining([
      "promote", "dpl_123", "--yes",
    ]));
  });

  it("parses both direct and non-interactive wrapped pinned CLI JSON", () => {
    const deployment = {
      id: "dpl_123",
      url: "https://ilgamcheck-abc.vercel.app",
      readyState: "READY",
      target: "production",
    };
    expect(parseVercelDeployOutput(JSON.stringify(deployment))).toEqual(deployment);
    expect(parseVercelDeployOutput(JSON.stringify({ status: "ok", deployment }))).toEqual(deployment);
    expect(() => parseVercelDeployOutput("not-json")).toThrow(/JSON/);
    expect(() => parseVercelDeployOutput(JSON.stringify({ deployment: { id: "bad/id" } }))).toThrow(/ID/);
  });

  it("verifies the linked remote project before invoking deploy", () => {
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(project) })
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify({ id: "dpl_123", url: "preview.example" }) });

    const result = runVercelDeploy({
      root: linkedRoot(),
      argv: ["--target", "preview"],
      spawn,
      fingerprint: () => hash,
      env: {
        PATH: "safe-path",
        USERPROFILE: "safe-profile",
        VERCEL_TOKEN: "must-not-propagate",
        SUPABASE_ACCESS_TOKEN: "must-not-propagate",
        SUPABASE_SERVICE_ROLE_KEY: "must-not-propagate",
        ILGAMCHECK_TEST_A_PASSWORD: "must-not-propagate",
        AWS_SECRET_ACCESS_KEY: "must-not-propagate",
      },
    });

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[0][1]).toEqual(expect.arrayContaining(["api", "/v9/projects/prj_123?teamId=team_123"]));
    expect(spawn.mock.calls[1][1]).toEqual(expect.arrayContaining([
      "deploy", "--yes", "--json", "--meta", `ilgamcheckReleaseFingerprint=${hash}`,
      "--project", "prj_123", "--target", "preview",
    ]));
    expect(spawn.mock.calls[1][1]).toContain("--target");
    for (const call of spawn.mock.calls) {
      expect(call[2].env).toEqual({ PATH: "safe-path", USERPROFILE: "safe-profile" });
    }
    expect(result.releaseFingerprint).toBe(hash);
  });

  it("does not deploy when the remote linked project identity differs", () => {
    const spawn = vi.fn().mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ id: "prj_other", name: "attacker" }),
    });

    expect(() => runVercelDeploy({
      root: linkedRoot(),
      argv: [],
      spawn,
      fingerprint: () => hash,
    })).toThrow(/원격 project ID/);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("rejects a deployment when source bytes change during the deploy command", () => {
    const changedHash = "d".repeat(64);
    const fingerprint = vi.fn()
      .mockReturnValueOnce(hash)
      .mockReturnValueOnce(changedHash);
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(project) })
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify({ id: "dpl_raced" }) });

    expect(() => runVercelDeploy({
      root: linkedRoot(),
      argv: ["--target", "production"],
      spawn,
      fingerprint,
    })).toThrow(/deployment를 신뢰하지 말고 현재 소스로 다시 배포/);
    expect(fingerprint).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it("creates production without aliases, verifies its exact identity, then promotes only that deployment", () => {
    const created = {
      id: "dpl_production_123",
      url: "https://ilgamcheck-production.vercel.app",
      readyState: "READY",
      target: "production",
    };
    const details = {
      id: created.id,
      projectId: "prj_123",
      ownerId: "team_123",
      name: "ilgamcheck",
      url: "ilgamcheck-production.vercel.app",
      alias: [],
      readyState: "READY",
      target: "production",
      meta: { ilgamcheckReleaseFingerprint: hash },
    };
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(project) })
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({ status: "ok", deployment: created }),
      })
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(details) })
      .mockReturnValueOnce({ status: 0, stdout: "promotion complete" });

    const result = runVercelDeploy({
      root: linkedRoot(),
      argv: ["--target", "production"],
      spawn,
      fingerprint: () => hash,
      env: { PATH: "safe-path", USERPROFILE: "safe-profile" },
    });

    expect(result.deploymentId).toBe(created.id);
    expect(spawn).toHaveBeenCalledTimes(4);
    expect(spawn.mock.calls[1][1]).toEqual(expect.arrayContaining([
      "deploy", "--target", "production", "--skip-domain",
    ]));
    expect(spawn.mock.calls[2][1]).toEqual(expect.arrayContaining([
      "api", `/v13/deployments/${created.id}?teamId=team_123`, "--raw",
    ]));
    expect(spawn.mock.calls[3][1]).toEqual(expect.arrayContaining([
      "promote", created.id, "--yes",
    ]));
    for (const call of spawn.mock.calls) {
      expect(call[2].env).toEqual({ PATH: "safe-path", USERPROFILE: "safe-profile" });
      expect(call[2].shell).toBe(false);
    }
  });

  it("never promotes a production deployment whose authenticated details are Preview or another project", () => {
    const created = {
      id: "dpl_untrusted",
      url: "https://ilgamcheck-untrusted.vercel.app",
      readyState: "READY",
      target: "production",
    };
    for (const details of [
      {
        id: created.id,
        projectId: "prj_123",
        ownerId: "team_123",
        name: "ilgamcheck",
        url: "ilgamcheck-untrusted.vercel.app",
        readyState: "READY",
        target: null,
        meta: { ilgamcheckReleaseFingerprint: hash },
      },
      {
        id: created.id,
        projectId: "prj_attacker",
        ownerId: "team_123",
        name: "ilgamcheck",
        url: "ilgamcheck-untrusted.vercel.app",
        readyState: "READY",
        target: "production",
        meta: { ilgamcheckReleaseFingerprint: hash },
      },
    ]) {
      const spawn = vi.fn()
        .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(project) })
        .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(created) })
        .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(details) });

      expect(() => runVercelDeploy({
        root: linkedRoot(),
        argv: ["--target", "production"],
        spawn,
        fingerprint: () => hash,
      })).toThrow(/production target|project ID/);
      expect(spawn).toHaveBeenCalledTimes(3);
      expect(spawn.mock.calls.flatMap((call) => call[1])).not.toContain("promote");
    }
  });

  it("does not promote when source bytes change after remote detail verification", () => {
    const changedHash = "d".repeat(64);
    const created = {
      id: "dpl_changed_before_promote",
      url: "https://ilgamcheck-before-promote.vercel.app",
      readyState: "READY",
      target: "production",
    };
    const details = {
      id: created.id,
      projectId: "prj_123",
      ownerId: "team_123",
      name: "ilgamcheck",
      url: "ilgamcheck-before-promote.vercel.app",
      readyState: "READY",
      target: "production",
      meta: { ilgamcheckReleaseFingerprint: hash },
    };
    const fingerprint = vi.fn()
      .mockReturnValueOnce(hash)
      .mockReturnValueOnce(hash)
      .mockReturnValueOnce(changedHash);
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(project) })
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(created) })
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(details) });

    expect(() => runVercelDeploy({
      root: linkedRoot(),
      argv: ["--target", "production"],
      spawn,
      fingerprint,
    })).toThrow(/검증 중.*domain promotion을 중단/);
    expect(spawn).toHaveBeenCalledTimes(3);
    expect(spawn.mock.calls.flatMap((call) => call[1])).not.toContain("promote");
    expect(fingerprint).toHaveBeenCalledTimes(3);
  });

  it("fails closed when source bytes change immediately after promotion", () => {
    const changedHash = "d".repeat(64);
    const created = {
      id: "dpl_changed_after_promote",
      url: "https://ilgamcheck-after-promote.vercel.app",
      readyState: "READY",
      target: "production",
    };
    const details = {
      id: created.id,
      projectId: "prj_123",
      ownerId: "team_123",
      name: "ilgamcheck",
      url: "ilgamcheck-after-promote.vercel.app",
      readyState: "READY",
      target: "production",
      meta: { ilgamcheckReleaseFingerprint: hash },
    };
    const fingerprint = vi.fn()
      .mockReturnValueOnce(hash)
      .mockReturnValueOnce(hash)
      .mockReturnValueOnce(hash)
      .mockReturnValueOnce(changedHash);
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(project) })
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(created) })
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(details) })
      .mockReturnValueOnce({ status: 0, stdout: "promotion complete" });

    expect(() => runVercelDeploy({
      root: linkedRoot(),
      argv: ["--target", "production"],
      spawn,
      fingerprint,
    })).toThrow(/promotion 뒤.*release source가 변경/);
    expect(spawn).toHaveBeenCalledTimes(4);
    expect(spawn.mock.calls[3][1]).toEqual(expect.arrayContaining([
      "promote", created.id, "--yes",
    ]));
    expect(fingerprint).toHaveBeenCalledTimes(4);
  });
});
