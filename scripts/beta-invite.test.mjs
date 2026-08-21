import { describe, expect, it, vi } from "vitest";
import {
  BETA_INVITE_ACK,
  betaInviteEnvironment,
  normalizeHttpsOrigin,
  normalizeInviteEmail,
  parseBetaInviteArgs,
  readBetaInviteConfig,
  runBetaInvite,
  verifyBetaInviteTarget,
} from "./beta-invite.mjs";

const validEnv = {
  ILGAMCHECK_BETA_INVITE_ACK: BETA_INVITE_ACK,
  NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
  NEXT_PUBLIC_OPERATOR_NAME: "일감체크 테스트 운영자",
  NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com",
  NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "false",
  SUPABASE_AUTH_SITE_URL: "https://preview.example.com",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_server_only_test_value",
};

function memoryLogger() {
  const logs = [];
  return {
    logs,
    logger: {
      log: vi.fn((message) => logs.push(String(message))),
      error: vi.fn((message) => logs.push(String(message))),
    },
  };
}

function legacyJwt(role) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return `${header}.${payload}.test-signature`;
}

describe("closed beta invite CLI", () => {
  it("accepts one email argument and HTTPS origins only", () => {
    expect(parseBetaInviteArgs(["--email", "tester@example.com"])).toEqual({
      help: false,
      email: "tester@example.com",
    });
    expect(normalizeInviteEmail(" tester@example.com ")).toBe("tester@example.com");
    expect(normalizeHttpsOrigin("https://preview.example.com/", "TEST_URL"))
      .toBe("https://preview.example.com");
    expect(() => normalizeHttpsOrigin("http://preview.example.com", "TEST_URL")).toThrow(/HTTPS/);
    expect(() => normalizeHttpsOrigin("https://preview.example.com/path", "TEST_URL")).toThrow(/origin/);
    expect(() => normalizeHttpsOrigin("https://preview.example.com:8443", "TEST_URL")).toThrow(/포트/);
    expect(() => normalizeInviteEmail("not-an-email")).toThrow(/--email/);
    expect(() => parseBetaInviteArgs(["tester@example.com"])).toThrow(/--email/);
    expect(() => parseBetaInviteArgs(["--email", "a@example.com", "--email", "b@example.com"]))
      .toThrow(/한 명/);
  });

  it("fails closed without the exact acknowledgement and required server configuration", () => {
    expect(() => readBetaInviteConfig({ ...validEnv, ILGAMCHECK_BETA_INVITE_ACK: "" }))
      .toThrow(BETA_INVITE_ACK);
    expect(() => readBetaInviteConfig({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: "http://project-ref.supabase.co" }))
      .toThrow(/HTTPS/);
    expect(() => readBetaInviteConfig({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: "https://evil.example" }))
      .toThrow(/PROJECT_REF\.supabase\.co/);
    expect(() => readBetaInviteConfig({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co.evil.example" }))
      .toThrow(/PROJECT_REF\.supabase\.co/);
    expect(() => readBetaInviteConfig({ ...validEnv, SUPABASE_AUTH_SITE_URL: "https://preview.example.com/path" }))
      .toThrow(/origin/);
    expect(() => readBetaInviteConfig({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_browser_key" }))
      .toThrow(/service_role JWT|secret key/);
    expect(() => readBetaInviteConfig({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: legacyJwt("anon") }))
      .toThrow(/service_role JWT|secret key/);
    expect(() => readBetaInviteConfig({ ...validEnv, SUPABASE_SERVICE_ROLE_KEY: "not-a-server-key" }))
      .toThrow(/service_role JWT|secret key/);
    expect(() => readBetaInviteConfig({ ...validEnv, NEXT_PUBLIC_OPERATOR_NAME: "PUBLIC_LEGAL_OPERATOR_NAME" }))
      .toThrow(/실제 공개 운영자명/);
    expect(() => readBetaInviteConfig({ ...validEnv, NEXT_PUBLIC_SUPPORT_EMAIL: "support@YOUR_DOMAIN" }))
      .toThrow(/실제 공개 지원 이메일/);
    expect(() => readBetaInviteConfig({ ...validEnv, NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "true" }))
      .toThrow(/false/);
  });

  it("rejects a non-Supabase endpoint before an admin client can receive the secret", async () => {
    const createClientImpl = vi.fn();
    const { logger, logs } = memoryLogger();
    const exitCode = await runBetaInvite({
      argv: ["--email", "tester@example.com"],
      env: { ...validEnv, NEXT_PUBLIC_SUPABASE_URL: "https://evil.example" },
      createClientImpl,
      logger,
    });

    expect(exitCode).toBe(1);
    expect(createClientImpl).not.toHaveBeenCalled();
    expect(logs.join(" ")).not.toContain(validEnv.SUPABASE_SERVICE_ROLE_KEY);
    expect(logs.join(" ")).not.toContain("evil.example");
  });

  it("uses the server-only admin API and sends the invite to the exact reset route", async () => {
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: { id: "11111111-1111-1111-1111-111111111111" } },
      error: null,
    });
    const createClientImpl = vi.fn(() => ({ auth: { admin: { inviteUserByEmail } } }));
    const { logger, logs } = memoryLogger();

    const exitCode = await runBetaInvite({
      argv: ["--email", "tester@example.com"],
      env: validEnv,
      createClientImpl,
      verifyTargetImpl: vi.fn().mockResolvedValue(undefined),
      logger,
    });

    expect(exitCode).toBe(0);
    expect(createClientImpl).toHaveBeenCalledWith(
      "https://project-ref.supabase.co",
      validEnv.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
    expect(inviteUserByEmail).toHaveBeenCalledWith("tester@example.com", {
      redirectTo: "https://preview.example.com/auth/reset",
    });
    expect(logs.join(" ")).not.toContain("tester@example.com");
    expect(logs.join(" ")).not.toContain(validEnv.SUPABASE_SERVICE_ROLE_KEY);
    expect(logs.join(" ")).not.toContain("https://preview.example.com/auth/reset");
  });

  it("does not leak Supabase error details, emails, secrets, or links", async () => {
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: null },
      error: {
        message: `failed for tester@example.com ${validEnv.SUPABASE_SERVICE_ROLE_KEY} https://private.example/invite`,
      },
    });
    const createClientImpl = vi.fn(() => ({ auth: { admin: { inviteUserByEmail } } }));
    const { logger, logs } = memoryLogger();

    const exitCode = await runBetaInvite({
      argv: ["--email", "tester@example.com"],
      env: validEnv,
      createClientImpl,
      verifyTargetImpl: vi.fn().mockResolvedValue(undefined),
      logger,
    });

    const output = logs.join(" ");
    expect(exitCode).toBe(1);
    expect(output).toContain("Supabase 초대 요청이 실패");
    expect(output).not.toContain("tester@example.com");
    expect(output).not.toContain(validEnv.SUPABASE_SERVICE_ROLE_KEY);
    expect(output).not.toContain("https://private.example/invite");
  });

  it("accepts the destructive acknowledgement only from the invoking shell", () => {
    expect(betaInviteEnvironment(validEnv, undefined)).not.toHaveProperty("ILGAMCHECK_BETA_INVITE_ACK");
    expect(betaInviteEnvironment(validEnv, BETA_INVITE_ACK).ILGAMCHECK_BETA_INVITE_ACK)
      .toBe(BETA_INVITE_ACK);
  });

  it("verifies the linked Supabase and READY Vercel target before creating an admin client", async () => {
    const createClientImpl = vi.fn();
    const verifyTargetImpl = vi.fn().mockRejectedValue(new Error("wrong target"));
    const { logger } = memoryLogger();
    const exitCode = await runBetaInvite({
      argv: ["--email", "tester@example.com"],
      env: validEnv,
      createClientImpl,
      verifyTargetImpl,
      logger,
    });
    expect(exitCode).toBe(1);
    expect(verifyTargetImpl).toHaveBeenCalledOnce();
    expect(createClientImpl).not.toHaveBeenCalled();
  });

  it("binds the invite config to the exact linked Supabase ref and Vercel origin", async () => {
    const config = readBetaInviteConfig(validEnv);
    const verifySupabase = vi.fn(() => ({ projectRef: "project-ref", region: "ap-northeast-2" }));
    const verifyVercel = vi.fn();
    await expect(verifyBetaInviteTarget({
      config,
      env: validEnv,
      root: "C:\\safe\\app",
      verifySupabase,
      verifyVercel,
    })).resolves.toBeUndefined();
    expect(verifyVercel).toHaveBeenCalledWith(expect.objectContaining({
      authOrigin: "https://preview.example.com",
    }));

    await expect(verifyBetaInviteTarget({
      config,
      env: validEnv,
      verifySupabase: () => ({ projectRef: "other-project-ref", region: "ap-northeast-2" }),
      verifyVercel,
    })).rejects.toThrow("BETA_INVITE_TARGET_MISMATCH");
  });
});
