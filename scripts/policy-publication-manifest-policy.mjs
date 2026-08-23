import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const POLICY_PUBLICATION_MANIFEST_PATH = "src/lib/policy-publication-manifest.json";
export const POLICY_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

const DOCUMENT_KEYS = Object.freeze([
  "pathname",
  "eyebrow",
  "title",
  "metadataDescription",
  "version",
  "contentDigest",
  "lead",
  "sections",
]);
const SHARED_KEYS = Object.freeze([
  "draftNoticeTitle",
  "draftNoticeBody",
  "operatorHeading",
  "operatorLabel",
  "supportLabel",
  "missingPublicValue",
  "footerLabel",
]);
const FORBIDDEN_MANIFEST_KEYS = /^(?:operatorName|supportEmail|emailAddress|password|secret|token|serviceRoleKey|accessToken)$/i;
const FINALIZED_PLACEHOLDER_PATTERN = /(?:\b(?:YOUR|ACTUAL|PLACEHOLDER|TODO|TBD|CHANGEME)(?:_[A-Z0-9]+)*\b|공개 전 설정 필요|정책 확정 전|미확정|준비본|베타 서비스 정책 안내)/i;
const FORBIDDEN_HASHED_VALUE_PATTERN = /(?:\b[^\s@]+@[^\s@]+\.[^\s@]+\b|\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.)/;

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
    throw new Error(`${label} schema가 올바르지 않습니다.`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim() || /[\r\n\0]/.test(value)) {
    throw new Error(`${label}은 빈 줄 없는 문자열이어야 합니다.`);
  }
}

function assertNoSensitiveKeys(value, label = "manifest") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveKeys(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_MANIFEST_KEYS.test(key)) {
      throw new Error(`${label}.${key}: 개인정보·비밀값은 정책 digest manifest에 넣거나 hash하지 않습니다.`);
    }
    assertNoSensitiveKeys(item, `${label}.${key}`);
  }
}

function assertNoSensitiveStringValues(value, label = "manifest") {
  if (typeof value === "string") {
    if (FORBIDDEN_HASHED_VALUE_PATTERN.test(value)) {
      throw new Error(`${label}: 이메일·비밀키·token 값은 정책 digest에 포함하지 않습니다.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveStringValues(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (!["bundleDigest", "contentDigest"].includes(key)) {
      assertNoSensitiveStringValues(item, `${label}.${key}`);
    }
  }
}

function assertBlock(block, label) {
  assertPlainObject(block, label);
  if (block.type === "paragraph" || block.type === "note") {
    assertExactKeys(block, ["type", "text"], label);
    assertNonEmptyString(block.text, `${label}.text`);
    return;
  }
  if (block.type === "list") {
    assertExactKeys(block, ["type", "items"], label);
    if (!Array.isArray(block.items) || block.items.length === 0) {
      throw new Error(`${label}.items는 비지 않은 배열이어야 합니다.`);
    }
    block.items.forEach((item, index) => assertNonEmptyString(item, `${label}.items[${index}]`));
    return;
  }
  if (block.type === "table") {
    assertExactKeys(block, ["type", "headers", "rows"], label);
    if (!Array.isArray(block.headers) || block.headers.length === 0 || !Array.isArray(block.rows) || block.rows.length === 0) {
      throw new Error(`${label}: table header와 row가 필요합니다.`);
    }
    block.headers.forEach((item, index) => assertNonEmptyString(item, `${label}.headers[${index}]`));
    for (const [rowIndex, row] of block.rows.entries()) {
      if (!Array.isArray(row) || row.length !== block.headers.length) {
        throw new Error(`${label}.rows[${rowIndex}]의 column 수가 header와 다릅니다.`);
      }
      row.forEach((item, index) => assertNonEmptyString(item, `${label}.rows[${rowIndex}][${index}]`));
    }
    return;
  }
  if (block.type === "links") {
    assertExactKeys(block, ["type", "label", "items"], label);
    assertNonEmptyString(block.label, `${label}.label`);
    if (!Array.isArray(block.items) || block.items.length === 0) {
      throw new Error(`${label}.items는 비지 않은 배열이어야 합니다.`);
    }
    block.items.forEach((item, index) => {
      assertExactKeys(item, ["label", "href"], `${label}.items[${index}]`);
      assertNonEmptyString(item.label, `${label}.items[${index}].label`);
      let url;
      try {
        url = new URL(item.href);
      } catch {
        throw new Error(`${label}.items[${index}].href가 올바른 URL이 아닙니다.`);
      }
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error(`${label}.items[${index}].href는 credential 없는 HTTPS여야 합니다.`);
      }
    });
    return;
  }
  throw new Error(`${label}.type은 허용된 정책 block이 아닙니다.`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

function documentDigestInput(document) {
  const publicDocument = { ...document };
  delete publicDocument.contentDigest;
  return publicDocument;
}

export function computePolicyDocumentDigest(document) {
  assertNoSensitiveKeys(document, "policy document");
  assertNoSensitiveStringValues(document, "policy document");
  return sha256(documentDigestInput(document));
}

export function computePolicyBundleDigest(manifest) {
  assertNoSensitiveKeys(manifest);
  assertNoSensitiveStringValues(manifest);
  return sha256({
    schemaVersion: manifest.schemaVersion,
    finalized: manifest.finalized,
    effectiveDate: manifest.effectiveDate,
    effectiveDateLabel: manifest.effectiveDateLabel,
    shared: manifest.shared,
    documents: {
      privacy: {
        pathname: manifest.documents.privacy.pathname,
        version: manifest.documents.privacy.version,
        contentDigest: manifest.documents.privacy.contentDigest,
      },
      terms: {
        pathname: manifest.documents.terms.pathname,
        version: manifest.documents.terms.version,
        contentDigest: manifest.documents.terms.contentDigest,
      },
    },
  });
}

export function validatePolicyPublicationManifest(manifest, { requireFinalized = false } = {}) {
  assertExactKeys(
    manifest,
    ["schemaVersion", "finalized", "effectiveDate", "effectiveDateLabel", "bundleDigest", "shared", "documents"],
    "policy manifest",
  );
  if (manifest.schemaVersion !== 1) throw new Error("policy manifest schemaVersion은 1이어야 합니다.");
  if (typeof manifest.finalized !== "boolean") throw new Error("policy manifest finalized는 boolean이어야 합니다.");
  if (requireFinalized && manifest.finalized !== true) {
    throw new Error("공개 privacy/terms manifest가 finalized=true로 확정되지 않았습니다.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.effectiveDate)) {
    throw new Error("policy manifest effectiveDate는 YYYY-MM-DD여야 합니다.");
  }
  assertNonEmptyString(manifest.effectiveDateLabel, "policy manifest effectiveDateLabel");
  assertExactKeys(manifest.shared, SHARED_KEYS, "policy manifest shared");
  SHARED_KEYS.forEach((key) => assertNonEmptyString(manifest.shared[key], `policy manifest shared.${key}`));
  assertExactKeys(manifest.documents, ["privacy", "terms"], "policy manifest documents");

  for (const [key, expectedPathname] of [["privacy", "/privacy"], ["terms", "/terms"]]) {
    const document = manifest.documents[key];
    assertExactKeys(document, DOCUMENT_KEYS, `policy manifest documents.${key}`);
    for (const field of ["pathname", "eyebrow", "title", "metadataDescription", "version", "lead"]) {
      assertNonEmptyString(document[field], `policy manifest documents.${key}.${field}`);
    }
    if (document.pathname !== expectedPathname) {
      throw new Error(`policy manifest documents.${key}.pathname은 ${expectedPathname}여야 합니다.`);
    }
    if (!POLICY_DIGEST_PATTERN.test(document.contentDigest)) {
      throw new Error(`policy manifest documents.${key}.contentDigest가 올바른 sha256가 아닙니다.`);
    }
    if (!Array.isArray(document.sections) || document.sections.length === 0) {
      throw new Error(`policy manifest documents.${key}.sections가 비어 있습니다.`);
    }
    document.sections.forEach((section, sectionIndex) => {
      const label = `policy manifest documents.${key}.sections[${sectionIndex}]`;
      assertExactKeys(section, ["heading", "blocks"], label);
      assertNonEmptyString(section.heading, `${label}.heading`);
      if (!Array.isArray(section.blocks) || section.blocks.length === 0) {
        throw new Error(`${label}.blocks가 비어 있습니다.`);
      }
      section.blocks.forEach((block, blockIndex) => assertBlock(block, `${label}.blocks[${blockIndex}]`));
    });
    const expectedDigest = computePolicyDocumentDigest(document);
    if (document.contentDigest !== expectedDigest) {
      throw new Error(`policy manifest documents.${key}.contentDigest가 현재 공개 본문과 다릅니다. 기대값: ${expectedDigest}`);
    }
  }

  if (!POLICY_DIGEST_PATTERN.test(manifest.bundleDigest)) {
    throw new Error("policy manifest bundleDigest가 올바른 sha256가 아닙니다.");
  }
  const expectedBundleDigest = computePolicyBundleDigest(manifest);
  if (manifest.bundleDigest !== expectedBundleDigest) {
    throw new Error(`policy manifest bundleDigest가 버전·본문·finalized 상태와 다릅니다. 기대값: ${expectedBundleDigest}`);
  }

  assertNoSensitiveKeys(manifest);
  assertNoSensitiveStringValues(manifest);
  if (manifest.finalized && FINALIZED_PLACEHOLDER_PATTERN.test(canonicalJson(manifest))) {
    throw new Error("finalized policy manifest에 placeholder·준비본 문구가 남아 있습니다.");
  }

  return policyPublicationContract(manifest);
}

export function policyPublicationContract(manifest) {
  return {
    finalized: manifest.finalized,
    bundleDigest: manifest.bundleDigest,
    termsVersion: manifest.documents.terms.version,
    privacyVersion: manifest.documents.privacy.version,
    termsContentDigest: manifest.documents.terms.contentDigest,
    privacyContentDigest: manifest.documents.privacy.contentDigest,
  };
}

export function loadPolicyPublicationManifest(root = process.cwd(), options) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(root, POLICY_PUBLICATION_MANIFEST_PATH), "utf8"));
  } catch {
    throw new Error(`정책 manifest를 읽을 수 없습니다: ${POLICY_PUBLICATION_MANIFEST_PATH}`);
  }
  validatePolicyPublicationManifest(manifest, options);
  return manifest;
}

export function expectedPolicyPublicationDigests(manifest) {
  assertNoSensitiveKeys(manifest);
  assertNoSensitiveStringValues(manifest);
  const privacyContentDigest = computePolicyDocumentDigest(manifest.documents.privacy);
  const termsContentDigest = computePolicyDocumentDigest(manifest.documents.terms);
  const withContentDigests = structuredClone(manifest);
  withContentDigests.documents.privacy.contentDigest = privacyContentDigest;
  withContentDigests.documents.terms.contentDigest = termsContentDigest;
  return {
    privacyContentDigest,
    termsContentDigest,
    bundleDigest: computePolicyBundleDigest(withContentDigests),
  };
}
