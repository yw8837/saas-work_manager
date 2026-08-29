import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  configPushInvocation,
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
  it("keeps the checked-in config deployable for Google-only signup", () => {
    const checkedInConfig = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
    const rendered = renderHostedSupabaseConfig(checkedInConfig, "https://preview.example.com");
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
