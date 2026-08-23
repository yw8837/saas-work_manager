import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("mobile document metadata", () => {
  it("enables install and safe-area behavior in the Vite/Sites entry document", () => {
    const document = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

    expect(document).toContain('viewport-fit=cover');
    expect(document).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(document).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"');
    expect(document).toContain('name="apple-mobile-web-app-capable" content="yes"');
  });
});
