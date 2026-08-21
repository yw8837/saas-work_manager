import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  MINIMAL_CHILD_SAFE_BASE_ENV_NAMES,
  minimalChildEnvironment,
} from "./minimal-child-environment.mjs";
import { normalizeFinalOrigin } from "./smtp-evidence-policy.mjs";
import { normalizeAuthSiteUrl } from "./supabase-config-push-policy.mjs";
import {
  VERCEL_PUBLIC_RUNTIME_ENV_NAMES,
  VERCEL_RUNTIME_ENV_NAMES,
} from "./vercel-env-push-policy.mjs";

export const EXTERNAL_BETA_SAFE_BASE_ENV_NAMES = Object.freeze([
  "__NEXT_PROCESSED_ENV",
  ...MINIMAL_CHILD_SAFE_BASE_ENV_NAMES,
]);

const DOMAIN_READY_IDENTITY_FIELDS = Object.freeze([
  "projectId",
  "orgId",
  "projectName",
  "deploymentId",
  "origin",
  "releaseFingerprint",
  "target",
]);

const DOMAIN_READY_ENV_NAMES = Object.freeze([
  ...VERCEL_RUNTIME_ENV_NAMES,
  "SUPABASE_AUTH_SITE_URL",
  "SUPABASE_ACCESS_TOKEN",
]);
const OPERATIONAL_EVIDENCE_ENV_NAMES = Object.freeze([
  "ILGAMCHECK_OPERATIONAL_EVIDENCE_PATH",
  "ILGAMCHECK_FINAL_ORIGIN",
  "NEXT_PUBLIC_OPERATOR_NAME",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
]);
const SMTP_DNS_ENV_NAMES = Object.freeze([
  "ILGAMCHECK_FINAL_ORIGIN",
  "ILGAMCHECK_SMTP_FROM_DOMAIN",
  "ILGAMCHECK_SMTP_RETURN_PATH_DOMAIN",
  "ILGAMCHECK_SMTP_DMARC_DOMAIN",
  "ILGAMCHECK_SMTP_DKIM_SELECTORS",
]);
const SMTP_EVIDENCE_ENV_NAMES = Object.freeze([
  "ILGAMCHECK_SMTP_EVIDENCE_PATH",
  "ILGAMCHECK_FINAL_ORIGIN",
  "ILGAMCHECK_SMTP_FROM_DOMAIN",
  "ILGAMCHECK_SMTP_RETURN_PATH_DOMAIN",
  "ILGAMCHECK_SMTP_DMARC_DOMAIN",
]);
const HOSTED_VERIFY_ENV_NAMES = Object.freeze([
  ...VERCEL_PUBLIC_RUNTIME_ENV_NAMES,
  "ILGAMCHECK_TEST_A_EMAIL",
  "ILGAMCHECK_TEST_A_PASSWORD",
  "ILGAMCHECK_TEST_B_EMAIL",
  "ILGAMCHECK_TEST_B_PASSWORD",
  "ILGAMCHECK_HOSTED_VERIFY_ACK",
]);

export const EXTERNAL_BETA_STEP_ENV_NAMES = Object.freeze({
  domainReady: DOMAIN_READY_ENV_NAMES,
  operationalEvidence: OPERATIONAL_EVIDENCE_ENV_NAMES,
  deployPreflight: VERCEL_RUNTIME_ENV_NAMES,
  smtpDns: SMTP_DNS_ENV_NAMES,
  smtpEvidence: SMTP_EVIDENCE_ENV_NAMES,
  remoteSmoke: Object.freeze([]),
  hostedVerify: HOSTED_VERIFY_ENV_NAMES,
  domainReadyFinal: DOMAIN_READY_ENV_NAMES,
});

const EXTERNAL_BETA_CONFIG_ENV_NAMES = Object.freeze([
  ...new Set([
    "ILGAMCHECK_FINAL_ORIGIN",
    ...Object.values(EXTERNAL_BETA_STEP_ENV_NAMES).flat(),
  ]),
]);

export function externalBetaSteps(env, root = process.cwd()) {
  const finalOrigin = normalizeFinalOrigin(env.ILGAMCHECK_FINAL_ORIGIN);
  const authOrigin = normalizeAuthSiteUrl(env.SUPABASE_AUTH_SITE_URL);
  if (authOrigin !== finalOrigin) {
    throw new Error("SUPABASE_AUTH_SITE_URL은 ILGAMCHECK_FINAL_ORIGIN과 같은 최종 custom domain이어야 합니다.");
  }
  return [
    {
      label: "domain-ready remote targets",
      args: [
        join(root, "scripts", "domain-ready-status.mjs"),
        "--json",
        "--expected-vercel-target=production",
      ],
      envNames: DOMAIN_READY_ENV_NAMES,
      identityCheckpoint: "initial",
      expectedOrigin: finalOrigin,
    },
    { label: "policy deletion backup recovery evidence", args: [join(root, "scripts", "operational-evidence-verify.mjs")], envNames: OPERATIONAL_EVIDENCE_ENV_NAMES },
    { label: "deploy preflight", args: [join(root, "scripts", "deploy-preflight.mjs")], envNames: VERCEL_RUNTIME_ENV_NAMES },
    { label: "SMTP public DNS", args: [join(root, "scripts", "smtp-dns-verify.mjs")], envNames: SMTP_DNS_ENV_NAMES },
    { label: "SMTP manual evidence", args: [join(root, "scripts", "smtp-evidence-verify.mjs")], envNames: SMTP_EVIDENCE_ENV_NAMES },
    { label: "final-domain remote smoke", args: [join(root, "scripts", "remote-smoke.mjs"), finalOrigin, "--require-policy-finalized"], envNames: EXTERNAL_BETA_STEP_ENV_NAMES.remoteSmoke },
    { label: "hosted destructive verification", args: [join(root, "scripts", "verify-hosted-runtime.mjs")], envNames: HOSTED_VERIFY_ENV_NAMES },
    {
      label: "domain-ready final production recheck",
      args: [
        join(root, "scripts", "domain-ready-status.mjs"),
        "--json",
        "--expected-vercel-target=production",
      ],
      envNames: EXTERNAL_BETA_STEP_ENV_NAMES.domainReadyFinal,
      identityCheckpoint: "final",
      expectedOrigin: finalOrigin,
    },
  ];
}

export function parseDomainReadyIdentityCheckpoint(raw, expectedOrigin) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("domain-ready identity JSON을 해석할 수 없습니다.");
  }
  if (payload?.automatedReady !== true) {
    throw new Error("domain-ready 자동 검증이 PASS가 아닙니다.");
  }
  const identity = payload.vercelIdentity;
  if (!identity || typeof identity !== "object") {
    throw new Error("domain-ready Vercel identity가 없습니다.");
  }
  for (const name of ["projectId", "orgId", "deploymentId"]) {
    if (typeof identity[name] !== "string" || !/^[A-Za-z0-9_-]+$/.test(identity[name])) {
      throw new Error(`domain-ready Vercel ${name}가 올바르지 않습니다.`);
    }
  }
  if (typeof identity.projectName !== "string" || !identity.projectName.trim()) {
    throw new Error("domain-ready Vercel projectName이 없습니다.");
  }
  if (identity.target !== "production") {
    throw new Error("domain-ready Vercel target이 production이 아닙니다.");
  }
  if (typeof identity.releaseFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(identity.releaseFingerprint)) {
    throw new Error("domain-ready release fingerprint가 올바르지 않습니다.");
  }
  const origin = normalizeAuthSiteUrl(identity.origin);
  if (origin !== expectedOrigin) {
    throw new Error("domain-ready Vercel origin이 최종 custom domain과 다릅니다.");
  }
  return Object.freeze({
    projectId: identity.projectId,
    orgId: identity.orgId,
    projectName: identity.projectName,
    deploymentId: identity.deploymentId,
    origin,
    releaseFingerprint: identity.releaseFingerprint,
    target: identity.target,
  });
}

export function domainReadyIdentityMismatch(initial, final) {
  for (const name of DOMAIN_READY_IDENTITY_FIELDS) {
    if (initial?.[name] !== final?.[name]) {
      return `최종 domain-ready의 Vercel ${name}가 최초 검증 snapshot과 다릅니다.`;
    }
  }
  return null;
}

export function externalBetaEnvironment(
  loadedEnv,
  shellSupabaseAccessToken,
  shellHostedVerificationAcknowledgement,
) {
  const env = minimalChildEnvironment(loadedEnv, [
    ...EXTERNAL_BETA_CONFIG_ENV_NAMES.filter((name) => ![
      "SUPABASE_ACCESS_TOKEN",
      "ILGAMCHECK_HOSTED_VERIFY_ACK",
    ].includes(name)),
  ]);
  if (typeof shellSupabaseAccessToken === "string" && shellSupabaseAccessToken.trim()) {
    env.SUPABASE_ACCESS_TOKEN = shellSupabaseAccessToken;
  }
  if (
    typeof shellHostedVerificationAcknowledgement === "string"
    && shellHostedVerificationAcknowledgement.trim()
  ) {
    env.ILGAMCHECK_HOSTED_VERIFY_ACK = shellHostedVerificationAcknowledgement;
  }
  return env;
}

export function externalBetaStepEnvironment(env, step) {
  const childEnv = minimalChildEnvironment(env, step.envNames);
  // Child scripts call loadEnvConfig themselves. This marker makes @next/env
  // keep the coordinator's allowlist instead of re-importing unrelated .env secrets.
  childEnv.__NEXT_PROCESSED_ENV = "true";
  return childEnv;
}

export function runExternalBetaGate({
  env = process.env,
  root = process.cwd(),
  spawnSyncImpl = spawnSync,
  logger = console,
} = {}) {
  let steps;
  try {
    steps = externalBetaSteps(env, root);
  } catch (error) {
    logger.error(`[external-beta] FAIL ${error instanceof Error ? error.message : "최종 domain 설정 오류"}`);
    return 1;
  }

  let initialDomainReadyIdentity = null;
  for (const step of steps) {
    logger.log(`[external-beta] START ${step.label}`);
    const captureIdentity = Boolean(step.identityCheckpoint);
    const result = spawnSyncImpl(process.execPath, step.args, {
      cwd: root,
      env: externalBetaStepEnvironment(env, step),
      stdio: captureIdentity ? ["inherit", "pipe", "inherit"] : "inherit",
      encoding: captureIdentity ? "utf8" : undefined,
      shell: false,
    });
    if (result.error) {
      logger.error(`[external-beta] FAIL ${step.label}: 실행 오류`);
      return 1;
    }
    if (result.status !== 0) {
      logger.error(`[external-beta] FAIL ${step.label}: exit ${result.status ?? 1}`);
      return result.status ?? 1;
    }
    if (captureIdentity) {
      let identity;
      try {
        identity = parseDomainReadyIdentityCheckpoint(
          result.stdout ?? "",
          step.expectedOrigin,
        );
      } catch (error) {
        logger.error(`[external-beta] FAIL ${step.label}: ${error instanceof Error ? error.message : "identity 검증 오류"}`);
        return 1;
      }
      if (step.identityCheckpoint === "initial") {
        initialDomainReadyIdentity = identity;
      } else {
        const mismatch = domainReadyIdentityMismatch(initialDomainReadyIdentity, identity);
        if (mismatch) {
          logger.error(`[external-beta] FAIL ${step.label}: ${mismatch}`);
          return 1;
        }
      }
    }
    logger.log(`[external-beta] PASS ${step.label}`);
  }
  logger.log("[external-beta] PASS 자동 원격 계약·운영 evidence·SMTP·Hosted 검증 전체 통과");
  logger.log("[external-beta] 운영 evidence 검사는 기록의 형식·최신성을 확인하며 법률적 충분성과 기록의 진실성을 대신하지 않습니다.");
  return 0;
}
