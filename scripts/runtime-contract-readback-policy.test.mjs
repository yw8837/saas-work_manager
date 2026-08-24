import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeExpectedPublicConfigDigest,
  normalizeExpectedProjectRef,
  normalizeRuntimeOrigin,
  POLICY_PUBLICATION_EXPECTED,
  readRuntimeContract,
  RUNTIME_CONTRACT_EXPECTED,
  runtimePublicConfigDigest,
  runtimePublicConfigDigestFromEnv,
  validateRuntimeHealthPayload,
} from "./runtime-contract-readback-policy.mjs";

const PROJECT_REF = "abcdefghijklmnopqrst";
const WRONG_PROJECT_REF = "12345678901234567890";
const EXPECTED_PUBLIC_CONFIG_DIGEST = "sha256:4217bc661d627657555f10e9d97757663be5cc5f5edf641c6e52b62e0bc6ea1c";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_OPERATOR_NAME", "일감체크 운영자");
  vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "support@example.com");
  vi.stubEnv("NEXT_PUBLIC_BETA_SIGNUP_ENABLED", "true");
});

afterEach(() => vi.unstubAllEnvs());

function validPayload(overrides = {}) {
  const policyDatabaseContract = {
    finalized: POLICY_PUBLICATION_EXPECTED.finalized,
    bundleDigest: POLICY_PUBLICATION_EXPECTED.bundleDigest,
    termsVersion: POLICY_PUBLICATION_EXPECTED.termsVersion,
    privacyVersion: POLICY_PUBLICATION_EXPECTED.privacyVersion,
  };
  return {
    status: "ok",
    ready: true,
    service: "ilgamcheck",
    version: "0.1.0",
    runtimeRequested: "hosted",
    runtimeEffective: "hosted",
    hostedConfigured: true,
    hostedAdapterReady: true,
    supabaseProjectRefConfigured: PROJECT_REF,
    publicConfigDigest: EXPECTED_PUBLIC_CONFIG_DIGEST,
    publicIdentityConfigured: true,
    signupPolicyConfigured: true,
    databaseContractExpected: RUNTIME_CONTRACT_EXPECTED,
    databaseContractDetected: RUNTIME_CONTRACT_EXPECTED,
    serviceRoleContractCurrent: true,
    policyPublication: {
      ...POLICY_PUBLICATION_EXPECTED,
      databaseExpected: policyDatabaseContract,
      databaseDetected: policyDatabaseContract,
      databaseMatches: true,
    },
    ...overrides,
  };
}

function jsonResponse(payload = validPayload(), init = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });
}

describe("runtime contract readback policy", () => {
  it("accepts only a credential-free HTTPS origin", () => {
    expect(normalizeRuntimeOrigin(" https://preview.vercel.app/ ")).toBe("https://preview.vercel.app");
    for (const invalid of [
      "",
      "preview.vercel.app",
      "http://preview.vercel.app",
      "https://user:pass@preview.vercel.app",
      "https://preview.vercel.app/today",
      "https://preview.vercel.app/?x=1",
      "https://preview.vercel.app/#fragment",
    ]) {
      expect(() => normalizeRuntimeOrigin(invalid)).toThrow();
    }
    expect(() => normalizeRuntimeOrigin("https://preview.vercel.app:8443")).toThrow(/포트/);
  });

  it("requires an exact 20-character Supabase project ref", () => {
    expect(normalizeExpectedProjectRef(PROJECT_REF)).toBe(PROJECT_REF);
    for (const invalid of [undefined, "", "example", `${PROJECT_REF}x`, "ABCDEFGHIJKLMNOPQRST"]) {
      expect(() => normalizeExpectedProjectRef(invalid)).toThrow(/20자/);
    }
  });

  it("uses the same stable digest vector as the deployed health route", () => {
    expect(runtimePublicConfigDigest({
      operatorName: " 일감체크 운영자 ",
      supportEmail: "support@example.com",
      betaSignupEnabled: true,
    })).toBe(EXPECTED_PUBLIC_CONFIG_DIGEST);
    expect(runtimePublicConfigDigestFromEnv(process.env)).toBe(EXPECTED_PUBLIC_CONFIG_DIGEST);
    expect(normalizeExpectedPublicConfigDigest(EXPECTED_PUBLIC_CONFIG_DIGEST))
      .toBe(EXPECTED_PUBLIC_CONFIG_DIGEST);
    expect(() => normalizeExpectedPublicConfigDigest("sha256:short")).toThrow(/sha256/);
  });

  it("GETs only the same-origin health endpoint without following redirects", async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url.href).toBe("https://preview.vercel.app/api/health");
      expect(options).toMatchObject({ method: "GET", cache: "no-store", redirect: "manual" });
      expect(options.headers).toMatchObject({ Accept: "application/json" });
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return jsonResponse();
    });

    await expect(readRuntimeContract("https://preview.vercel.app", PROJECT_REF, fetchImpl)).resolves.toEqual({
      origin: "https://preview.vercel.app",
      healthUrl: "https://preview.vercel.app/api/health",
      service: "ilgamcheck",
      version: "0.1.0",
      runtimeContract: RUNTIME_CONTRACT_EXPECTED,
      serviceRoleContractCurrent: true,
      supabaseProjectRefConfigured: PROJECT_REF,
      publicConfigDigest: EXPECTED_PUBLIC_CONFIG_DIGEST,
      policyPublication: {
        finalized: POLICY_PUBLICATION_EXPECTED.finalized,
        bundleDigest: POLICY_PUBLICATION_EXPECTED.bundleDigest,
        termsVersion: POLICY_PUBLICATION_EXPECTED.termsVersion,
        privacyVersion: POLICY_PUBLICATION_EXPECTED.privacyVersion,
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects redirects, non-200 responses and a changed response URL", async () => {
    await expect(readRuntimeContract("https://preview.vercel.app", PROJECT_REF, async () => new Response(null, {
      status: 302,
      headers: { location: "https://evil.example/api/health" },
    }))).rejects.toThrow(/redirect/);

    await expect(readRuntimeContract("https://preview.vercel.app", PROJECT_REF, async () => jsonResponse({}, {
      status: 503,
    }))).rejects.toThrow(/HTTP 503/);

    const changedUrlResponse = jsonResponse();
    Object.defineProperty(changedUrlResponse, "url", { value: "https://evil.example/api/health" });
    await expect(readRuntimeContract("https://preview.vercel.app", PROJECT_REF, async () => changedUrlResponse))
      .rejects.toThrow(/동일 origin/);
  });

  it("fails closed on content type, declared size and streamed size", async () => {
    await expect(readRuntimeContract("https://preview.vercel.app", PROJECT_REF, async () => new Response("{}", {
      headers: { "content-type": "text/html" },
    }))).rejects.toThrow(/Content-Type/);

    await expect(readRuntimeContract("https://preview.vercel.app", PROJECT_REF, async () => new Response("{}", {
      headers: { "content-type": "application/json", "content-length": "65" },
    }), { maxResponseBytes: 64 })).rejects.toThrow(/64 byte/);

    await expect(readRuntimeContract("https://preview.vercel.app", PROJECT_REF, async () => new Response("x".repeat(65), {
      headers: { "content-type": "application/json" },
    }), { maxResponseBytes: 64 })).rejects.toThrow(/64 byte/);

    await expect(readRuntimeContract("https://preview.vercel.app", PROJECT_REF, async () => new Response("{}", {
      headers: { "content-type": "application/json", "content-length": "invalid" },
    }))).rejects.toThrow(/Content-Length/);
  });

  it("rejects invalid JSON and every security-relevant contract mismatch", async () => {
    await expect(readRuntimeContract("https://preview.vercel.app", PROJECT_REF, async () => new Response("{", {
      headers: { "content-type": "application/json" },
    }))).rejects.toThrow(/JSON/);

    for (const overrides of [
      { status: "misconfigured" },
      { ready: false },
      { service: "other" },
      { version: "" },
      { runtimeRequested: "local" },
      { runtimeEffective: "local" },
      { hostedConfigured: false },
      { hostedAdapterReady: false },
      { publicIdentityConfigured: false },
      { signupPolicyConfigured: false },
      { publicConfigDigest: `sha256:${"0".repeat(64)}` },
      { operatorName: "should-not-be-returned" },
      { supportEmail: "should-not-be-returned@example.com" },
      { betaSignupEnabled: false },
      { databaseContractExpected: "stale" },
      { databaseContractDetected: "stale" },
      { serviceRoleContractCurrent: false },
      { serviceRoleContractCurrent: "true" },
      { unexpectedHealthField: true },
      { policyPublication: { ...validPayload().policyPublication, bundleDigest: `sha256:${"0".repeat(64)}` } },
      { policyPublication: { ...validPayload().policyPublication, databaseDetected: { ...validPayload().policyPublication.databaseDetected, termsVersion: "stale" } } },
      { policyPublication: { ...validPayload().policyPublication, databaseMatches: false } },
    ]) {
      await expect(readRuntimeContract(
        "https://preview.vercel.app",
        PROJECT_REF,
        async () => jsonResponse(validPayload(overrides)),
      )).rejects.toThrow();
    }
  });

  it("returns only the non-secret runtime contract summary", () => {
    expect(validateRuntimeHealthPayload(
      validPayload(),
      PROJECT_REF,
      EXPECTED_PUBLIC_CONFIG_DIGEST,
    )).toEqual({
      service: "ilgamcheck",
      version: "0.1.0",
      runtimeContract: RUNTIME_CONTRACT_EXPECTED,
      supabaseProjectRefConfigured: PROJECT_REF,
      publicConfigDigest: EXPECTED_PUBLIC_CONFIG_DIGEST,
      serviceRoleContractCurrent: true,
      policyPublication: {
        finalized: POLICY_PUBLICATION_EXPECTED.finalized,
        bundleDigest: POLICY_PUBLICATION_EXPECTED.bundleDigest,
        termsVersion: POLICY_PUBLICATION_EXPECTED.termsVersion,
        privacyVersion: POLICY_PUBLICATION_EXPECTED.privacyVersion,
      },
    });
  });

  it("can require finalized public policies for the external-beta boundary", async () => {
    expect(POLICY_PUBLICATION_EXPECTED.finalized).toBe(false);
    await expect(readRuntimeContract(
      "https://preview.vercel.app",
      PROJECT_REF,
      async () => jsonResponse(),
      { requirePolicyFinalized: true },
    )).rejects.toThrow(/finalized=true/);
  });

  it("rejects a healthy deployment bound to a different Supabase project", async () => {
    await expect(readRuntimeContract(
      "https://preview.vercel.app",
      PROJECT_REF,
      async () => jsonResponse(validPayload({ supabaseProjectRefConfigured: WRONG_PROJECT_REF })),
    )).rejects.toThrow(/project ref.*일치하지 않습니다/);
  });
});
