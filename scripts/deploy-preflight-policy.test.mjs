import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectRepositoryPreflightIssues } from "./deploy-preflight-policy.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeRepository(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "ilgamcheck-preflight-"));
  roots.push(root);
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  mkdirSync(join(root, "src", "lib"), { recursive: true });
  for (const directory of [
    join(root, "src", "app", "privacy"),
    join(root, "src", "app", "terms"),
    join(root, "src", "app", "api", "account", "delete"),
  ]) mkdirSync(directory, { recursive: true });
  writeFileSync(join(root, "src", "app", "privacy", "page.tsx"), "export default function Page() {}\n");
  writeFileSync(join(root, "src", "app", "terms", "page.tsx"), "export default function Page() {}\n");
  writeFileSync(join(root, "src", "app", "api", "account", "delete", "route.ts"), "export function POST() {}\n");
  writeFileSync(
    join(root, "src", "lib", "policy-publication-manifest.json"),
    overrides.policyManifest ?? readFileSync(join(process.cwd(), "src", "lib", "policy-publication-manifest.json"), "utf8"),
  );
  writeFileSync(join(root, "package-lock.json"), "{}\n");
  writeFileSync(join(root, ".vercelignore"), ".env*\n.vercel\nsupabase/.branches\nsupabase/.temp\n");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ scripts: { "check:deploy": "node scripts/deploy-preflight.mjs && npm run build" } }),
  );
  writeFileSync(
    join(root, "vercel.json"),
    JSON.stringify({ framework: "nextjs", regions: ["icn1"], installCommand: "npm ci", buildCommand: "npm run check:deploy", ...overrides.vercel }),
  );
  writeFileSync(
    join(root, "supabase", "config.toml"),
    overrides.supabase ?? 'project_id = "ilgamcheck"\n[db.migrations]\nenabled = true\n',
  );
  for (const name of [
    "202608140001_initial.sql",
    "202608150002_workspace_documents.sql",
    "202608160003_runtime_contract.sql",
    "202608160004_workspace_save_receipt_retention.sql",
    "202608160005_policy_acceptances.sql",
    "202608170006_policy_publication_contract.sql",
    "202608200007_plan_entitlements.sql",
    "202608230008_basic_plan.sql",
  ]) {
    writeFileSync(join(root, "supabase", "migrations", name), "select 1;\n");
  }
  return root;
}

describe("collectRepositoryPreflightIssues", () => {
  it("accepts the deploy contract", () => {
    expect(collectRepositoryPreflightIssues(makeRepository())).toEqual([]);
  });

  it("fails when Vercel bypasses preflight or migrations are disabled", () => {
    const root = makeRepository({
      vercel: { buildCommand: "next build" },
      supabase: 'project_id = "ilgamcheck"\n[db.migrations]\nenabled = false\n[realtime]\nenabled = true\n',
    });
    const issues = collectRepositoryPreflightIssues(root);
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining("buildCommand"),
      expect.stringContaining("migrations"),
    ]));
  });

  it("fails when the server function region is not Seoul", () => {
    expect(collectRepositoryPreflightIssues(makeRepository({ vercel: { regions: ["iad1"] } })))
      .toEqual(expect.arrayContaining([expect.stringContaining("icn1")]));
  });

  it("fails when a required public beta surface is missing", () => {
    const root = makeRepository();
    rmSync(join(root, "src", "app", "privacy", "page.tsx"));
    expect(collectRepositoryPreflightIssues(root))
      .toEqual(expect.arrayContaining([expect.stringContaining("src/app/privacy/page.tsx")]));
  });

  it("fails when the public policy manifest content drifts without new digests", () => {
    const manifest = JSON.parse(readFileSync(
      join(process.cwd(), "src", "lib", "policy-publication-manifest.json"),
      "utf8",
    ));
    manifest.documents.terms.lead += " changed";
    expect(collectRepositoryPreflightIssues(makeRepository({ policyManifest: JSON.stringify(manifest) })))
      .toEqual(expect.arrayContaining([expect.stringContaining("공개 정책 manifest 오류")]));
  });

  it("fails when Vercel could upload linked project state or deploy receipts", () => {
    const root = makeRepository();
    writeFileSync(join(root, ".vercelignore"), ".env*\n.vercel\n");
    expect(collectRepositoryPreflightIssues(root)).toEqual(expect.arrayContaining([
      expect.stringContaining("supabase/.branches"),
      expect.stringContaining("supabase/.temp"),
    ]));
  });
});
