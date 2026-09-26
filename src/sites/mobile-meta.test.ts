import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderDeploymentHtml } from "@/lib/deployment-origin";

describe("mobile document metadata", () => {
  it("enables install and safe-area behavior in the Vite/Sites entry document", () => {
    const document = renderDeploymentHtml(readFileSync(resolve(process.cwd(), "index.html"), "utf8"));

    expect(document).toContain('viewport-fit=cover');
    expect(document).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(document).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"');
    expect(document).toContain('name="apple-mobile-web-app-capable" content="yes"');
  });

  it("ships complete social sharing metadata", () => {
    const document = renderDeploymentHtml(readFileSync(resolve(process.cwd(), "index.html"), "utf8"));

    expect(document).toContain('property="og:type" content="website"');
    expect(document).toContain('property="og:title" content="일감체크 · 운영은 덜고 작업에 집중하세요"');
    expect(document).toContain('property="og:image" content="https://ilgamcheck-beta.bsfire1237.chatgpt.site/og/ilgamcheck-social.png"');
    expect(document).toContain('name="twitter:card" content="summary_large_image"');
  });
});
