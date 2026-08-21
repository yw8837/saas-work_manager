import { projectRefIssue } from "./supabase-cli-policy.mjs";
import { normalizeDeploymentUrl } from "./remote-smoke-policy.mjs";
import { collectHostedVerificationEnvIssues } from "./verify-hosted-runtime-policy.mjs";

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
