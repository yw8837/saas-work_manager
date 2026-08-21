import { pinnedNpxInvocation } from "./pinned-npx.mjs";

export const VERCEL_RUNTIME_ENV_NAMES = Object.freeze([
  "NEXT_PUBLIC_STORAGE_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_OPERATOR_NAME",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
  "NEXT_PUBLIC_BETA_SIGNUP_ENABLED",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

export const VERCEL_SECRET_ENV_NAMES = Object.freeze(["SUPABASE_SERVICE_ROLE_KEY"]);
export const VERCEL_PUBLIC_RUNTIME_ENV_NAMES = Object.freeze(
  VERCEL_RUNTIME_ENV_NAMES.filter((name) => !VERCEL_SECRET_ENV_NAMES.includes(name)),
);

export function captureVercelRuntimeEnvironment(env) {
  const captured = {};
  for (const name of VERCEL_RUNTIME_ENV_NAMES) {
    captured[name] = typeof env?.[name] === "string" ? env[name].trim() : "";
  }
  return Object.freeze(captured);
}

export function vercelEnvApplyAck(target, projectId) {
  return `PUSH_HOSTED_ENV_TO_${target.toUpperCase()}_${projectId}`;
}

export function vercelEnvTargetBinding({ projectId, orgId }) {
  if (typeof projectId !== "string" || !/^[A-Za-z0-9_-]+$/.test(projectId)) {
    throw new Error("Vercel project ID가 올바르지 않습니다.");
  }
  if (typeof orgId !== "string" || !/^[A-Za-z0-9_-]+$/.test(orgId)) {
    throw new Error("Vercel scope ID가 올바르지 않습니다.");
  }
  return Object.freeze({ projectId, orgId });
}

export function vercelEnvAddInvocation(
  name,
  target,
  value,
  vercelTarget,
  platform = process.platform,
  runtime = {},
) {
  if (!VERCEL_RUNTIME_ENV_NAMES.includes(name)) throw new Error("허용되지 않은 Vercel 환경변수입니다.");
  if (!["preview", "production"].includes(target)) throw new Error("Vercel target은 preview 또는 production이어야 합니다.");
  if (typeof value !== "string" || !value) throw new Error(`${name} 값이 없습니다.`);
  const { projectId } = vercelEnvTargetBinding(vercelTarget);
  const visibilityFlag = VERCEL_SECRET_ENV_NAMES.includes(name) ? "--sensitive" : "--no-sensitive";
  return {
    ...pinnedNpxInvocation("vercel@59.1.3", [
      "env",
      "add",
      name,
      target,
      "--project",
      projectId,
      "--force",
      visibilityFlag,
      "--yes",
    ], platform, runtime),
    input: `${value}\n`,
  };
}
