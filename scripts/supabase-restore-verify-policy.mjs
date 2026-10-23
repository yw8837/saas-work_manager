import { projectRefIssue } from "./supabase-cli-policy.mjs";
import { normalizeDeploymentUrl } from "./remote-smoke-policy.mjs";
import { collectHostedVerificationEnvIssues, hostedVerificationCredential } from "./verify-hosted-runtime-policy.mjs";

export const RECOVERY_VERIFY_ACK = "VERIFY_DEDICATED_RECOVERY_PROJECT";

export function recoveryProductionBindingIssue({
  linkedProductionRef,
  declaredProductionRef,
  recoveryRef,
}) {
  if (linkedProductionRef !== declaredProductionRef) {
    return "현재 production 폴더의 linked Supabase ref가 ILGAMCHECK_PRODUCTION_PROJECT_REF와 다릅니다.";
  }
  if (linkedProductionRef === recoveryRef) {
    return "recovery project ref가 현재 production 폴더의 linked Supabase ref와 같습니다.";
  }
  return null;
}

export function collectRecoveryVerificationIssues(env) {
  const issues = collectHostedVerificationEnvIssues(env);
  const platform = env.ILGAMCHECK_RELEASE_PLATFORM ?? "sites";
  if (!["sites", "vercel"].includes(platform)) issues.push("지원하지 않는 release platform입니다.");
  if (platform === "sites") {
    if ((env.ILGAMCHECK_AUTH_MODE ?? "google-only") !== "google-only") issues.push("Sites 복구 검증은 google-only 인증만 허용합니다.");
    if (["A", "B"].some((label) => hostedVerificationCredential(env, label)?.mode !== "session")) {
      issues.push("Sites 복구 검증에는 전용 Google A/B access/refresh token 쌍이 필요합니다.");
    }
  }
  const recoveryRef = env.ILGAMCHECK_RECOVERY_PROJECT_REF?.trim();
  const refIssue = projectRefIssue(recoveryRef);
  if (refIssue) issues.push(`ILGAMCHECK_RECOVERY_PROJECT_REF: ${refIssue}`);

  const productionRef = env.ILGAMCHECK_PRODUCTION_PROJECT_REF?.trim();
  const productionRefIssue = projectRefIssue(productionRef);
  if (productionRefIssue) {
    issues.push(`ILGAMCHECK_PRODUCTION_PROJECT_REF: ${productionRefIssue}`);
  }

  if (
    recoveryRef
    && productionRef
    && recoveryRef === productionRef
  ) {
    issues.push("recovery project ref가 production project ref와 같습니다.");
  }

  if (recoveryRef && env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    try {
      const hostname = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;
      if (hostname !== `${recoveryRef}.supabase.co`) {
        issues.push("NEXT_PUBLIC_SUPABASE_URL이 지정한 recovery project ref와 다릅니다.");
      }
    } catch {
      // 일반 Hosted env 검사가 URL 오류를 보고한다.
    }
  }

  try {
    normalizeDeploymentUrl(env.ILGAMCHECK_RECOVERY_DEPLOYMENT_URL);
  } catch (error) {
    issues.push(`ILGAMCHECK_RECOVERY_DEPLOYMENT_URL: ${error.message}`);
  }

  if (env.ILGAMCHECK_RECOVERY_VERIFY_ACK !== RECOVERY_VERIFY_ACK) {
    issues.push(`ILGAMCHECK_RECOVERY_VERIFY_ACK=${RECOVERY_VERIFY_ACK} 확인이 필요합니다.`);
  }

  return [...new Set(issues)];
}
