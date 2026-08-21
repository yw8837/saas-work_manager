import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  vercelDeploymentIssue,
  vercelProjectIssue,
  verifyLinkedVercelDeployment,
} from "./vercel-project-guard.mjs";

const fingerprint = "a".repeat(64);
const link = { projectId: "prj_123", orgId: "team_123" };
const project = { id: "prj_123", name: "ilgamcheck" };
const deployment = {
  id: "dpl_123",
  name: "ilgamcheck",
  url: "ilgamcheck-abc.vercel.app",
  aliases: ["preview.ilgamcheck.kr"],
  readyState: "READY",
};
const details = {
  id: "dpl_123",
  projectId: "prj_123",
  ownerId: "team_123",
  name: "ilgamcheck",
  url: "ilgamcheck-abc.vercel.app",
  alias: ["preview.ilgamcheck.kr"],
  readyState: "READY",
  target: null,
  meta: { ilgamcheckReleaseFingerprint: fingerprint },
};
const tempRoots = [];

function linkedRoot() {
  const root = mkdtempSync(join(tmpdir(), "ilgamcheck-vercel-guard-"));
  tempRoots.push(root);
  mkdirSync(join(root, ".vercel"), { recursive: true });
  writeFileSync(join(root, ".vercel", "project.json"), JSON.stringify(link));
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function issue(overrides = {}) {
  return vercelDeploymentIssue({
    link,
    project,
    deployment,
    details,
    authOrigin: "https://preview.ilgamcheck.kr",
    expectedFingerprint: fingerprint,
    ...overrides,
  });
}

describe("Vercel deployment target guard", () => {
  it("rejects a stale local link before any environment value is sent", () => {
    expect(vercelProjectIssue({ link, project })).toBeNull();
    expect(vercelProjectIssue({ link, project: { ...project, id: "prj_other" } })).toMatch(/원격 project ID/);
    expect(vercelProjectIssue({ link, project: { id: "prj_123" } })).toMatch(/이름이 없습니다/);
  });

  it("accepts inspect output without projectId after exact authenticated detail verification", () => {
    expect(deployment).not.toHaveProperty("projectId");
    expect(issue()).toBeNull();
    expect(issue({ authOrigin: "https://ilgamcheck-abc.vercel.app" })).toBeNull();
  });

  it("rejects deployment ID, project, owner, and name mismatches", () => {
    expect(issue({ details: { ...details, id: "dpl_other" } })).toMatch(/deployment ID/);
    expect(issue({ details: { ...details, projectId: "prj_attacker" } })).toMatch(/project ID/);
    expect(issue({ details: { ...details, ownerId: "team_attacker" } })).toMatch(/owner ID/);
    expect(issue({ details: { ...details, name: "other-project" } })).toMatch(/project 소속/);
  });

  it("rejects old/source-mismatched deployments and missing private metadata", () => {
    expect(issue({ details: { ...details, meta: { ilgamcheckReleaseFingerprint: "b".repeat(64) } } })).toMatch(/release fingerprint/);
    expect(issue({ details: { ...details, meta: undefined } })).toMatch(/release fingerprint/);
    expect(issue({ expectedFingerprint: "not-a-hash" })).toMatch(/로컬 release fingerprint/);
  });

  it("rejects an unrelated origin or non-ready deployment", () => {
    expect(issue({ authOrigin: "https://attacker.example.net" })).toMatch(/URL 또는 alias/);
    expect(issue({ authOrigin: "https://preview.ilgamcheck.kr:4443" })).toMatch(/비표준.*포트/);
    expect(issue({ deployment: { ...deployment, readyState: "BUILDING" } })).toMatch(/READY/);
    expect(issue({ details: { ...details, readyState: "BUILDING" } })).toMatch(/READY/);
  });

  it("requires the authenticated detail target to be exactly production only when requested", () => {
    expect(issue()).toBeNull();
    expect(issue({ expectedTarget: "production" })).toMatch(/production target/);
    expect(issue({
      expectedTarget: "production",
      details: { ...details, target: "production" },
    })).toBeNull();
    expect(issue({ expectedTarget: "preview" })).toMatch(/target이 올바르지/);
  });

  it("uses inspect only for the ID then reads exact owner details from v13 with linked teamId", () => {
    const outputs = [project, deployment, details];
    const spawn = vi.fn(() => ({ status: 0, stdout: JSON.stringify(outputs.shift()) }));
    const fingerprintRead = vi.fn(() => fingerprint);

    const result = verifyLinkedVercelDeployment({
      root: linkedRoot(),
      authOrigin: "https://preview.ilgamcheck.kr",
      spawn,
      fingerprint: fingerprintRead,
      env: {
        PATH: "safe-path",
        USERPROFILE: "safe-profile",
        VERCEL_TOKEN: "must-not-propagate",
        SUPABASE_SERVICE_ROLE_KEY: "must-not-propagate",
        ILGAMCHECK_HOSTED_A_PASSWORD: "must-not-propagate",
        AWS_SECRET_ACCESS_KEY: "must-not-propagate",
      },
    });

    expect(result).toEqual({
      projectId: "prj_123",
      orgId: "team_123",
      projectName: "ilgamcheck",
      deploymentId: "dpl_123",
      origin: "https://preview.ilgamcheck.kr",
      releaseFingerprint: fingerprint,
      target: null,
    });
    expect(spawn).toHaveBeenCalledTimes(3);
    expect(fingerprintRead).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[1][1]).toEqual(expect.arrayContaining(["inspect", "https://preview.ilgamcheck.kr", "--json"]));
    expect(spawn.mock.calls[2][1]).toEqual(expect.arrayContaining([
      "api",
      "/v13/deployments/dpl_123?teamId=team_123",
      "--raw",
    ]));
    expect(spawn.mock.calls.flatMap((call) => call[1]).join(" ")).not.toMatch(/token|secret|credential/i);
    for (const call of spawn.mock.calls) {
      expect(call[2].env).toEqual({ PATH: "safe-path", USERPROFILE: "safe-profile" });
    }
  });

  it("fails when source bytes change while authenticated deployment details are being verified", () => {
    const outputs = [project, deployment, details];
    const spawn = vi.fn(() => ({ status: 0, stdout: JSON.stringify(outputs.shift()) }));
    const fingerprintRead = vi.fn()
      .mockReturnValueOnce(fingerprint)
      .mockReturnValueOnce("b".repeat(64));

    expect(() => verifyLinkedVercelDeployment({
      root: linkedRoot(),
      authOrigin: "https://preview.ilgamcheck.kr",
      spawn,
      fingerprint: fingerprintRead,
    })).toThrow(/원격 검증 중.*release source가 변경/);
    expect(spawn).toHaveBeenCalledTimes(3);
    expect(fingerprintRead).toHaveBeenCalledTimes(2);
  });

  it("keeps the authenticated project snapshot when project.json is relinked mid-verification", () => {
    const root = linkedRoot();
    const outputs = [project, deployment, details];
    const spawn = vi.fn(() => {
      const output = outputs.shift();
      if (spawn.mock.calls.length === 2) {
        writeFileSync(join(root, ".vercel", "project.json"), JSON.stringify({
          projectId: "prj_attacker",
          orgId: "team_attacker",
        }));
      }
      return { status: 0, stdout: JSON.stringify(output) };
    });

    const result = verifyLinkedVercelDeployment({
      root,
      authOrigin: "https://preview.ilgamcheck.kr",
      spawn,
      fingerprint: () => fingerprint,
    });

    expect(result.projectId).toBe("prj_123");
    expect(result.orgId).toBe("team_123");
    expect(Object.isFrozen(result)).toBe(true);
  });
});
