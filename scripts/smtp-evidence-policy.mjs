import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { normalizeMailDomain } from "./smtp-dns-policy.mjs";

const MAX_EVIDENCE_BYTES = 128 * 1024;
const MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MESSAGE_ID = /^<[\x21-\x3b\x3d-\x7e]+@[a-z0-9.-]+>$/i;
const FLOW_KEYS = ["receivedAt", "messageId", "authenticationResults", "landingOrigin", "landingPath"];

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}은 object여야 합니다.`);
  }
}

function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  const expected = new Set(keys);
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length || missing.length) {
    throw new Error(`${label} schema가 맞지 않습니다(민감정보·메일 원문·임의 필드 저장 금지).`);
  }
}

function normalizeSafeId(value, label) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!SAFE_ID.test(normalized)) throw new Error(`${label} 형식이 올바르지 않습니다.`);
  return normalized;
}

function normalizeTimestamp(value, label, nowMs) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new Error(`${label}은 UTC ISO timestamp여야 합니다.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} timestamp가 올바르지 않습니다.`);
  if (timestamp > nowMs + FUTURE_TOLERANCE_MS || nowMs - timestamp > MAX_EVIDENCE_AGE_MS) {
    throw new Error(`${label}은 미래 시각이거나 7일보다 오래됐습니다.`);
  }
  return value;
}

function normalizeMessageId(value, label) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length > 255 || !MESSAGE_ID.test(normalized) || /[\r\n]/.test(normalized)) {
    throw new Error(`${label}은 header의 단일 Message-ID여야 합니다.`);
  }
  return normalized;
}

export function normalizeFinalOrigin(rawValue, label = "ILGAMCHECK_FINAL_ORIGIN") {
  const value = rawValue?.trim();
  if (!value) throw new Error(`${label} 값이 없습니다.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label}은 최종 HTTPS origin이어야 합니다.`);
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.port
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error(`${label}은 path/query/자격증명이 없는 최종 HTTPS origin이어야 합니다.`);
  }
  const hostname = normalizeMailDomain(url.hostname, `${label} hostname`);
  if (hostname === "vercel.app" || hostname.endsWith(".vercel.app") || hostname.endsWith(".supabase.co")) {
    throw new Error(`${label}은 preview/Supabase 주소가 아닌 최종 custom domain이어야 합니다.`);
  }
  return `https://${hostname}`;
}

export function readSmtpEvidenceConfig(env) {
  const evidencePath = env.ILGAMCHECK_SMTP_EVIDENCE_PATH?.trim();
  if (!evidencePath || !isAbsolute(evidencePath) || /[\r\n\0]/.test(evidencePath) || !evidencePath.toLowerCase().endsWith(".json")) {
    throw new Error("ILGAMCHECK_SMTP_EVIDENCE_PATH는 저장소 밖 JSON의 절대 경로여야 합니다.");
  }
  return {
    evidencePath,
    finalOrigin: normalizeFinalOrigin(env.ILGAMCHECK_FINAL_ORIGIN),
    fromDomain: normalizeMailDomain(env.ILGAMCHECK_SMTP_FROM_DOMAIN, "FROM domain"),
    returnPathDomain: normalizeMailDomain(env.ILGAMCHECK_SMTP_RETURN_PATH_DOMAIN, "Return-Path domain"),
    dmarcDomain: normalizeMailDomain(env.ILGAMCHECK_SMTP_DMARC_DOMAIN, "DMARC domain"),
  };
}

function validateAuthResults(value, label) {
  assertExactKeys(value, ["spf", "dkim", "dmarc"], label);
  for (const key of ["spf", "dkim", "dmarc"]) {
    if (value[key] !== "pass") throw new Error(`${label}.${key}는 정확히 pass여야 합니다.`);
  }
}

function validateFlow(value, label, finalOrigin, nowMs, messageIds) {
  assertExactKeys(value, FLOW_KEYS, label);
  normalizeTimestamp(value.receivedAt, `${label}.receivedAt`, nowMs);
  const messageId = normalizeMessageId(value.messageId, `${label}.messageId`);
  if (messageIds.has(messageId)) throw new Error("모든 invite/reset/bounce Message-ID는 서로 달라야 합니다.");
  messageIds.add(messageId);
  validateAuthResults(value.authenticationResults, `${label}.authenticationResults`);
  if (normalizeFinalOrigin(value.landingOrigin, `${label}.landingOrigin`) !== finalOrigin) {
    throw new Error(`${label}은 최종 domain에 도착해야 합니다.`);
  }
  if (value.landingPath !== "/auth/reset") {
    throw new Error(`${label}.landingPath는 /auth/reset이어야 합니다.`);
  }
}

export function validateSmtpEvidence(evidence, config, { nowMs = Date.now() } = {}) {
  assertExactKeys(
    evidence,
    ["schemaVersion", "verifiedAt", "finalOrigin", "fromDomain", "returnPathDomain", "dmarcDomain", "mailboxes", "bounce"],
    "evidence",
  );
  if (evidence.schemaVersion !== 2) throw new Error("evidence.schemaVersion은 2여야 합니다.");
  normalizeTimestamp(evidence.verifiedAt, "evidence.verifiedAt", nowMs);
  if (normalizeFinalOrigin(evidence.finalOrigin, "evidence.finalOrigin") !== config.finalOrigin) {
    throw new Error("evidence.finalOrigin이 현재 최종 domain과 다릅니다.");
  }
  if (normalizeMailDomain(evidence.fromDomain, "evidence.fromDomain") !== config.fromDomain) {
    throw new Error("evidence.fromDomain이 현재 FROM domain과 다릅니다.");
  }
  if (normalizeMailDomain(evidence.returnPathDomain, "evidence.returnPathDomain") !== config.returnPathDomain) {
    throw new Error("evidence.returnPathDomain이 현재 Return-Path domain과 다릅니다.");
  }
  if (normalizeMailDomain(evidence.dmarcDomain, "evidence.dmarcDomain") !== config.dmarcDomain) {
    throw new Error("evidence.dmarcDomain이 현재 DMARC domain과 다릅니다.");
  }
  if (!Array.isArray(evidence.mailboxes) || evidence.mailboxes.length < 2 || evidence.mailboxes.length > 10) {
    throw new Error("서로 다른 외부 메일 사업자 evidence가 2개 이상 필요합니다.");
  }

  const providers = new Set();
  const recipientDomains = new Set();
  const messageIds = new Set();
  for (const [index, mailbox] of evidence.mailboxes.entries()) {
    const label = `evidence.mailboxes[${index}]`;
    assertExactKeys(mailbox, ["provider", "recipientDomain", "invite", "reset"], label);
    const provider = normalizeSafeId(mailbox.provider, `${label}.provider`);
    const recipientDomain = normalizeMailDomain(mailbox.recipientDomain, `${label}.recipientDomain`);
    if (providers.has(provider) || recipientDomains.has(recipientDomain)) {
      throw new Error("외부 메일 사업자와 수신 domain은 각각 서로 달라야 합니다.");
    }
    providers.add(provider);
    recipientDomains.add(recipientDomain);
    validateFlow(mailbox.invite, `${label}.invite`, config.finalOrigin, nowMs, messageIds);
    validateFlow(mailbox.reset, `${label}.reset`, config.finalOrigin, nowMs, messageIds);
  }

  assertExactKeys(
    evidence.bounce,
    ["testedAt", "messageId", "method", "event", "suppressionConfirmed", "suppressionConfirmedAt"],
    "evidence.bounce",
  );
  normalizeTimestamp(evidence.bounce.testedAt, "evidence.bounce.testedAt", nowMs);
  normalizeTimestamp(evidence.bounce.suppressionConfirmedAt, "evidence.bounce.suppressionConfirmedAt", nowMs);
  const bounceId = normalizeMessageId(evidence.bounce.messageId, "evidence.bounce.messageId");
  if (messageIds.has(bounceId)) throw new Error("모든 invite/reset/bounce Message-ID는 서로 달라야 합니다.");
  normalizeSafeId(evidence.bounce.method, "evidence.bounce.method");
  if (!new Set(["hard_bounce", "bounced"]).has(evidence.bounce.event)) {
    throw new Error("evidence.bounce.event는 hard_bounce 또는 bounced여야 합니다.");
  }
  if (evidence.bounce.suppressionConfirmed !== true) {
    throw new Error("controlled bounce 뒤 suppression 확인이 필요합니다.");
  }

  return {
    finalOrigin: config.finalOrigin,
    providerCount: providers.size,
    flowCount: evidence.mailboxes.length * 2,
    bounceSuppressed: true,
  };
}

function isWithin(parent, child) {
  const pathFromParent = relative(parent, child);
  return pathFromParent === "" || (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent));
}

export async function readSmtpEvidenceFile(evidencePath, repositoryRoot) {
  let realEvidencePath;
  let realRepositoryRoot;
  try {
    [realEvidencePath, realRepositoryRoot] = await Promise.all([
      realpath(resolve(evidencePath)),
      realpath(resolve(repositoryRoot)),
    ]);
  } catch {
    throw new Error("SMTP evidence JSON을 읽을 수 없습니다.");
  }
  if (isWithin(realRepositoryRoot, realEvidencePath)) {
    throw new Error("SMTP evidence JSON은 저장소 밖에 보관해야 합니다.");
  }
  const info = await stat(realEvidencePath);
  if (!info.isFile() || info.size < 2 || info.size > MAX_EVIDENCE_BYTES) {
    throw new Error("SMTP evidence JSON 파일 크기 또는 형식이 올바르지 않습니다.");
  }
  try {
    return JSON.parse(await readFile(realEvidencePath, "utf8"));
  } catch {
    throw new Error("SMTP evidence가 유효한 JSON이 아닙니다.");
  }
}
