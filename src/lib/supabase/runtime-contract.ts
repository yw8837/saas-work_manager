import { POLICY_PUBLICATION_MANIFEST } from "@/lib/policies";

export const ILGAMCHECK_RUNTIME_CONTRACT = "202608230008";

export type HostedContractProbe = {
  ok: boolean;
  contractVersion: string | null;
};

export type HostedPolicyPublicationContract = {
  finalized: boolean;
  bundleDigest: string;
  termsVersion: string;
  privacyVersion: string;
};

export type HostedPolicyPublicationProbe = {
  ok: boolean;
  contract: HostedPolicyPublicationContract | null;
};

export const ILGAMCHECK_POLICY_PUBLICATION_CONTRACT: HostedPolicyPublicationContract = {
  finalized: POLICY_PUBLICATION_MANIFEST.finalized,
  bundleDigest: POLICY_PUBLICATION_MANIFEST.bundleDigest,
  termsVersion: POLICY_PUBLICATION_MANIFEST.documents.terms.version,
  privacyVersion: POLICY_PUBLICATION_MANIFEST.documents.privacy.version,
};

function isHostedPolicyPublicationContract(value: unknown): value is HostedPolicyPublicationContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (keys.join(",") !== "bundleDigest,finalized,privacyVersion,termsVersion") return false;
  return (
    typeof candidate.finalized === "boolean"
    && typeof candidate.bundleDigest === "string"
    && typeof candidate.termsVersion === "string"
    && typeof candidate.privacyVersion === "string"
  );
}

function policyPublicationContractMatchesExpected(contract: HostedPolicyPublicationContract): boolean {
  return (
    contract.finalized === ILGAMCHECK_POLICY_PUBLICATION_CONTRACT.finalized
    && contract.bundleDigest === ILGAMCHECK_POLICY_PUBLICATION_CONTRACT.bundleDigest
    && contract.termsVersion === ILGAMCHECK_POLICY_PUBLICATION_CONTRACT.termsVersion
    && contract.privacyVersion === ILGAMCHECK_POLICY_PUBLICATION_CONTRACT.privacyVersion
  );
}

export async function probeHostedRuntimeContract(
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): Promise<HostedContractProbe> {
  if (!url || !anonKey) return { ok: false, contractVersion: null };

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/get_ilgamcheck_runtime_contract`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { ok: false, contractVersion: null };

    const contractVersion = await response.json() as unknown;
    return {
      ok: contractVersion === ILGAMCHECK_RUNTIME_CONTRACT,
      contractVersion: typeof contractVersion === "string" ? contractVersion : null,
    };
  } catch {
    return { ok: false, contractVersion: null };
  }
}

export async function probeHostedPolicyPublicationContract(
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): Promise<HostedPolicyPublicationProbe> {
  if (!url || !anonKey) return { ok: false, contract: null };

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/get_ilgamcheck_policy_publication_contract`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { ok: false, contract: null };

    const contract = await response.json() as unknown;
    if (!isHostedPolicyPublicationContract(contract)) return { ok: false, contract: null };
    return {
      ok: policyPublicationContractMatchesExpected(contract),
      contract,
    };
  } catch {
    return { ok: false, contract: null };
  }
}
