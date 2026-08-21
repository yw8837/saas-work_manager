import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PRIVACY_VERSION,
  TERMS_VERSION,
  currentPolicyAcceptance,
  getPublicServiceConfig,
  policySignupMetadata,
} from "./policies";

afterEach(() => vi.unstubAllEnvs());

describe("public service policy configuration", () => {
  it("fails closed when beta and operator settings are absent", () => {
    vi.stubEnv("NEXT_PUBLIC_OPERATOR_NAME", "");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "not-an-email");
    vi.stubEnv("NEXT_PUBLIC_BETA_SIGNUP_ENABLED", "false");

    expect(getPublicServiceConfig()).toEqual({
      operatorName: null,
      supportEmail: null,
      betaSignupEnabled: false,
      publicIdentityConfigured: false,
    });
  });

  it("exposes only valid, explicitly enabled public settings", () => {
    vi.stubEnv("NEXT_PUBLIC_OPERATOR_NAME", " 일감체크 운영자 ");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "support@example.com");
    vi.stubEnv("NEXT_PUBLIC_BETA_SIGNUP_ENABLED", "true");

    expect(getPublicServiceConfig()).toEqual({
      operatorName: "일감체크 운영자",
      supportEmail: "support@example.com",
      betaSignupEnabled: true,
      publicIdentityConfigured: true,
    });
  });

  it("keeps signup metadata and the visible policy versions identical", () => {
    expect(currentPolicyAcceptance()).toEqual({
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    });
    expect(policySignupMetadata()).toEqual({
      ilgamcheck_policy_accepted: true,
      ilgamcheck_terms_version: TERMS_VERSION,
      ilgamcheck_privacy_version: PRIVACY_VERSION,
    });
  });
});
