import { describe, expect, it, vi } from "vitest";
import { loadRuntimeReadbackEnvironment } from "./runtime-contract-readback.mjs";

describe("standalone runtime readback environment", () => {
  it("loads target and public config from .env before computing the expected digest", () => {
    const env = {};
    const loadEnv = vi.fn(() => Object.assign(env, {
      SUPABASE_AUTH_SITE_URL: "https://preview.example.com",
      NEXT_PUBLIC_OPERATOR_NAME: "일감체크 운영자",
      NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com",
      NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "true",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-affect-public-digest",
    }));

    expect(loadRuntimeReadbackEnvironment({ root: "C:\\workspace", env, loadEnv })).toEqual({
      target: "https://preview.example.com",
      expectedPublicConfigDigest: "sha256:4217bc661d627657555f10e9d97757663be5cc5f5edf641c6e52b62e0bc6ea1c",
    });
    expect(loadEnv).toHaveBeenCalledWith("C:\\workspace");
  });

  it("keeps an explicit CLI target while still loading the local expected config", () => {
    const env = {};
    const result = loadRuntimeReadbackEnvironment({
      env,
      argvTarget: "https://explicit.example.com",
      loadEnv: () => Object.assign(env, {
        SUPABASE_AUTH_SITE_URL: "https://env.example.com",
        NEXT_PUBLIC_OPERATOR_NAME: "일감체크 운영자",
        NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com",
        NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "true",
      }),
    });
    expect(result.target).toBe("https://explicit.example.com");
    expect(result.expectedPublicConfigDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
