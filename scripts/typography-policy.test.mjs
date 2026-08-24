import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("marketing typography policy", () => {
  it("uses one self-hosted Korean display face only on marketing headings", () => {
    const styles = readFileSync(resolve(root, "src/styles/theme.css"), "utf8");

    expect(styles).toContain("font-family: \"Paperlogy Display\"");
    expect(styles).toContain("url(\"/fonts/paperlogy/Paperlogy-5Medium.woff2\")");
    expect(styles).toContain("font-display: swap");
    expect(styles).toMatch(/--font-display:\s*"Paperlogy Display"/);
    expect(styles).toMatch(/\.heroCopy h1[^}]*font-family:\s*var\(--font-display\)/s);
    expect(styles).toMatch(/\.workflowIntro h2[^}]*font-family:\s*var\(--font-display\)/s);
    expect(styles).not.toMatch(/body\s*{[^}]*font-family:\s*var\(--font-display\)/s);
  });

  it("keeps the mobile hero restrained instead of using oversized AI-style type", () => {
    const styles = readFileSync(resolve(root, "src/styles/theme.css"), "utf8");
    const mobileHero = styles.match(
      /@media \(max-width: 760px\)\s*{[\s\S]*?\.marketingHeader\s*{[^}]*}[\s\S]*?\.heroCopy h1\s*{([^}]*)}/,
    )?.[1] ?? "";

    expect(mobileHero).toContain("font-size: clamp(38px, 10.8vw, 46px)");
    expect(mobileHero).toContain("line-height: 1.14");
  });
});
