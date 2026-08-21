import { afterEach, describe, expect, it, vi } from "vitest";

import { getRuntimePublicConfigState, runtimePublicConfigDigest } from "./runtime-public-config";

afterEach(() => vi.unstubAllEnvs());

describe("runtime public config digest", () => {
  it("uses a stable cross-runtime SHA-256 vector without returning public identity values", () => {
    expect(runtimePublicConfigDigest({
      operatorName: " 일감체크 운영자 ",
      supportEmail: "support@example.com",
      betaSignupEnabled: false,
    })).toBe("sha256:6dacc2a160375286aa21320f168a1cad5f2395259d0683425f4c669183ec81d1");
  });

  it("derives only a digest and safe readiness booleans from the public runtime environment", () => {
    vi.stubEnv("NEXT_PUBLIC_OPERATOR_NAME", " 일감체크 운영자 ");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "support@example.com");
    vi.stubEnv("NEXT_PUBLIC_BETA_SIGNUP_ENABLED", "false");

    expect(getRuntimePublicConfigState()).toEqual({
      publicConfigDigest: "sha256:6dacc2a160375286aa21320f168a1cad5f2395259d0683425f4c669183ec81d1",
      publicIdentityConfigured: true,
      closedBetaConfigured: true,
    });
  });
});
