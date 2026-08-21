import { minimalChildEnvironment } from "./minimal-child-environment.mjs";

const EXPLICIT_SECRET_ENV_NAMES = new Set([
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VERCEL_TOKEN",
]);

export function isSecretChildEnvironmentName(name) {
  return EXPLICIT_SECRET_ENV_NAMES.has(name)
    || /(?:^|_)(?:PASSWORD|PASSWD|PASS|SECRET|PRIVATE_KEY|SERVICE_ROLE(?:_KEY)?|ACCESS_TOKEN|AUTH_TOKEN|API_TOKEN|SIGNING_KEY|ENCRYPTION_KEY)(?:_|$)/i.test(name)
    || /(?:^|_)(?:DATABASE_URL|DB_URL)(?:_|$)/i.test(name);
}

export function snapshotAndSanitizeDomainReadyEnvironment(env = process.env) {
  const policyEnv = { ...env };
  const childEnv = minimalChildEnvironment(env);

  for (const name of Object.keys(env)) delete env[name];
  Object.assign(env, childEnv);

  return policyEnv;
}
