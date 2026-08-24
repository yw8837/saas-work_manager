import policyPublicationManifest from "./policy-publication-manifest.json";
import { getPublicEnvironmentValue } from "./public-environment";

export type PolicyLink = {
  label: string;
  href: string;
};

export type PolicyBlock =
  | { type: "paragraph"; text: string }
  | { type: "note"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "links"; label: string; items: PolicyLink[] };

export type PolicyDocument = {
  pathname: "/privacy" | "/terms";
  eyebrow: string;
  title: string;
  metadataDescription: string;
  version: string;
  contentDigest: string;
  lead: string;
  sections: Array<{
    heading: string;
    blocks: PolicyBlock[];
  }>;
};

export type PolicyPublicationManifest = {
  schemaVersion: 1;
  finalized: boolean;
  effectiveDate: string;
  effectiveDateLabel: string;
  bundleDigest: string;
  shared: {
    draftNoticeTitle: string;
    draftNoticeBody: string;
    operatorHeading: string;
    operatorLabel: string;
    supportLabel: string;
    missingPublicValue: string;
    footerLabel: string;
  };
  documents: {
    privacy: PolicyDocument;
    terms: PolicyDocument;
  };
};

export const POLICY_PUBLICATION_MANIFEST = policyPublicationManifest as PolicyPublicationManifest;
export const TERMS_VERSION = POLICY_PUBLICATION_MANIFEST.documents.terms.version;
export const PRIVACY_VERSION = POLICY_PUBLICATION_MANIFEST.documents.privacy.version;
export const POLICY_EFFECTIVE_DATE = POLICY_PUBLICATION_MANIFEST.effectiveDateLabel;

export type PolicyAcceptance = {
  termsVersion: string;
  privacyVersion: string;
};

export type PublicServiceConfig = {
  operatorName: string | null;
  supportEmail: string | null;
  betaSignupEnabled: boolean;
  publicIdentityConfigured: boolean;
};

function trimmedOrNull(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validEmailOrNull(value: string | undefined): string | null {
  const normalized = trimmedOrNull(value);
  return normalized && /^\S+@\S+\.\S+$/.test(normalized) ? normalized : null;
}

export function getPublicServiceConfig(): PublicServiceConfig {
  const operatorName = trimmedOrNull(getPublicEnvironmentValue("NEXT_PUBLIC_OPERATOR_NAME"));
  const supportEmail = validEmailOrNull(getPublicEnvironmentValue("NEXT_PUBLIC_SUPPORT_EMAIL"));

  return {
    operatorName,
    supportEmail,
    betaSignupEnabled: getPublicEnvironmentValue("NEXT_PUBLIC_BETA_SIGNUP_ENABLED") === "true",
    publicIdentityConfigured: Boolean(operatorName && supportEmail),
  };
}

export function currentPolicyAcceptance(): PolicyAcceptance {
  return {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  };
}

export function policySignupMetadata(): Record<string, string | boolean> {
  return {
    ilgamcheck_policy_accepted: true,
    ilgamcheck_terms_version: TERMS_VERSION,
    ilgamcheck_privacy_version: PRIVACY_VERSION,
  };
}
