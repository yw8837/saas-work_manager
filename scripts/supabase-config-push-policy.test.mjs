import { describe, expect, it } from "vitest";
import {
  configPushInvocation,
  normalizeAuthSiteUrl,
  renderHostedSupabaseConfig,
} from "./supabase-config-push-policy.mjs";

const closedBetaConfig = `project_id = "ilgamcheck"
[auth]
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = [
  "http://127.0.0.1:3000/auth/reset",
  "http://localhost:3000/auth/reset"
]
enable_signup = false
[auth.email]
enable_signup = true
`;

describe("Supabase remote Auth config push", () => {
  it("accepts only an HTTPS deployment origin", () => {
    expect(normalizeAuthSiteUrl("https://preview.example.com/")).toBe("https://preview.example.com");
    expect(() => normalizeAuthSiteUrl("http://preview.example.com")).toThrow(/HTTPS/);
    expect(() => normalizeAuthSiteUrl("https://preview.example.com/path")).toThrow(/origin/);
    expect(() => normalizeAuthSiteUrl("https://preview.example.com:8443")).toThrow(/포트/);
  });

  it("renders closed beta URLs without changing the checked-in local config", () => {
    const rendered = renderHostedSupabaseConfig(closedBetaConfig, "https://preview.example.com");
    expect(rendered).toContain('site_url = "https://preview.example.com"');
    expect(rendered).toContain('"https://preview.example.com/auth/reset"');
    expect(rendered).not.toContain("http://127.0.0.1:3000/auth/reset");
    expect(() => renderHostedSupabaseConfig(closedBetaConfig.replace("enable_signup = false", "enable_signup = true"), "https://preview.example.com"))
      .toThrow(/\[auth\] enable_signup=false/);
    expect(() => renderHostedSupabaseConfig(closedBetaConfig.replace("[auth.email]\nenable_signup = true", "[auth.email]\nenable_signup = false"), "https://preview.example.com"))
      .toThrow(/\[auth\.email\] enable_signup=true/);
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
