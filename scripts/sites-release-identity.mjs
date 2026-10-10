import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeFinalOrigin } from "./smtp-evidence-policy.mjs";
import { readOperationalEvidenceFile } from "./operational-evidence-policy.mjs";
import { readRuntimeContract, runtimePublicConfigDigestFromEnv } from "./runtime-contract-readback-policy.mjs";
import { collectDeployEnvIssues } from "./deploy-env-policy.mjs";

const IDENTITY_FIELDS = ["projectId", "versionId", "deploymentId", "sourceCommit", "archiveDigest", "envRevision", "origin", "versionNumber"];
const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const validOpaqueId = value => typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value && !/[\r\n\0]/.test(value);
function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) {
    throw new Error("Sites public receipt schema가 맞지 않습니다(비밀값·임의 필드 금지).");
  }
}

export function validateSitesReleaseReceipt(receipt, expected, archiveBytes, { nowMs = Date.now(), minimumCapturedAtMs = 0 } = {}) {
  const { site, version, deployment } = receipt ?? {};
  exactKeys(receipt, ["capturedAt", "site", "version", "deployment"]);
  exactKeys(site, ["id", "current_live_url", "status", "access_mode", "latest_version_number"]);
  exactKeys(version, ["id", "project_id", "version_number", "source", "archive_storage", "deployment_id"]);
  exactKeys(version.source, ["commit_sha"]);
  exactKeys(version.archive_storage, ["content_hash"]);
  exactKeys(deployment, ["id", "project_id", "version_id", "type", "status", "env_set_revision"]);
  const capturedAt = Date.parse(receipt?.capturedAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(minimumCapturedAtMs) || minimumCapturedAtMs < 0
    || !Number.isFinite(capturedAt) || capturedAt > nowMs || nowMs - capturedAt > 300_000 || capturedAt < minimumCapturedAtMs) {
    throw new Error("Sites recheck snapshot은 5분 이내이며 해당 checkpoint 이후 새로 조회해야 합니다.");
  }
  if (!validOpaqueId(expected?.projectId) || !/^[a-f0-9]{40}$/.test(expected?.sourceCommit)) {
    throw new Error("Sites expected project/source identity가 없습니다.");
  }
  const origin = normalizeFinalOrigin(expected.origin);
  if (site?.id !== expected.projectId || site.status !== "active" || site.access_mode !== "public" || normalizeFinalOrigin(site.current_live_url) !== origin) {
    throw new Error("Sites active/public 최종 domain identity가 다릅니다.");
  }
  if (version?.project_id !== expected.projectId || !validOpaqueId(version.id)
    || !Number.isSafeInteger(version.version_number) || version.version_number < 1 || site.latest_version_number !== version.version_number
    || version.source?.commit_sha !== expected.sourceCommit) {
    throw new Error("Sites version/source identity가 현재 expected release와 다릅니다.");
  }
  if (deployment?.project_id !== expected.projectId || deployment.version_id !== version.id || deployment.id !== version.deployment_id
    || !validOpaqueId(deployment.id) || deployment.type !== "publish" || deployment.status !== "succeeded"
    || !Number.isSafeInteger(deployment.env_set_revision) || deployment.env_set_revision < 1) {
    throw new Error("Sites production deployment/env identity가 없습니다.");
  }
  if (!Buffer.isBuffer(archiveBytes) || !/^sha256:[a-f0-9]{64}$/.test(version.archive_storage?.content_hash)
    || digest(archiveBytes) !== version.archive_storage.content_hash) {
    throw new Error("Sites provider archive digest와 local source artifact가 다릅니다.");
  }
  return Object.freeze({ projectId: expected.projectId, versionId: version.id, deploymentId: deployment.id, sourceCommit: expected.sourceCommit,
    archiveDigest: version.archive_storage.content_hash, envRevision: deployment.env_set_revision, origin, versionNumber: version.version_number });
}

export function sitesReleaseIdentityMismatch(initial, final) {
  for (const name of IDENTITY_FIELDS) if (initial?.[name] !== final?.[name]) return `최종 Sites ${name}가 최초 snapshot과 다릅니다.`;
  return null;
}
export async function waitForSitesFinalReceipt(readReceipt, minimumCapturedAtMs, { timeoutMs = 60_000, pollMs = 250 } = {}) {
  if (!Number.isFinite(minimumCapturedAtMs) || minimumCapturedAtMs <= 0 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000
    || !Number.isSafeInteger(pollMs) || pollMs < 1 || pollMs > timeoutMs) throw new Error("Sites final snapshot 대기 설정이 올바르지 않습니다.");
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const receipt = await readReceipt();
      if (Date.parse(receipt?.capturedAt) >= minimumCapturedAtMs) return receipt;
    } catch { /* Missing/incomplete atomic file replacement is not evidence. */ }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise(resolveWait => setTimeout(resolveWait, Math.min(pollMs, remaining)));
  } while (Date.now() <= deadline);
  throw new Error("BLOCKED: 제한시간 내 새 trusted Sites final snapshot이 공급되지 않았습니다.");
}

export function parseSitesIdentityCheckpoint(raw, expectedOrigin, expectedProjectId, expectedSourceCommit) {
  let payload;
  try { payload = JSON.parse(raw); } catch { throw new Error("Sites identity JSON을 해석할 수 없습니다."); }
  const identity = payload?.sitesIdentity;
  if (payload.automatedReady !== true || payload.archiveBound !== true || payload.liveAssetsBound !== true || !identity
    || Object.keys(identity).sort().join(",") !== [...IDENTITY_FIELDS].sort().join(",")
    || identity.origin !== expectedOrigin || identity.projectId !== expectedProjectId || identity.sourceCommit !== expectedSourceCommit
    || !validOpaqueId(identity.projectId) || !validOpaqueId(identity.versionId) || !validOpaqueId(identity.deploymentId)
    || !/^[a-f0-9]{40}$/.test(identity.sourceCommit) || !/^sha256:[a-f0-9]{64}$/.test(identity.archiveDigest)
    || !Number.isSafeInteger(identity.envRevision) || identity.envRevision < 1
    || !Number.isSafeInteger(identity.versionNumber) || identity.versionNumber < 1) {
    throw new Error("Sites production source/archive/live identity가 확인되지 않았습니다.");
  }
  return Object.freeze(identity);
}

async function main() {
  const env = process.env;
  if (process.argv.includes("--runtime")) {
    const issues = collectDeployEnvIssues(env, { requireServiceRole: false });
    if (issues.length) throw new Error("Sites 공개 런타임 비교 설정이 준비되지 않았습니다.");
    const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
    const runtime = await readRuntimeContract(env.ILGAMCHECK_FINAL_ORIGIN, ref, fetch, {
      expectedPublicConfigDigest: runtimePublicConfigDigestFromEnv(env), requirePolicyFinalized: true,
    });
    console.log(`[sites-runtime] PASS ${runtime.origin} finalized policy/runtime contract`);
    return;
  }
  const final = process.argv.includes("--final");
  if (final && (!env.ILGAMCHECK_SITES_RECHECK_AFTER || !Number.isFinite(Number(env.ILGAMCHECK_SITES_RECHECK_AFTER)))) {
    throw new Error("Sites final checkpoint 시각이 없습니다.");
  }
  const receiptPath = final ? env.ILGAMCHECK_SITES_FINAL_RECEIPT_PATH : env.ILGAMCHECK_SITES_RECEIPT_PATH;
  const archivePath = env.ILGAMCHECK_SITES_ARCHIVE_PATH;
  if (!receiptPath || !isAbsolute(receiptPath) || !receiptPath.endsWith(".json") || !archivePath || !isAbsolute(archivePath)) throw new Error("BLOCKED: 저장소 밖 trusted Sites metadata receipt와 source archive가 필요합니다.");
  const [archiveReal, rootReal] = await Promise.all([realpath(archivePath), realpath(process.cwd())]);
  const fromRoot = relative(rootReal, archiveReal);
  if (!fromRoot || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))) throw new Error("Sites archive는 저장소 밖에 보관해야 합니다.");
  const info = await stat(archiveReal);
  if (!info.isFile() || info.size < 1 || info.size > 64 * 1024 * 1024) throw new Error("Sites archive 크기가 올바르지 않습니다.");
  const readReceipt = () => readOperationalEvidenceFile(receiptPath, process.cwd());
  if (final) console.error("[sites-release-identity] WAIT 최종 checkpoint 이후 trusted Sites site/version/deployment를 다시 조회해 final receipt를 갱신하세요(최대 60초). 이전 snapshot은 허용하지 않습니다.");
  const receipt = final ? await waitForSitesFinalReceipt(readReceipt, Number(env.ILGAMCHECK_SITES_RECHECK_AFTER)) : await readReceipt();
  const identity = validateSitesReleaseReceipt(receipt, {
    origin: env.ILGAMCHECK_FINAL_ORIGIN, projectId: env.ILGAMCHECK_SITES_PROJECT_ID, sourceCommit: env.ILGAMCHECK_SITES_SOURCE_COMMIT,
  }, await readFile(archiveReal), { minimumCapturedAtMs: final ? Number(env.ILGAMCHECK_SITES_RECHECK_AFTER) : 0 });
  const listing = spawnSync("tar", ["-tf", archiveReal], { encoding: "utf8", shell: false, timeout: 15_000 });
  if (listing.status !== 0) throw new Error("Sites source archive 목록을 확인할 수 없습니다.");
  const assets = listing.stdout.split(/\r?\n/).filter(path => /^(?:\.\/)?(?:dist\/)?client\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(path));
  if (!assets.some(path => path.endsWith(".js")) || new Set(assets).size !== assets.length) throw new Error("Sites source archive의 공개 JS/CSS binding이 없습니다.");
  for (const path of assets) {
    const artifact = spawnSync("tar", ["-xOf", archiveReal, path], { shell: false, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 });
    if (artifact.status !== 0) throw new Error("Sites source asset를 읽을 수 없습니다.");
    const url = new URL(`/assets/${path.split("/").at(-1)}`, identity.origin);
    const response = await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (response.status !== 200 || response.redirected || (response.url && response.url !== url.href)
      || Number(response.headers.get("content-length")) > 16 * 1024 * 1024) throw new Error("Sites live source asset 응답이 올바르지 않습니다.");
    const live = Buffer.from(await response.arrayBuffer());
    if (live.length > 16 * 1024 * 1024 || digest(live) !== digest(artifact.stdout)) throw new Error("Sites live asset가 provider source archive와 다릅니다.");
  }
  console.log(JSON.stringify({ automatedReady: true, archiveBound: true, liveAssetsBound: true, sitesIdentity: identity }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); } catch { console.error("[sites-release-identity] BLOCKED trusted metadata/source/archive/live binding 확인 실패"); process.exitCode = 1; }
}
