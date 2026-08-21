import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadPolicyPublicationManifest } from "./policy-publication-manifest-policy.mjs";

const REQUIRED_MIGRATIONS = [
  "202608140001_initial.sql",
  "202608150002_workspace_documents.sql",
  "202608160003_runtime_contract.sql",
  "202608160004_workspace_save_receipt_retention.sql",
  "202608160005_policy_acceptances.sql",
  "202608170006_policy_publication_contract.sql",
  "202608200007_plan_entitlements.sql",
];

const REQUIRED_PUBLIC_BETA_SURFACE = [
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/api/account/delete/route.ts",
];

const REQUIRED_VERCEL_IGNORE_RULES = [
  ".env*",
  ".vercel",
  "supabase/.branches",
  "supabase/.temp",
];

function tomlSection(text, sectionName) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `[${sectionName}]`);
  if (start < 0) return "";
  const next = lines.findIndex((line, index) => index > start && /^\s*\[.+\]\s*$/.test(line));
  return lines.slice(start + 1, next < 0 ? undefined : next).join("\n");
}

function readText(root, relativePath, issues) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) {
    issues.push(`${relativePath} 파일이 없습니다.`);
    return null;
  }
  return readFileSync(absolutePath, "utf8");
}

export function collectRepositoryPreflightIssues(root) {
  const issues = [];
  const packageText = readText(root, "package.json", issues);
  const vercelText = readText(root, "vercel.json", issues);
  const supabaseConfig = readText(root, join("supabase", "config.toml"), issues);
  const vercelIgnore = readText(root, ".vercelignore", issues);
  readText(root, "package-lock.json", issues);
  for (const relativePath of REQUIRED_PUBLIC_BETA_SURFACE) readText(root, relativePath, issues);
  try {
    loadPolicyPublicationManifest(root);
  } catch (error) {
    issues.push(`공개 정책 manifest 오류: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (packageText) {
    try {
      const pkg = JSON.parse(packageText);
      if (pkg.scripts?.["check:deploy"] !== "node scripts/deploy-preflight.mjs && npm run build") {
        issues.push("package.json의 check:deploy가 fail-closed preflight 뒤 build를 실행하지 않습니다.");
      }
    } catch {
      issues.push("package.json을 JSON으로 읽을 수 없습니다.");
    }
  }

  if (vercelText) {
    try {
      const config = JSON.parse(vercelText);
      if (config.framework !== "nextjs") issues.push("vercel.json framework는 nextjs여야 합니다.");
      if (!Array.isArray(config.regions) || config.regions.length !== 1 || config.regions[0] !== "icn1") {
        issues.push("vercel.json regions는 서울 icn1 한 곳으로 고정해야 합니다.");
      }
      if (config.installCommand !== "npm ci") issues.push("vercel.json installCommand는 npm ci여야 합니다.");
      if (config.buildCommand !== "npm run check:deploy") {
        issues.push("vercel.json buildCommand는 npm run check:deploy여야 합니다.");
      }
    } catch {
      issues.push("vercel.json을 JSON으로 읽을 수 없습니다.");
    }
  }

  if (supabaseConfig) {
    if (!/^project_id\s*=\s*"ilgamcheck"\s*$/m.test(supabaseConfig)) {
      issues.push("supabase/config.toml project_id가 ilgamcheck가 아닙니다.");
    }
    if (!/^\s*enabled\s*=\s*true\s*$/m.test(tomlSection(supabaseConfig, "db.migrations"))) {
      issues.push("supabase/config.toml에서 db migrations가 활성화되지 않았습니다.");
    }
  }

  if (vercelIgnore) {
    const rules = new Set(vercelIgnore.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    for (const required of REQUIRED_VERCEL_IGNORE_RULES) {
      if (!rules.has(required)) issues.push(`.vercelignore 필수 제외 규칙 누락: ${required}`);
    }
  }

  const migrationDir = join(root, "supabase", "migrations");
  if (!existsSync(migrationDir)) {
    issues.push("supabase/migrations 디렉터리가 없습니다.");
  } else {
    const migrations = readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
    for (const required of REQUIRED_MIGRATIONS) {
      if (!migrations.includes(required)) issues.push(`필수 migration 누락: ${required}`);
    }
    if (migrations.some((name) => !/^\d{12,14}_[a-z0-9_]+\.sql$/.test(name))) {
      issues.push("migration 파일명은 12~14자리 timestamp_name.sql 형식이어야 합니다.");
    }
  }

  return issues;
}
