import { isIP } from "node:net";

const MISSING_DNS_CODES = new Set(["ENODATA", "ENOTFOUND"]);
const RESERVED_SUFFIXES = [".example", ".invalid", ".localhost", ".test"];

function normalizeDnsRecordName(rawValue, label) {
  const value = rawValue?.trim().toLowerCase().replace(/\.$/, "");
  if (!value || value.length > 253 || isIP(value) || value.includes("..")) {
    throw new Error(`${label}은 유효한 DNS record name이어야 합니다.`);
  }
  const labels = value.split(".");
  if (labels.some((part) => (
    part.length < 1
    || part.length > 63
    || !/^[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?$/.test(part)
  ))) {
    throw new Error(`${label}은 유효한 DNS record name이어야 합니다.`);
  }
  return value;
}

export function normalizeMailDomain(rawValue, label = "domain") {
  const value = rawValue?.trim().toLowerCase().replace(/\.$/, "");
  if (!value) throw new Error(`${label} 값이 없습니다.`);
  if (value.length > 253 || isIP(value) || value.includes("..")) {
    throw new Error(`${label}은 유효한 ASCII 도메인이어야 합니다.`);
  }
  const labels = value.split(".");
  if (labels.length < 2 || labels.some((part) => (
    part.length < 1
    || part.length > 63
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)
  ))) {
    throw new Error(`${label}은 유효한 ASCII 도메인이어야 합니다.`);
  }
  if (RESERVED_SUFFIXES.some((suffix) => value === suffix.slice(1) || value.endsWith(suffix))) {
    throw new Error(`${label}은 외부 베타에 사용할 실제 도메인이어야 합니다.`);
  }
  return value;
}

export function normalizeDkimSelectors(rawValue) {
  const parts = rawValue?.split(",").map((value) => value.trim().toLowerCase()) ?? [];
  const values = parts.filter(Boolean);
  if (
    parts.some((value) => !value)
    || values.length < 1
    || values.length > 10
    || new Set(values).size !== values.length
  ) {
    throw new Error("DKIM selector는 중복 없이 comma 구분 1~10개여야 합니다.");
  }
  for (const selector of values) {
    if (
      selector.length > 127
      || selector.includes("..")
      || selector.includes("_domainkey")
      || selector.split(".").some((part) => !/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/.test(part))
    ) {
      throw new Error("DKIM selector에는 영문 소문자·숫자·하이픈·밑줄·점만 사용할 수 있습니다.");
    }
  }
  return values;
}

export function readSmtpDnsConfig(env) {
  return {
    fromDomain: normalizeMailDomain(env.ILGAMCHECK_SMTP_FROM_DOMAIN, "FROM domain"),
    returnPathDomain: normalizeMailDomain(env.ILGAMCHECK_SMTP_RETURN_PATH_DOMAIN, "Return-Path domain"),
    dmarcDomain: normalizeMailDomain(env.ILGAMCHECK_SMTP_DMARC_DOMAIN, "DMARC domain"),
    selectors: normalizeDkimSelectors(env.ILGAMCHECK_SMTP_DKIM_SELECTORS),
  };
}

function recordStrings(records) {
  if (!Array.isArray(records)) return [];
  return records
    .filter((record) => Array.isArray(record))
    .map((chunks) => chunks.join("").trim())
    .filter(Boolean);
}

async function withTimeout(promise, label, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} DNS 조회 timeout`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function resolveTxtRecords(resolver, domain, timeoutMs) {
  try {
    return recordStrings(await withTimeout(resolver.resolveTxt(domain), domain, timeoutMs));
  } catch (error) {
    if (MISSING_DNS_CODES.has(error?.code)) return [];
    throw error;
  }
}

async function resolveCnameRecords(resolver, domain, timeoutMs) {
  try {
    const values = await withTimeout(resolver.resolveCname(domain), domain, timeoutMs);
    return Array.isArray(values) ? values : [];
  } catch (error) {
    if (MISSING_DNS_CODES.has(error?.code)) return [];
    throw error;
  }
}

async function findDkimKey(resolver, recordName, timeoutMs, seen = new Set()) {
  const normalizedName = normalizeDnsRecordName(recordName, "DKIM record");
  if (seen.has(normalizedName) || seen.size >= 5) throw new Error("DKIM CNAME 순환 또는 과도한 체인입니다.");
  seen.add(normalizedName);

  const txt = await resolveTxtRecords(resolver, normalizedName, timeoutMs);
  const keyRecord = txt.find((record) => /(?:^|;)\s*p\s*=\s*[a-z0-9+/]+={0,2}(?:;|$)/i.test(record));
  if (keyRecord) return { recordName: normalizedName, viaCname: seen.size > 1 };

  const aliases = await resolveCnameRecords(resolver, normalizedName, timeoutMs);
  if (aliases.length !== 1) return null;
  return findDkimKey(resolver, aliases[0], timeoutMs, seen);
}

export async function verifySmtpDns(config, resolver, { timeoutMs = 5000 } = {}) {
  const fromDomain = normalizeMailDomain(config.fromDomain, "FROM domain");
  const returnPathDomain = normalizeMailDomain(config.returnPathDomain, "Return-Path domain");
  const dmarcDomain = normalizeMailDomain(config.dmarcDomain, "DMARC domain");
  const selectors = normalizeDkimSelectors(config.selectors.join(","));
  const issues = [];

  const returnPathTxt = await resolveTxtRecords(resolver, returnPathDomain, timeoutMs);
  const spfRecords = returnPathTxt.filter((record) => /^v=spf1(?:\s|$)/i.test(record));
  if (spfRecords.length !== 1) issues.push(`SPF 레코드는 Return-Path domain ${returnPathDomain}에 정확히 1개여야 합니다.`);
  else if (/(?:^|\s)\+all(?:\s|$)/i.test(spfRecords[0])) issues.push("SPF +all은 외부 베타에서 허용하지 않습니다.");

  const dkim = [];
  for (const selector of selectors) {
    const lookup = `${selector}._domainkey.${fromDomain}`;
    const found = await findDkimKey(resolver, lookup, timeoutMs);
    if (!found) issues.push(`DKIM public key를 찾지 못했습니다: ${lookup}`);
    else dkim.push({ selector, ...found });
  }

  const dmarcName = `_dmarc.${dmarcDomain}`;
  const dmarcTxt = await resolveTxtRecords(resolver, dmarcName, timeoutMs);
  const dmarcRecords = dmarcTxt.filter((record) => /^v=dmarc1(?:;|\s)/i.test(record));
  let dmarcPolicy = null;
  if (dmarcRecords.length !== 1) {
    issues.push(`DMARC 레코드는 ${dmarcName}에 정확히 1개여야 합니다.`);
  } else {
    dmarcPolicy = dmarcRecords[0].match(/(?:^|;)\s*p\s*=\s*(none|quarantine|reject)(?:;|$)/i)?.[1]?.toLowerCase() ?? null;
    if (!dmarcPolicy) issues.push("DMARC p=none|quarantine|reject 정책이 필요합니다.");
  }

  return {
    ok: issues.length === 0,
    issues,
    fromDomain,
    returnPathDomain,
    dmarcDomain,
    spfCount: spfRecords.length,
    dkim,
    dmarcPolicy,
  };
}
