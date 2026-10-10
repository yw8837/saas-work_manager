import { describe, expect, it, vi } from "vitest";

import { loadSupabaseAuthReadbackEnvironment } from "./supabase-auth-readback.mjs";
import { supabaseAuthReadbackIssue } from "./supabase-auth-readback-policy.mjs";

describe("standalone Supabase Auth readback environment", () => {
  it("binds the public runtime URL after loading without forwarding the PAT", () => {
    const env = {};
    expect(loadSupabaseAuthReadbackEnvironment({ env, loadEnv: () => { env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co"; } })).toHaveProperty("expectedSupabaseUrl", "https://abcdefghijklmnopqrst.supabase.co");
  });
  it("blocks a linked project different from the actual public runtime before any API read", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("API must not be reached"));
    const issue = await supabaseAuthReadbackIssue({
      projectRef: "bbbbbbbbbbbbbbbbbbbb", expectedSupabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      expectedOrigin: "https://ilgam.studioyeolmae.com", accessToken: "synthetic-pat", fetchImpl,
    });
    expect(issue).toMatch(/project ref|프로젝트.*다릅니다/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
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
