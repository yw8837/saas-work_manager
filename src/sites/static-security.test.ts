import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("static Sites shell security", () => {
  it("ships a restrictive fallback CSP for the landing document", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain('rel="icon" href="/icons/app-icon.svg"');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("https://ilgamcheck-beta.bsfire1237.chatgpt.site");
    expect(html).toContain("https://*.supabase.co wss://*.supabase.co");
    expect(html).toContain('window.location.replace("about:blank")');
    expect(html).not.toContain("unsafe-eval");
  });
});
