import {
  ILGAMCHECK_POLICY_PUBLICATION_CONTRACT,
  getHostedRuntimeBoundary,
  ILGAMCHECK_RUNTIME_CONTRACT,
  probeHostedPolicyPublicationContract,
  probeHostedRuntimeContract,
} from "@/lib/supabase";
import { POLICY_PUBLICATION_MANIFEST } from "@/lib/policies";
import { getRuntimePublicConfigState } from "@/lib/runtime-public-config";
import { probeHostedServiceRoleContract } from "@/lib/supabase/server-runtime-contract";

export const dynamic = "force-dynamic";

export async function GET() {
  const boundary = getHostedRuntimeBoundary();
  const publicConfig = getRuntimePublicConfigState();
  const [probe, policyProbe, serviceRoleContractCurrent] = boundary.requestedMode === "hosted" && boundary.configured
    ? await Promise.all([
      probeHostedRuntimeContract(),
      probeHostedPolicyPublicationContract(),
      probeHostedServiceRoleContract(),
    ])
    : [
      { ok: boundary.requestedMode === "local", contractVersion: null },
      { ok: boundary.requestedMode === "local", contract: null },
      false,
    ];
  const runtimeReady = boundary.requestedMode === "local"
    || (
      boundary.configured
      && boundary.adapterReady
      && probe.ok
      && policyProbe.ok
      && serviceRoleContractCurrent
    );
  const identityReady = boundary.requestedMode === "local" || publicConfig.publicIdentityConfigured;
  const ready = runtimeReady && identityReady && publicConfig.closedBetaConfigured;

  return Response.json(
    {
      status: ready ? "ok" : "misconfigured",
      ready,
      service: "ilgamcheck",
      version: "0.1.0",
      runtimeRequested: boundary.requestedMode,
      runtimeEffective: boundary.effectiveMode,
      hostedConfigured: boundary.configured,
      supabaseProjectRefConfigured: boundary.supabaseProjectRefConfigured,
      hostedAdapterReady: boundary.adapterReady,
      publicConfigDigest: publicConfig.publicConfigDigest,
      publicIdentityConfigured: publicConfig.publicIdentityConfigured,
      closedBetaConfigured: publicConfig.closedBetaConfigured,
      databaseContractExpected: ILGAMCHECK_RUNTIME_CONTRACT,
      databaseContractDetected: probe.contractVersion,
      serviceRoleContractCurrent,
      policyPublication: {
        finalized: POLICY_PUBLICATION_MANIFEST.finalized,
        bundleDigest: POLICY_PUBLICATION_MANIFEST.bundleDigest,
        termsVersion: POLICY_PUBLICATION_MANIFEST.documents.terms.version,
        privacyVersion: POLICY_PUBLICATION_MANIFEST.documents.privacy.version,
        termsContentDigest: POLICY_PUBLICATION_MANIFEST.documents.terms.contentDigest,
        privacyContentDigest: POLICY_PUBLICATION_MANIFEST.documents.privacy.contentDigest,
        databaseExpected: ILGAMCHECK_POLICY_PUBLICATION_CONTRACT,
        databaseDetected: policyProbe.contract,
        databaseMatches: policyProbe.ok,
      },
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
