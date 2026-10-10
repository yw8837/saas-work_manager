import { fixtureOutsideRepo } from "./test-fixtures.mjs";
import { HOSTED_RUNTIME_CONTRACT } from "./verify-hosted-runtime-policy.mjs";
import { describe, expect, it } from "vitest";
import { readOperationalEvidenceConfig, validateOperationalEvidence } from "./operational-evidence-policy.mjs";

const nowMs = Date.parse("2026-08-17T02:00:00.000Z");
const config = {
  evidencePath: fixtureOutsideRepo("secure", "operational-evidence.json"),
  finalOrigin: "https://ilgamcheck.kr",
  operatorName: "일감체크 운영자",
  supportEmail: "support@ilgamcheck.kr",
  policyPublication: {
    finalized: true,
    bundleDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    termsVersion: "2026-08-16-beta.1",
    privacyVersion: "2026-08-16-beta.1",
  },
};

function validEvidence() {
  return {
    schemaVersion: 2,
    recordedAt: "2026-08-17T01:00:00.000Z",
    finalOrigin: "https://ilgamcheck.kr",
    operatorName: "일감체크 운영자",
    supportEmail: "support@ilgamcheck.kr",
    policy: {
      reviewedAt: "2026-08-17T01:00:00.000Z",
      publicationFinalized: true,
      policyBundleDigest: config.policyPublication.bundleDigest,
      termsVersion: config.policyPublication.termsVersion,
      privacyVersion: config.policyPublication.privacyVersion,
      privacyTermsPublished: true,
      overseasTransferNoticeFinalized: true,
      legalReviewCompleted: true,
      closedBetaApproved: true,
    },
    accountDeletion: {
      testedAt: "2026-08-17T01:00:00.000Z",
      testedOrigin: "https://ilgamcheck.kr",
      recentPasswordAmrVerified: true,
      authUserDeletionVerified: true,
      cascadeVerified: true,
    },
    backupRecovery: {
      testedAt: "2026-08-17T01:00:00.000Z",
      runtimeContract: HOSTED_RUNTIME_CONTRACT,
      managedBackupOrPitrVerified: true,
      logicalManifestVerified: true,
      recoveryRestoreCompleted: true,
      authLoginVerified: true,
      abIsolationVerified: true,
      historicalDataCompared: true,
    },
  };
}

describe("operational release evidence", () => {
  it("rejects password evidence for Google-only account deletion", () => {
    expect(() => validateOperationalEvidence(validEvidence(), { ...config, authMode: "google-only" }, { nowMs })).toThrow(/Google|OAuth/);
  });

  it("accepts schema3 fresh Google OAuth deletion evidence", () => {
    const evidence = validEvidence();
    evidence.schemaVersion = 3;
    delete evidence.accountDeletion.recentPasswordAmrVerified;
    Object.assign(evidence.accountDeletion, {
      authMethod: "google-oauth", recentOAuthAmrVerified: true, googleProviderVerified: true,
      staleAuthenticationRejected: true, wrongProviderRejected: true,
    });
    expect(validateOperationalEvidence(evidence, { ...config, authMode: "google-only" }, { nowMs }).finalOrigin).toBe(config.finalOrigin);
    for (const field of ["recentOAuthAmrVerified", "googleProviderVerified", "staleAuthenticationRejected", "wrongProviderRejected"]) {
      const incomplete = structuredClone(evidence);
      incomplete.accountDeletion[field] = false;
      expect(() => validateOperationalEvidence(incomplete, { ...config, authMode: "google-only" }, { nowMs })).toThrow(/증거가 필요합니다/);
    }
  });
  it("accepts current exact policy, deletion, and recovery evidence", () => {
    expect(validateOperationalEvidence(validEvidence(), config, { nowMs })).toEqual({
      finalOrigin: "https://ilgamcheck.kr",
      runtimeContract: HOSTED_RUNTIME_CONTRACT,
      policyBundleDigest: config.policyPublication.bundleDigest,
    });
  });

  it("fails closed when policy, deletion, or recovery proof is missing", () => {
    for (const mutate of [
      (e) => { e.policy.legalReviewCompleted = false; },
      (e) => { e.policy.publicationFinalized = false; },
      (e) => { e.accountDeletion.cascadeVerified = false; },
      (e) => { e.backupRecovery.recoveryRestoreCompleted = false; },
    ]) {
      const evidence = validEvidence();
      mutate(evidence);
      expect(() => validateOperationalEvidence(evidence, config, { nowMs })).toThrow(/증거가 필요합니다/);
    }
  });

  it("rejects policy evidence for another digest or document version", () => {
    const wrongDigest = validEvidence();
    wrongDigest.policy.policyBundleDigest = `sha256:${"b".repeat(64)}`;
    expect(() => validateOperationalEvidence(wrongDigest, config, { nowMs })).toThrow(/manifest와 다릅니다/);

    const wrongVersion = validEvidence();
    wrongVersion.policy.termsVersion = "stale";
    expect(() => validateOperationalEvidence(wrongVersion, config, { nowMs })).toThrow(/manifest와 다릅니다/);
  });

  it("rejects another domain, stale evidence, and arbitrary secret fields", () => {
    const wrongDomain = validEvidence();
    wrongDomain.finalOrigin = "https://other.kr";
    expect(() => validateOperationalEvidence(wrongDomain, config, { nowMs })).toThrow(/최종 domain/);

    const stale = validEvidence();
    stale.recordedAt = "2026-06-01T00:00:00.000Z";
    expect(() => validateOperationalEvidence(stale, config, { nowMs })).toThrow(/30일/);

    const extra = validEvidence();
    extra.smtpPassword = "must-not-be-recorded";
    expect(() => validateOperationalEvidence(extra, config, { nowMs })).toThrow(/schema/);
  });

  it("requires an outside-repository absolute path and current public identity", () => {
    expect(() => readOperationalEvidenceConfig({
      ILGAMCHECK_OPERATIONAL_EVIDENCE_PATH: "relative.json",
      ILGAMCHECK_FINAL_ORIGIN: config.finalOrigin,
      NEXT_PUBLIC_OPERATOR_NAME: config.operatorName,
      NEXT_PUBLIC_SUPPORT_EMAIL: config.supportEmail,
    })).toThrow(/절대 경로/);
    expect(() => readOperationalEvidenceConfig({
      ILGAMCHECK_OPERATIONAL_EVIDENCE_PATH: config.evidencePath,
      ILGAMCHECK_FINAL_ORIGIN: config.finalOrigin,
      NEXT_PUBLIC_OPERATOR_NAME: "OPERATOR_NAME",
      NEXT_PUBLIC_SUPPORT_EMAIL: config.supportEmail,
    })).toThrow(/실제 공개 운영자명/);

    expect(() => readOperationalEvidenceConfig({
      ILGAMCHECK_OPERATIONAL_EVIDENCE_PATH: config.evidencePath,
      ILGAMCHECK_FINAL_ORIGIN: config.finalOrigin,
      NEXT_PUBLIC_OPERATOR_NAME: config.operatorName,
      NEXT_PUBLIC_SUPPORT_EMAIL: config.supportEmail,
    })).toThrow(/finalized=true/);
  });
});
