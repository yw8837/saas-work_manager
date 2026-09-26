import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import nextEnv from "@next/env";
import {
  evaluateDomainReadyStatus,
  parseDomainReadyVercelTarget,
} from "./domain-ready-status-policy.mjs";
import { verifyLinkedSupabaseProject } from "./supabase-project-guard.mjs";
import { verifyLinkedVercelDeployment } from "./vercel-project-guard.mjs";
import { readDeploymentReceipt } from "./deployment-receipt.mjs";
import { snapshotAndSanitizeDomainReadyEnvironment } from "./domain-ready-environment.mjs";
import { computeMigrationFingerprint } from "./migration-fingerprint.mjs";
import {
  readRuntimeContract,
  runtimePublicConfigDigestFromEnv,
} from "./runtime-contract-readback-policy.mjs";
import { supabaseAuthReadbackIssue } from "./supabase-auth-readback-policy.mjs";

const { loadEnvConfig } = nextEnv;
const root = process.cwd();
const jsonOutput = process.argv.includes("--json");
const expectedVercelTarget = parseDomainReadyVercelTarget(process.argv.slice(2));
const envPath = join(root, ".env.local");
const refPath = join(root, "supabase", ".temp", "project-ref");
const shellSupabaseAccessToken = process.env.SUPABASE_ACCESS_TOKEN;

loadEnvConfig(root);
const policyEnv = snapshotAndSanitizeDomainReadyEnvironment(process.env);
const supabaseProjectRef = readTrimmed(refPath);
const migrationFingerprint = computeMigrationFingerprint(root);

let supabaseRemoteIssue = null;
try {
  verifyLinkedSupabaseProject({ root, env: policyEnv });
} catch (error) {
  supabaseRemoteIssue = error instanceof Error ? error.message : String(error);
}

let vercelDeploymentIssue = null;
let vercelIdentity = null;
try {
  vercelIdentity = verifyLinkedVercelDeployment({
    root,
    authOrigin: policyEnv.SUPABASE_AUTH_SITE_URL,
    expectedTarget: expectedVercelTarget,
  });
} catch (error) {
  vercelDeploymentIssue = error instanceof Error ? error.message : String(error);
}

let runtimeContractRemoteIssue = "Vercel READY deployment 확인이 먼저 필요합니다.";
if (vercelDeploymentIssue === null) {
  try {
    await readRuntimeContract(
      policyEnv.SUPABASE_AUTH_SITE_URL,
      supabaseProjectRef,
      undefined,
      { expectedPublicConfigDigest: runtimePublicConfigDigestFromEnv(policyEnv) },
    );
    runtimeContractRemoteIssue = null;
  } catch (error) {
    runtimeContractRemoteIssue = error instanceof Error ? error.message : String(error);
  }
}

function readTrimmed(path) {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

let authConfigRemoteIssue = "Supabase 원격 프로젝트 확인이 먼저 필요합니다.";
if (supabaseRemoteIssue === null) {
  authConfigRemoteIssue = await supabaseAuthReadbackIssue({
    projectRef: supabaseProjectRef,
    expectedOrigin: policyEnv.SUPABASE_AUTH_SITE_URL,
    legacyOrigin: policyEnv.SUPABASE_AUTH_LEGACY_ORIGIN,
    accessToken: shellSupabaseAccessToken,
  });
}

const result = evaluateDomainReadyStatus({
  envLocalExists: existsSync(envPath),
  env: policyEnv,
  supabaseProjectRef,
  migrationFingerprint,
  deploymentReceipt: readDeploymentReceipt(root),
  supabaseRemoteIssue,
  runtimeContractRemoteIssue,
  authConfigRemoteIssue,
  vercelIdentity,
  vercelDeploymentIssue,
});

if (jsonOutput) {
  console.log(JSON.stringify({ ...result, vercelIdentity }, null, 2));
} else {
  for (const item of result.checks) {
    const label = item.status === "pass" ? "PASS" : "BLOCKED";
    console.log(`[domain-ready] ${label} ${item.id}: ${item.message}`);
  }
  for (const gate of result.manualGates) console.log(`[domain-ready] MANUAL ${gate}`);
  console.log(
    result.automatedReady
      ? "[domain-ready] 자동 연결 준비 PASS. MANUAL/BLOCKED_EXTERNAL 증거까지 끝내야 외부 베타 출시 가능."
      : "[domain-ready] 자동 연결 준비 미완료. 위 BLOCKED 항목부터 처리하세요.",
  );
}

if (!result.automatedReady) process.exitCode = 1;
