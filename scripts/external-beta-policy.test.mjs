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
  NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "false",
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
      ILGAMCHECK_SMTP_FROM_DOMAIN: "mail.ilgamcheck.kr",
      ILGAMCHECK_SMTP_RETURN_PATH_DOMAIN: "bounce.ilgamcheck.kr",
      ILGAMCHECK_SMTP_DMARC_DOMAIN: "ilgamcheck.kr",
      ILGAMCHECK_SMTP_DKIM_SELECTORS: "selector1,selector2",
      ILGAMCHECK_SMTP_EVIDENCE_PATH: "C:\\evidence\\smtp.json",
      ILGAMCHECK_TEST_A_EMAIL: "a@example.com",
      ILGAMCHECK_TEST_A_PASSWORD: "a-password",
      ILGAMCHECK_TEST_B_EMAIL: "b@example.com",
      ILGAMCHECK_TEST_B_PASSWORD: "b-password",
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
