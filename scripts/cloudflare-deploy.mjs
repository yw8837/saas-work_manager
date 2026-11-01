import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import { collectDeployEnvIssues } from "./deploy-env-policy.mjs";
import { computeReleaseFingerprint } from "./release-fingerprint.mjs";

const { loadEnvConfig } = nextEnv;
const WORKERS = { preview: "ilgamcheck-preview", production: "ilgamcheck" };
const PUBLIC_KEYS = [
  "NEXT_PUBLIC_STORAGE_MODE", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_OPERATOR_NAME", "NEXT_PUBLIC_SUPPORT_EMAIL", "NEXT_PUBLIC_BETA_SIGNUP_ENABLED",
  "NEXT_PUBLIC_SITE_ORIGIN", "NEXT_PUBLIC_FEEDBACK_FORM_URL", "NEXT_PUBLIC_BUSINESS_NAME",
  "NEXT_PUBLIC_BUSINESS_NUMBER", "NEXT_PUBLIC_MAIL_ORDER_NUMBER", "NEXT_PUBLIC_BUSINESS_ADDRESS",
  "NEXT_PUBLIC_BUSINESS_PHONE", "NEXT_PUBLIC_FEEDBACK_ENTRY_TYPE",
  "NEXT_PUBLIC_FEEDBACK_ENTRY_SCREEN", "NEXT_PUBLIC_FEEDBACK_ENTRY_USAGE",
  "NEXT_PUBLIC_FEEDBACK_ENTRY_SCALE", "NEXT_PUBLIC_FEEDBACK_ENTRY_PRICE",
  "NEXT_PUBLIC_FEEDBACK_ENTRY_FOUNDER",
];

export function parseCloudflareDeployArgs(argv) {
  let target = "preview";
  let apply = false;
  let dryRun = false;
  let bootstrap = false;
  let targetSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--target" && !targetSeen && ["preview", "production"].includes(argv[index + 1])) {
      target = argv[++index];
      targetSeen = true;
    } else if (argv[index] === "--apply" && !apply && !dryRun) {
      apply = true;
    } else if (argv[index] === "--dry-run" && !apply && !dryRun) {
      // 읽기 전용이 기본값이다. 명시적인 --dry-run도 허용한다.
      dryRun = true;
    } else if (argv[index] === "--bootstrap" && !bootstrap) {
      bootstrap = true;
    } else {
      throw new Error("사용법: cloudflare-deploy.mjs [--target preview|production] [--dry-run|--apply]");
    }
  }
  if (bootstrap && !apply) {
    throw new Error("--bootstrap은 --apply와 함께만 허용합니다.");
  }
  return { target, apply, bootstrap, worker: WORKERS[target] };
}

export function cloudflareBuildEnvIssues(env, target, { bootstrap = false } = {}) {
  const checkedEnv = target === "preview" || bootstrap
    ? { ...env, NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "true" }
    : env;
  const issues = collectDeployEnvIssues(checkedEnv, { requireServiceRole: false });
  if (target === "preview" && !["true", "false"].includes(env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED)) {
    issues.push("preview 가입 플래그는 true 또는 false여야 합니다.");
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    issues.push("서버 비밀키를 빌드 환경에 두지 마세요. Cloudflare Worker secret으로만 등록하세요.");
  }
  const rawOrigin = env.NEXT_PUBLIC_SITE_ORIGIN?.trim();
  if (!rawOrigin) {
    issues.push("NEXT_PUBLIC_SITE_ORIGIN이 없습니다.");
  } else {
    try {
      const origin = new URL(rawOrigin);
      if (origin.protocol !== "https:" || origin.origin !== rawOrigin || origin.pathname !== "/"
        || origin.username || origin.password || origin.port || origin.search || origin.hash) {
        issues.push("NEXT_PUBLIC_SITE_ORIGIN은 경로·포트 없는 HTTPS origin이어야 합니다.");
      } else if (target === "preview" && (!origin.hostname.endsWith(".workers.dev")
        || origin.hostname === "ilgam.studioyeolmae.com")) {
        issues.push("preview는 별도 workers.dev 주소를 사용해야 합니다.");
      } else if (target === "production" && origin.hostname !== "ilgam.studioyeolmae.com") {
        issues.push("production origin은 ilgam.studioyeolmae.com이어야 합니다.");
      }
    } catch {
      issues.push("NEXT_PUBLIC_SITE_ORIGIN이 유효한 URL이 아닙니다.");
    }
  }
  return issues;
}

export function cloudflareDeployArgs({ target, apply }, env) {
  const args = ["deploy", "--name", WORKERS[target], "--keep-vars"];
  for (const key of PUBLIC_KEYS) {
    if (env[key]?.trim()) args.push("--var", `${key}:${env[key].trim()}`);
  }
  if (!apply) args.push("--dry-run");
  return args;
}

function cli(root, relative) {
  const path = resolve(root, relative);
  if (!existsSync(path)) throw new Error("node_modules가 없습니다. 먼저 npm ci를 실행하세요.");
  return path;
}

function run(executable, args, { root, env, capture = false } = {}) {
  const result = spawnSync(executable, args, {
    cwd: root, env, encoding: "utf8", windowsHide: true, shell: false,
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error || result.status !== 0) {
    throw new Error(`검사 또는 명령 실행 실패 (exit ${result.status ?? "unknown"}).`);
  }
  return result.stdout ?? "";
}

function assertProductionSource(root, env) {
  const branch = run("git", ["branch", "--show-current"], { root, env, capture: true }).trim();
  const head = run("git", ["rev-parse", "HEAD"], { root, env, capture: true }).trim();
  const main = run("git", ["rev-parse", "origin/main"], { root, env, capture: true }).trim();
  const changes = run("git", ["status", "--porcelain"], { root, env, capture: true }).trim();
  if (branch !== "main" || head !== main || changes) {
    throw new Error("운영 배포는 변경 없는 main == origin/main에서만 가능합니다.");
  }
}

function assertWorkerSecret(root, env, worker) {
  const wrangler = cli(root, "node_modules/wrangler/bin/wrangler.js");
  let raw;
  try {
    raw = run(process.execPath, [wrangler, "secret", "list", "--name", worker, "--format", "json"],
      { root, env, capture: true });
  } catch {
    throw new Error(`${worker} secret 목록을 읽지 못했습니다. 새 Preview라면 먼저 cloudflare:preview:bootstrap으로 Worker를 만들고 secret을 등록하세요.`);
  }
  let secrets;
  try { secrets = JSON.parse(raw); } catch { throw new Error("Cloudflare secret 목록 응답을 확인할 수 없습니다."); }
  if (!Array.isArray(secrets) || !secrets.some((item) => item.name === "SUPABASE_SERVICE_ROLE_KEY")) {
    throw new Error(`${worker}에 SUPABASE_SERVICE_ROLE_KEY Worker secret이 없습니다.`);
  }
}

export function runCloudflareDeploy({ root = process.cwd(), argv = process.argv.slice(2), env = process.env } = {}) {
  const options = parseCloudflareDeployArgs(argv);
  const issues = cloudflareBuildEnvIssues(env, options.target, { bootstrap: options.bootstrap });
  if (issues.length) throw new Error(`공개 빌드 환경 미준비: ${issues.join(" / ")}`);
  if (options.apply && options.target === "production") {
    if (env.ILGAMCHECK_CLOUDFLARE_DEPLOY_ACK !== "DEPLOY_ilgamcheck_FROM_main") {
      throw new Error("운영 배포에는 ILGAMCHECK_CLOUDFLARE_DEPLOY_ACK=DEPLOY_ilgamcheck_FROM_main이 필요합니다.");
    }
    assertProductionSource(root, env);
  }
  if (options.bootstrap && env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED !== "false") {
    throw new Error("최초 Worker 생성은 신규 가입을 끈 상태에서만 허용합니다.");
  }
  if (options.apply && !options.bootstrap) assertWorkerSecret(root, env, options.worker);

  const openNext = cli(root, "node_modules/@opennextjs/cloudflare/dist/cli/index.js");
  const wrangler = cli(root, "node_modules/wrangler/bin/wrangler.js");
  const fingerprint = computeReleaseFingerprint(root);
  run(process.execPath, [openNext, "build"], { root, env });
  if (computeReleaseFingerprint(root) !== fingerprint) {
    throw new Error("빌드 중 배포 소스가 바뀌어 업로드를 중단합니다.");
  }
  run(process.execPath, [wrangler, ...cloudflareDeployArgs(options, env)], { root, env });
  if (computeReleaseFingerprint(root) !== fingerprint) {
    throw new Error("배포 중 소스가 바뀌었습니다. 결과물을 신뢰하지 말고 원격 Worker를 다시 확인하세요.");
  }
  return options;
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href;
if (isMain) {
  loadEnvConfig(process.cwd());
  try {
    const result = runCloudflareDeploy();
    console.log(`[cloudflare-deploy] PASS ${result.worker} ${result.apply ? "배포" : "빌드·배포 사전 검사"}`);
  } catch (error) {
    console.error(`[cloudflare-deploy] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
