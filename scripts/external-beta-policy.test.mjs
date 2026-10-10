import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  EXTERNAL_BETA_SAFE_BASE_ENV_NAMES,
  EXTERNAL_BETA_STEP_ENV_NAMES,
  domainReadyIdentityMismatch,
  externalBetaEnvironment,
  externalBetaStepEnvironment,
  externalBetaSteps,
  parseDomainReadyIdentityCheckpoint,
  runExternalBetaGate,
} from "./external-beta-policy.mjs";

const validEnv = {
  ILGAMCHECK_RELEASE_PLATFORM: "vercel",
  ILGAMCHECK_AUTH_MODE: "password",
  ILGAMCHECK_FINAL_ORIGIN: "https://ilgamcheck.kr",
  SUPABASE_AUTH_SITE_URL: "https://ilgamcheck.kr",
  ILGAMCHECK_HOSTED_VERIFY_ACK: "OVERWRITE_DEDICATED_TEST_DATA",
};

const hostedEnv = {
  NEXT_PUBLIC_STORAGE_MODE: "hosted",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_browser_key",
  NEXT_PUBLIC_OPERATOR_NAME: "일감체크 운영자",
  NEXT_PUBLIC_SUPPORT_EMAIL: "support@ilgamcheck.kr",
  NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "true",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_server_only",
};

const domainReadyIdentity = Object.freeze({
  projectId: "prj_123",
  orgId: "team_123",
  projectName: "ilgamcheck",
  deploymentId: "dpl_123",
  origin: "https://ilgamcheck.kr",
  releaseFingerprint: "a".repeat(64),
  target: "production",
});

function successfulStep(identity = domainReadyIdentity) {
  return {
    status: 0,
    stdout: JSON.stringify({ automatedReady: true, vercelIdentity: identity }),
  };
}

describe("external beta gate", () => {
  it("defaults the current service to Sites Google-only without inheriting the legacy email path", () => {
    const steps = externalBetaSteps({ ...validEnv, ILGAMCHECK_RELEASE_PLATFORM: undefined, ILGAMCHECK_AUTH_MODE: undefined });
    expect(steps[0].label).toBe("Sites release identity");
    expect(steps.some(step => /SMTP|preflight/.test(step.label))).toBe(false);
    const selected = externalBetaEnvironment({ ...validEnv, ILGAMCHECK_RELEASE_PLATFORM: undefined, ILGAMCHECK_AUTH_MODE: undefined });
    expect(selected.ILGAMCHECK_RELEASE_PLATFORM).toBe("sites");
    expect(selected.ILGAMCHECK_AUTH_MODE).toBe("google-only");
  });
  it("checks Sites identity twice and rejects environment or release drift", () => {
    const env = { ...validEnv, ILGAMCHECK_RELEASE_PLATFORM: "sites", ILGAMCHECK_AUTH_MODE: "google-only",
      ILGAMCHECK_SITES_PROJECT_ID: "appgprj_6a8b16a27df88191b5cad3afd63a9366", ILGAMCHECK_SITES_SOURCE_COMMIT: "52183676be62d21ef2ff68d2f1aa4db14d2a06b7" };
    const sitesIdentity = { projectId: env.ILGAMCHECK_SITES_PROJECT_ID,
      versionId: `${env.ILGAMCHECK_SITES_PROJECT_ID}~appgver_bea4700d1744819182051c87f79ec4a4`,
      deploymentId: "appgdep_6ac50e3f5c108191923310c57fee6de6", sourceCommit: env.ILGAMCHECK_SITES_SOURCE_COMMIT,
      archiveDigest: `sha256:${"a".repeat(64)}`, envRevision: 7, origin: validEnv.ILGAMCHECK_FINAL_ORIGIN, versionNumber: 31 };
    for (const drift of [false, true]) {
      let calls = 0;
      const spawn = vi.fn(() => {
        calls++;
        return { status: 0, stdout: JSON.stringify({ automatedReady: true, archiveBound: true, liveAssetsBound: true,
          sitesIdentity: calls === 7 && drift ? { ...sitesIdentity, envRevision: 8 } : sitesIdentity }) };
      });
      expect(runExternalBetaGate({ env, spawnSyncImpl: spawn, logger: { log: vi.fn(), error: vi.fn() } })).toBe(drift ? 1 : 0);
      expect(calls).toBe(7);
    }
  });

  it("does not accept a Vercel or unbound receipt as Sites source identity", () => {
    const spawn = vi.fn().mockReturnValue(successfulStep());
    expect(runExternalBetaGate({ env: { ...validEnv, ILGAMCHECK_RELEASE_PLATFORM: "sites", ILGAMCHECK_AUTH_MODE: "google-only" },
      spawnSyncImpl: spawn, logger: { log: vi.fn(), error: vi.fn() } })).toBe(1);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
  it("uses Sites Google-only checks without Vercel, SMTP, or server-key preflight", () => {
    const steps = externalBetaSteps({ ...validEnv, ILGAMCHECK_RELEASE_PLATFORM: "sites", ILGAMCHECK_AUTH_MODE: "google-only" });
    expect(steps.map((step) => step.label)).toEqual([
      "Sites release identity", "Google-only Auth readback", "policy deletion backup recovery evidence",
      "Sites public smoke", "finalized Sites runtime contract", "hosted destructive verification", "Sites release identity final recheck",
    ]);
    expect(steps.flatMap((step) => step.args).join(" ")).not.toMatch(/vercel|smtp|deploy-preflight/);
    expect(steps.find((step) => step.label === "finalized Sites runtime contract").args).toContain("--require-policy-finalized");
  });

  it("propagates Google A/B token pairs only to hosted verification", () => {
    const env = { ...validEnv, ILGAMCHECK_TEST_A_ACCESS_TOKEN: "access-a", ILGAMCHECK_TEST_A_REFRESH_TOKEN: "refresh-a", ILGAMCHECK_TEST_B_ACCESS_TOKEN: "access-b", ILGAMCHECK_TEST_B_REFRESH_TOKEN: "refresh-b" };
    const selected = externalBetaEnvironment(env, undefined, validEnv.ILGAMCHECK_HOSTED_VERIFY_ACK);
    const steps = externalBetaSteps(selected);
    for (const step of steps) {
      const child = externalBetaStepEnvironment(selected, step);
      for (const label of ["A", "B"]) for (const kind of ["ACCESS", "REFRESH"]) {
        const key = `ILGAMCHECK_TEST_${label}_${kind}_TOKEN`;
        if (step.label === "hosted destructive verification") expect(child[key]).toBe(env[key]);
        else expect(child).not.toHaveProperty(key);
      }
    }
  });

  it("rejects unsupported platform/auth combinations before spawning", () => {
    for (const env of [
      { ...validEnv, ILGAMCHECK_RELEASE_PLATFORM: "unknown" },
      { ...validEnv, ILGAMCHECK_RELEASE_PLATFORM: "sites", ILGAMCHECK_AUTH_MODE: "password" },
    ]) {
      const spawn = vi.fn().mockReturnValue(successfulStep());
      expect(runExternalBetaGate({ env, spawnSyncImpl: spawn, logger: { log: vi.fn(), error: vi.fn() } })).toBe(1);
      expect(spawn).not.toHaveBeenCalled();
    }
  });
  it("runs remote target, operational evidence, preflight, SMTP, smoke, and hosted verification in fail-fast order", () => {
    const root = "C:\\safe\\ilgamcheck-app";
    expect(externalBetaSteps(validEnv, root).map((step) => step.label)).toEqual([
      "domain-ready remote targets",
      "policy deletion backup recovery evidence",
      "deploy preflight",
      "SMTP public DNS",
      "SMTP manual evidence",
      "final-domain remote smoke",
      "hosted destructive verification",
      "domain-ready final production recheck",
    ]);
    expect(externalBetaSteps(validEnv, root)[0].args).toContain("--expected-vercel-target=production");
    const spawnSyncImpl = vi.fn().mockReturnValue(successfulStep());
    expect(runExternalBetaGate({ env: validEnv, root, spawnSyncImpl, logger: { log: vi.fn(), error: vi.fn() } })).toBe(0);
    expect(spawnSyncImpl).toHaveBeenCalledTimes(8);
    expect(spawnSyncImpl.mock.calls[0][1]).toContain("--expected-vercel-target=production");
    expect(spawnSyncImpl.mock.calls[0][1]).toContain("--json");
    expect(spawnSyncImpl.mock.calls[5][1]).toEqual(expect.arrayContaining(["https://ilgamcheck.kr"]));
    expect(spawnSyncImpl.mock.calls[5][1]).toContain("--require-policy-finalized");
    expect(spawnSyncImpl.mock.calls[7][1]).toContain("--expected-vercel-target=production");
    expect(spawnSyncImpl.mock.calls[0][2].stdio).toEqual(["inherit", "pipe", "inherit"]);
    expect(spawnSyncImpl.mock.calls[7][2].stdio).toEqual(["inherit", "pipe", "inherit"]);
  });

  it("stops immediately on the first failed step", () => {
    const spawnSyncImpl = vi.fn()
      .mockReturnValueOnce(successfulStep())
      .mockReturnValueOnce({ status: 7 })
      .mockReturnValue(successfulStep());
    const code = runExternalBetaGate({
      env: validEnv,
      root: "C:\\safe\\ilgamcheck-app",
      spawnSyncImpl,
      logger: { log: vi.fn(), error: vi.fn() },
    });
    expect(code).toBe(7);
    expect(spawnSyncImpl).toHaveBeenCalledTimes(2);
  });

  it("passes a shell PAT only to domain-ready and never supplies the destructive ACK", () => {
    const envWithoutAck = {
      ILGAMCHECK_RELEASE_PLATFORM: "vercel",
      ILGAMCHECK_AUTH_MODE: "password",
      ILGAMCHECK_FINAL_ORIGIN: "https://ilgamcheck.kr",
      SUPABASE_AUTH_SITE_URL: "https://ilgamcheck.kr",
      SUPABASE_ACCESS_TOKEN: "shell-pat",
    };
    const spawnSyncImpl = vi.fn().mockReturnValue(successfulStep());
    runExternalBetaGate({
      env: envWithoutAck,
      root: "C:\\safe\\ilgamcheck-app",
      spawnSyncImpl,
      logger: { log: vi.fn(), error: vi.fn() },
    });
    for (const [index, call] of spawnSyncImpl.mock.calls.entries()) {
      expect(call[2].env).not.toBe(envWithoutAck);
      expect(call[2].env).not.toHaveProperty("ILGAMCHECK_HOSTED_VERIFY_ACK");
      if ([0, 7].includes(index)) expect(call[2].env.SUPABASE_ACCESS_TOKEN).toBe("shell-pat");
      else expect(call[2].env).not.toHaveProperty("SUPABASE_ACCESS_TOKEN");
      expect(call[2].shell).toBe(false);
    }
  });

  it("passes only the safe OS baseline and each step's exact application allowlist", () => {
    const env = {
      ...validEnv,
      ...hostedEnv,
      PATH: "C:\\safe-bin",
      HOME: "C:\\safe-home",
      ILGAMCHECK_OPERATIONAL_EVIDENCE_PATH: "C:\\evidence\\operations.json",
      ILGAMCHECK_AUTH_MODE: "password",
      ILGAMCHECK_SMTP_FROM_DOMAIN: "mail.ilgamcheck.kr",
      ILGAMCHECK_SMTP_RETURN_PATH_DOMAIN: "bounce.ilgamcheck.kr",
      ILGAMCHECK_SMTP_DMARC_DOMAIN: "ilgamcheck.kr",
      ILGAMCHECK_SMTP_DKIM_SELECTORS: "selector1,selector2",
      ILGAMCHECK_SMTP_EVIDENCE_PATH: "C:\\evidence\\smtp.json",
      ILGAMCHECK_TEST_A_EMAIL: "a@example.com",
      ILGAMCHECK_TEST_A_PASSWORD: "a-password",
      ILGAMCHECK_TEST_B_EMAIL: "b@example.com",
      ILGAMCHECK_TEST_B_PASSWORD: "b-password",
      ILGAMCHECK_TEST_A_ACCESS_TOKEN: "access-a",
      ILGAMCHECK_TEST_A_REFRESH_TOKEN: "refresh-a",
      ILGAMCHECK_TEST_B_ACCESS_TOKEN: "access-b",
      ILGAMCHECK_TEST_B_REFRESH_TOKEN: "refresh-b",
      SUPABASE_ACCESS_TOKEN: "shell-pat",
    };
    const spawnSyncImpl = vi.fn().mockReturnValue(successfulStep());
    runExternalBetaGate({
      env,
      root: "C:\\safe\\ilgamcheck-app",
      spawnSyncImpl,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    const applicationNames = (childEnv) => Object.keys(childEnv)
      .filter((name) => !EXTERNAL_BETA_SAFE_BASE_ENV_NAMES.includes(name));
    const expectedByStep = [
      EXTERNAL_BETA_STEP_ENV_NAMES.domainReady,
      EXTERNAL_BETA_STEP_ENV_NAMES.operationalEvidence,
      EXTERNAL_BETA_STEP_ENV_NAMES.deployPreflight,
      EXTERNAL_BETA_STEP_ENV_NAMES.smtpDns,
      EXTERNAL_BETA_STEP_ENV_NAMES.smtpEvidence,
      EXTERNAL_BETA_STEP_ENV_NAMES.remoteSmoke,
      EXTERNAL_BETA_STEP_ENV_NAMES.hostedVerify,
      EXTERNAL_BETA_STEP_ENV_NAMES.domainReadyFinal,
    ];
    for (const [index, call] of spawnSyncImpl.mock.calls.entries()) {
      expect(applicationNames(call[2].env).sort()).toEqual([...expectedByStep[index]].sort());
      expect(call[2].env.PATH).toBe("C:\\safe-bin");
      expect(call[2].env.HOME).toBe("C:\\safe-home");
    }
    expect(spawnSyncImpl.mock.calls[5][2].env).toEqual({
      __NEXT_PROCESSED_ENV: "true",
      PATH: "C:\\safe-bin",
      HOME: "C:\\safe-home",
    });
  });

  it("never propagates unrelated provider tokens, cloud credentials, or SMTP passwords", () => {
    const env = {
      ...validEnv,
      ...hostedEnv,
      SUPABASE_ACCESS_TOKEN: "shell-pat",
      VERCEL_TOKEN: "vercel-secret",
      GITHUB_TOKEN: "github-secret",
      GH_TOKEN: "gh-secret",
      AWS_ACCESS_KEY_ID: "aws-id",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      AWS_SESSION_TOKEN: "aws-session",
      SMTP_PASSWORD: "smtp-secret",
      NPM_TOKEN: "npm-secret",
      ILGAMCHECK_TEST_A_EMAIL: "a@example.com",
      ILGAMCHECK_TEST_A_PASSWORD: "a-password",
      ILGAMCHECK_TEST_B_EMAIL: "b@example.com",
      ILGAMCHECK_TEST_B_PASSWORD: "b-password",
    };
    const spawnSyncImpl = vi.fn().mockReturnValue(successfulStep());
    runExternalBetaGate({
      env,
      root: "C:\\safe\\ilgamcheck-app",
      spawnSyncImpl,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    const forbidden = [
      "VERCEL_TOKEN",
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
      "SMTP_PASSWORD",
      "NPM_TOKEN",
    ];
    for (const [index, call] of spawnSyncImpl.mock.calls.entries()) {
      expect(call[2].env.__NEXT_PROCESSED_ENV).toBe("true");
      for (const name of forbidden) expect(call[2].env).not.toHaveProperty(name);
      if (![0, 7].includes(index)) expect(call[2].env).not.toHaveProperty("SUPABASE_ACCESS_TOKEN");
      if (index !== 6) {
        expect(call[2].env).not.toHaveProperty("ILGAMCHECK_TEST_A_EMAIL");
        expect(call[2].env).not.toHaveProperty("ILGAMCHECK_TEST_A_PASSWORD");
        expect(call[2].env).not.toHaveProperty("ILGAMCHECK_TEST_B_EMAIL");
        expect(call[2].env).not.toHaveProperty("ILGAMCHECK_TEST_B_PASSWORD");
        expect(call[2].env).not.toHaveProperty("ILGAMCHECK_HOSTED_VERIFY_ACK");
      }
    }
  });

  it("fails the final production recheck when the alias changes after the first check", () => {
    let callCount = 0;
    const spawnSyncImpl = vi.fn(() => {
      callCount += 1;
      if (callCount === 8) {
        return successfulStep({ ...domainReadyIdentity, deploymentId: "dpl_replaced" });
      }
      return successfulStep();
    });

    expect(runExternalBetaGate({
      env: validEnv,
      root: "C:\\safe\\ilgamcheck-app",
      spawnSyncImpl,
      logger: { log: vi.fn(), error: vi.fn() },
    })).toBe(1);
    expect(spawnSyncImpl).toHaveBeenCalledTimes(8);
    expect(spawnSyncImpl.mock.calls[0][1]).toEqual(spawnSyncImpl.mock.calls[7][1]);
  });

  it("parses only a production identity for the exact final origin and compares every binding field", () => {
    const parsed = parseDomainReadyIdentityCheckpoint(
      successfulStep().stdout,
      "https://ilgamcheck.kr",
    );
    expect(parsed).toEqual(domainReadyIdentity);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(domainReadyIdentityMismatch(parsed, parsed)).toBeNull();
    expect(domainReadyIdentityMismatch(parsed, {
      ...parsed,
      deploymentId: "dpl_replaced",
    })).toMatch(/deploymentId/);
    expect(() => parseDomainReadyIdentityCheckpoint(
      successfulStep({ ...domainReadyIdentity, target: null }).stdout,
      "https://ilgamcheck.kr",
    )).toThrow(/production/);
    expect(() => parseDomainReadyIdentityCheckpoint(
      successfulStep({ ...domainReadyIdentity, origin: "https://other.example.kr" }).stdout,
      "https://ilgamcheck.kr",
    )).toThrow(/최종 custom domain/);
  });

  it("prevents child @next/env reloads from restoring unrelated .env.local secrets", () => {
    const root = mkdtempSync(join(tmpdir(), "ilgamcheck-external-env-"));
    try {
      writeFileSync(join(root, ".env.local"), [
        "VERCEL_TOKEN=vercel-from-file",
        "AWS_SECRET_ACCESS_KEY=aws-from-file",
        "SMTP_PASSWORD=smtp-from-file",
      ].join("\n"));
      const nextEnvUrl = pathToFileURL(join(
        process.cwd(),
        "node_modules",
        "@next",
        "env",
        "dist",
        "index.js",
      )).href;
      const script = [
        `import nextEnv from ${JSON.stringify(nextEnvUrl)};`,
        "nextEnv.loadEnvConfig(process.cwd());",
        "process.stdout.write(JSON.stringify({",
        "  marker: process.env.__NEXT_PROCESSED_ENV,",
        "  vercel: process.env.VERCEL_TOKEN,",
        "  aws: process.env.AWS_SECRET_ACCESS_KEY,",
        "  smtp: process.env.SMTP_PASSWORD,",
        "}));",
      ].join("\n");
      const env = externalBetaStepEnvironment(
        { PATH: process.env.PATH ?? "", VERCEL_TOKEN: "vercel-from-parent" },
        { envNames: EXTERNAL_BETA_STEP_ENV_NAMES.remoteSmoke },
      );
      const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
        cwd: root,
        env,
        encoding: "utf8",
        shell: false,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ marker: "true" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts destructive credentials only from the invoking shell", () => {
    const loaded = {
      ...validEnv,
      SUPABASE_ACCESS_TOKEN: "from-env-file",
      ILGAMCHECK_HOSTED_VERIFY_ACK: "from-env-file",
      VERCEL_TOKEN: "must-not-propagate",
    };
    const unconfirmed = externalBetaEnvironment(loaded, undefined, undefined);
    expect(unconfirmed).not.toHaveProperty("SUPABASE_ACCESS_TOKEN");
    expect(unconfirmed).not.toHaveProperty("ILGAMCHECK_HOSTED_VERIFY_ACK");
    const selected = externalBetaEnvironment(
      loaded,
      "from-parent-shell",
      "OVERWRITE_DEDICATED_TEST_DATA",
    );
    expect(selected.SUPABASE_ACCESS_TOKEN).toBe("from-parent-shell");
    expect(selected.ILGAMCHECK_HOSTED_VERIFY_ACK).toBe("OVERWRITE_DEDICATED_TEST_DATA");
    expect(selected).not.toHaveProperty("VERCEL_TOKEN");
  });

  it("fails closed before spawning for a missing or preview domain", () => {
    const spawnSyncImpl = vi.fn();
    for (const origin of [undefined, "https://project.vercel.app", "https://ilgamcheck.kr;whoami"]) {
      expect(runExternalBetaGate({
        env: { ILGAMCHECK_FINAL_ORIGIN: origin, SUPABASE_AUTH_SITE_URL: origin },
        spawnSyncImpl,
        logger: { log: vi.fn(), error: vi.fn() },
      })).toBe(1);
    }
    expect(spawnSyncImpl).not.toHaveBeenCalled();
  });

  it("rejects a final custom domain when Auth still points to Preview", () => {
    const spawnSyncImpl = vi.fn();
    expect(runExternalBetaGate({
      env: {
        ...validEnv,
        SUPABASE_AUTH_SITE_URL: "https://project.vercel.app",
      },
      spawnSyncImpl,
      logger: { log: vi.fn(), error: vi.fn() },
    })).toBe(1);
    expect(spawnSyncImpl).not.toHaveBeenCalled();
  });
});
