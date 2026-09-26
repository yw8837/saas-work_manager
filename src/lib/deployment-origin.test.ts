import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deploymentOrigin, renderDeploymentHtml } from "./deployment-origin";

describe("deployment document origin", () => {
  it("retains the existing production origin when configuration is absent", () => {
    expect(deploymentOrigin(undefined)).toBe("https://ilgamcheck-beta.bsfire1237.chatgpt.site");
  });

  it("renders social metadata and mobile CSP for the configured deployment", () => {
    const template = readFileSync("index.html", "utf8");
    const html = renderDeploymentHtml(template, "https://ilgam.studioyeolmae.com/");
    expect(html).toContain('property="og:url" content="https://ilgam.studioyeolmae.com/"');
    expect(html).toContain('property="og:image" content="https://ilgam.studioyeolmae.com/og/ilgamcheck-social.png"');
    expect(html).toContain('name="twitter:image" content="https://ilgam.studioyeolmae.com/og/ilgamcheck-social.png"');
    expect(html).toContain("connect-src 'self' https://ilgam.studioyeolmae.com https://*.supabase.co");
    expect(html).not.toContain("__ILGAMCHECK_SITE_ORIGIN__");
    expect(html).not.toContain("ilgamcheck-beta.bsfire1237.chatgpt.site");
  });
});
