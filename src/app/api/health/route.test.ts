import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";
import { POLICY_PUBLICATION_MANIFEST } from "@/lib/policies";
import { runtimePublicConfigDigest } from "@/lib/runtime-public-config";
import {
  ILGAMCHECK_POLICY_PUBLICATION_CONTRACT,
  ILGAMCHECK_RUNTIME_CONTRACT,
} from "@/lib/supabase";

const ORIGINAL_ENV = { ...process.env };
const projectRef = "abcdefghijklmnopqrst";

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stubHostedContractProbes({
  runtimeContract = ILGAMCHECK_RUNTIME_CONTRACT,
  policyContract = ILGAMCHECK_POLICY_PUBLICATION_CONTRACT,
  serviceRoleStatus = 200,
  serviceRoleBody = ILGAMCHECK_RUNTIME_CONTRACT,
}: {
  runtimeContract?: string;
  policyContract?: typeof ILGAMCHECK_POLICY_PUBLICATION_CONTRACT;
  serviceRoleStatus?: number;
  serviceRoleBody?: string;
} = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("service_role_contract")
      ? serviceRoleBody
      : url.includes("policy_publication")
        ? policyContract
        : runtimeContract;
    const response = new Response(JSON.stringify(body), {
      status: url.includes("service_role_contract") ? serviceRoleStatus : 200,
      headers: { "Content-Type": "application/json" },
    });
    Object.defineProperty(response, "url", { configurable: true, value: url });
    return response;
  }));
}

describe("GET /api/health", () => {
  it("reports a ready local runtime", async () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "local";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      ready: true,
      runtimeRequested: "local",
      runtimeEffective: "local",
      hostedConfigured: false,
      supabaseProjectRefConfigured: null,
    });
  });

  it("fails closed when hosted mode is requested without configuration", async () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "misconfigured",
      ready: false,
      runtimeRequested: "hosted",
      runtimeEffective: "local",
      hostedConfigured: false,
      supabaseProjectRefConfigured: null,
    });
  });

  it("reports a configured hosted runtime", async () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${projectRef}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_example";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_example";
    process.env.NEXT_PUBLIC_OPERATOR_NAME = "일감체크 운영자";
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "support@example.com";
    process.env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED = "true";
    stubHostedContractProbes();

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      ready: true,
      runtimeRequested: "hosted",
      runtimeEffective: "hosted",
      hostedConfigured: true,
      supabaseProjectRefConfigured: projectRef,
      hostedAdapterReady: true,
      publicConfigDigest: runtimePublicConfigDigest({
        operatorName: "일감체크 운영자",
        supportEmail: "support@example.com",
        betaSignupEnabled: true,
      }),
      publicIdentityConfigured: true,
      signupPolicyConfigured: true,
      databaseContractDetected: ILGAMCHECK_RUNTIME_CONTRACT,
      serviceRoleContractCurrent: true,
      policyPublication: {
        finalized: false,
        bundleDigest: POLICY_PUBLICATION_MANIFEST.bundleDigest,
        termsVersion: POLICY_PUBLICATION_MANIFEST.documents.terms.version,
        privacyVersion: POLICY_PUBLICATION_MANIFEST.documents.privacy.version,
        databaseExpected: ILGAMCHECK_POLICY_PUBLICATION_CONTRACT,
        databaseDetected: ILGAMCHECK_POLICY_PUBLICATION_CONTRACT,
        databaseMatches: true,
      },
    });
  });

  it("fails closed when the configured database is missing the expected contract", async () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${projectRef}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_example";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_example";
    process.env.NEXT_PUBLIC_OPERATOR_NAME = "일감체크 운영자";
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "support@example.com";
    process.env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED = "true";
    stubHostedContractProbes({ runtimeContract: "older" });

    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "misconfigured",
      ready: false,
      databaseContractExpected: ILGAMCHECK_RUNTIME_CONTRACT,
      databaseContractDetected: "older",
    });
  });

  it("fails closed when a hosted deployment disables ordinary signup", async () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${projectRef}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_example";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_example";
    process.env.NEXT_PUBLIC_OPERATOR_NAME = "일감체크 운영자";
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "support@example.com";
    process.env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED = "false";
    stubHostedContractProbes();

    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "misconfigured",
      ready: false,
      publicIdentityConfigured: true,
      signupPolicyConfigured: false,
    });
  });

  it("fails closed when the database policy publication differs from the deployed manifest", async () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${projectRef}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_example";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_example";
    process.env.NEXT_PUBLIC_OPERATOR_NAME = "일감체크 운영자";
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "support@example.com";
    process.env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED = "true";
    stubHostedContractProbes({
      policyContract: { ...ILGAMCHECK_POLICY_PUBLICATION_CONTRACT, privacyVersion: "stale" },
    });

    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "misconfigured",
      ready: false,
      policyPublication: {
        databaseMatches: false,
        databaseDetected: { privacyVersion: "stale" },
      },
    });
  });

  it("fails closed without a deployed service-role key and exposes only a boolean", async () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${projectRef}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_example";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_OPERATOR_NAME = "일감체크 운영자";
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "support@example.com";
    process.env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED = "true";
    stubHostedContractProbes();

    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "misconfigured",
      ready: false,
      serviceRoleContractCurrent: false,
    });
  });

  it("fails closed when the current server key is rejected without echoing key, body, or error", async () => {
    const sentinel = "sb_secret_wrong_project_sentinel";
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${projectRef}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_example";
    process.env.SUPABASE_SERVICE_ROLE_KEY = sentinel;
    process.env.NEXT_PUBLIC_OPERATOR_NAME = "일감체크 운영자";
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "support@example.com";
    process.env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED = "true";
    stubHostedContractProbes({
      serviceRoleStatus: 401,
      serviceRoleBody: `${sentinel} private upstream error`,
    });

    const response = await GET();
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toMatchObject({
      status: "misconfigured",
      ready: false,
      serviceRoleContractCurrent: false,
    });
    expect(body).not.toContain(sentinel);
    expect(body).not.toContain("private upstream error");
  });

  it("fails closed when the deployed service-role RPC times out", async () => {
    vi.useFakeTimers();
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${projectRef}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_example";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_timeout_test";
    process.env.NEXT_PUBLIC_OPERATOR_NAME = "일감체크 운영자";
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "support@example.com";
    process.env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED = "true";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("service_role_contract")) return new Promise<Response>(() => undefined);
      const body = url.includes("policy_publication")
        ? ILGAMCHECK_POLICY_PUBLICATION_CONTRACT
        : ILGAMCHECK_RUNTIME_CONTRACT;
      const response = new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      Object.defineProperty(response, "url", { configurable: true, value: url });
      return response;
    }));

    const pending = GET();
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await pending;
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ready: false,
      serviceRoleContractCurrent: false,
    });
  });

  it("never returns operator or support identity values from health", async () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "local";
    process.env.NEXT_PUBLIC_OPERATOR_NAME = "노출되면 안 되는 운영자";
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "private-looking@example.com";
    process.env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED = "true";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-service-role-sentinel";

    const response = await GET();
    const body = await response.text();
    expect(body).not.toContain("노출되면 안 되는 운영자");
    expect(body).not.toContain("private-looking@example.com");
    expect(body).not.toContain("server-only-service-role-sentinel");
    expect(body).not.toContain("operatorName");
    expect(body).not.toContain("supportEmail");
    expect(body).not.toContain("betaSignupEnabled");
  });
});
