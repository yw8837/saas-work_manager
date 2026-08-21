import { describe, expect, it, vi } from "vitest";

import { loadSupabaseAuthReadbackEnvironment } from "./supabase-auth-readback.mjs";

describe("standalone Supabase Auth readback environment", () => {
  it("captures the pre-load shell PAT and deletes it before any later child can inherit it", () => {
    const env = {
      SUPABASE_ACCESS_TOKEN: "shell-only-pat",
    };
    const loadEnv = vi.fn(() => {
      env.SUPABASE_ACCESS_TOKEN = "pat-from-env-local-must-not-win";
      env.SUPABASE_AUTH_SITE_URL = "https://preview.example.com";
    });

    expect(loadSupabaseAuthReadbackEnvironment({ root: "C:\\project", env, loadEnv })).toEqual({
      shellAccessToken: "shell-only-pat",
      expectedOrigin: "https://preview.example.com",
    });
    expect(loadEnv).toHaveBeenCalledWith("C:\\project");
    expect(env).not.toHaveProperty("SUPABASE_ACCESS_TOKEN");
  });

  it("never promotes a PAT found only in an env file to Management API authority", () => {
    const env = {};
    const loadEnv = () => {
      env.SUPABASE_ACCESS_TOKEN = "env-file-pat";
      env.SUPABASE_AUTH_SITE_URL = "https://preview.example.com";
    };

    expect(loadSupabaseAuthReadbackEnvironment({ env, loadEnv })).toEqual({
      shellAccessToken: undefined,
      expectedOrigin: "https://preview.example.com",
    });
    expect(env).not.toHaveProperty("SUPABASE_ACCESS_TOKEN");
  });
});
