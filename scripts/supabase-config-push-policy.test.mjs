import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  configPushInvocation,
  googleAuthConfigChildEnvironment,
  normalizeAuthSiteUrl,
  renderHostedSupabaseConfig,
} from "./supabase-config-push-policy.mjs";

const publicSignupConfig = `project_id = "ilgamcheck"
[auth]
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = [
  "http://127.0.0.1:3000/today",
  "http://localhost:3000/today"
]
enable_signup = true
[auth.email]
enable_signup = false
[auth.external.google]
enabled = true
`;

describe("Supabase remote Auth config push", () => {
  it.each(["https://*.example.com", "https://**.example.com", "https://%2A.example.com", "https://[ab].example.com", "https://a{b}.example.com"])("rejects wildcard hosts for both current and legacy origins: %s", (origin) => {
    expect(() => normalizeAuthSiteUrl(origin)).toThrow();
    expect(() => renderHostedSupabaseConfig(publicSignupConfig, "https://safe.example.com", origin)).toThrow();
  });

  it("retains the explicitly supplied legacy callbacks during a domain transition", () => {
    const rendered = renderHostedSupabaseConfig(publicSignupConfig, "https://ilgam.studioyeolmae.com", "https://ilgamcheck-beta.bsfire1237.chatgpt.site");
    expect(rendered).toContain('site_url = "https://ilgam.studioyeolmae.com"');
    expect(rendered).toContain('"https://ilgam.studioyeolmae.com/today"');
    expect(rendered).toContain('"https://ilgam.studioyeolmae.com/settings"');
    expect(rendered).toContain('"https://ilgamcheck-beta.bsfire1237.chatgpt.site/today"');
    expect(rendered).toContain('"https://ilgamcheck-beta.bsfire1237.chatgpt.site/settings"');
    expect(() => renderHostedSupabaseConfig(publicSignupConfig, "https://ilgam.studioyeolmae.com", "https://old.example.com/*")).toThrow();
  });

  it("passes only the two Google OAuth credentials needed by config push", () => {
    const child = googleAuthConfigChildEnvironment({
      PATH: "C:\\bin",
      SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "google-client-id",
      SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: "google-client-secret",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-leak",
      UNRELATED_SECRET: "must-not-leak",
    });

    expect(child).toMatchObject({
      PATH: "C:\\bin",
      SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "google-client-id",
      SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: "google-client-secret",
    });
    expect(child).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    expect(child).not.toHaveProperty("UNRELATED_SECRET");
  });

  it("keeps the checked-in config deployable for Google-only signup", () => {
    const checkedInConfig = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
    expect(checkedInConfig).toContain('"com.yeolmaestudio.ilgamcheck://auth/callback"');
    const rendered = renderHostedSupabaseConfig(checkedInConfig, "https://preview.example.com");
    expect(rendered).toContain('"com.yeolmaestudio.ilgamcheck://auth/callback"');
    expect(rendered).toContain('"https://preview.example.com/settings"');
  });

  it("accepts only an HTTPS deployment origin", () => {
    expect(normalizeAuthSiteUrl("https://preview.example.com/")).toBe("https://preview.example.com");
    expect(() => normalizeAuthSiteUrl("http://preview.example.com")).toThrow(/HTTPS/);
    expect(() => normalizeAuthSiteUrl("https://preview.example.com/path")).toThrow(/origin/);
    expect(() => normalizeAuthSiteUrl("https://preview.example.com:8443")).toThrow(/포트/);
  });

  it("renders public signup URLs without changing the checked-in local config", () => {
    const rendered = renderHostedSupabaseConfig(publicSignupConfig, "https://preview.example.com");
    expect(rendered).toContain('site_url = "https://preview.example.com"');
    expect(rendered).toContain('"https://preview.example.com/today"');
    expect(rendered).toContain('"https://preview.example.com/settings"');
    expect(rendered).not.toContain("http://127.0.0.1:3000/today");
    expect(() => renderHostedSupabaseConfig(publicSignupConfig.replace("enable_signup = true", "enable_signup = false"), "https://preview.example.com"))
      .toThrow(/\[auth\] enable_signup=true/);
    expect(() => renderHostedSupabaseConfig(publicSignupConfig.replace("[auth.external.google]\nenabled = true", "[auth.external.google]\nenabled = false"), "https://preview.example.com"))
      .toThrow(/Google/);
  });

  it("uses the pinned CLI with an isolated workdir and explicit project ref", () => {
    expect(configPushInvocation("abcdefghijklmnopqrst", "C:\\temp\\auth-config", "win32", {
      nodeExecutable: "C:\\node\\node.exe",
      npxCliPath: "C:\\node\\npm\\npx-cli.js",
    })).toEqual({
      executable: "C:\\node\\node.exe",
      args: [
        "C:\\node\\npm\\npx-cli.js", "-y", "supabase@2.114.0",
        "--workdir", "C:\\temp\\auth-config",
        "--yes",
        "config", "push",
        "--project-ref", "abcdefghijklmnopqrst",
      ],
    });
  });
});
