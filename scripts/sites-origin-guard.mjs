import { normalizeAuthSiteUrl } from "./supabase-config-push-policy.mjs";
import { verifyLinkedVercelDeployment } from "./vercel-project-guard.mjs";

/**
 * Auth redirects must be tied to the deployment provider that owns the current
 * public origin. Sites deployments use an explicit origin; old Vercel release
 * scripts keep their existing project-identity guard until they are retired.
 */
export function verifyHostedAuthOrigin({
  authOrigin,
  env = process.env,
  verifyVercel = verifyLinkedVercelDeployment,
}) {
  const configuredSitesOrigin = env.ILGAMCHECK_SITES_ORIGIN?.trim();
  if (configuredSitesOrigin) {
    const expected = normalizeAuthSiteUrl(configuredSitesOrigin);
    const actual = normalizeAuthSiteUrl(authOrigin);
    if (actual !== expected) throw new Error("SITES_AUTH_ORIGIN_MISMATCH");
    return { provider: "sites", origin: expected };
  }

  return verifyVercel({ authOrigin });
}
