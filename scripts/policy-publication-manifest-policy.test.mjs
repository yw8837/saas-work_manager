import { describe, expect, it } from "vitest";
import {
  expectedPolicyPublicationDigests,
  loadPolicyPublicationManifest,
  validatePolicyPublicationManifest,
} from "./policy-publication-manifest-policy.mjs";

describe("public policy publication manifest", () => {
  it("binds the checked-in versions, public content and bundle digest", () => {
    const manifest = loadPolicyPublicationManifest();
    expect(validatePolicyPublicationManifest(manifest)).toMatchObject({
      finalized: false,
      termsVersion: "2026-08-24-beta.3",
      privacyVersion: "2026-08-24-beta.3",
    });
  });

  it("fails closed when content, digest, or finalized state drifts", () => {
    const manifest = loadPolicyPublicationManifest();

    const changedContent = structuredClone(manifest);
    changedContent.documents.privacy.lead += " changed";
    expect(() => validatePolicyPublicationManifest(changedContent)).toThrow(/contentDigest/);

    const changedBundle = structuredClone(manifest);
    changedBundle.finalized = true;
    expect(() => validatePolicyPublicationManifest(changedBundle)).toThrow(/bundleDigest/);

    const finalizedWithPlaceholder = structuredClone(manifest);
    finalizedWithPlaceholder.finalized = true;
    const replacement = expectedPolicyPublicationDigests(finalizedWithPlaceholder);
    finalizedWithPlaceholder.documents.privacy.contentDigest = replacement.privacyContentDigest;
    finalizedWithPlaceholder.documents.terms.contentDigest = replacement.termsContentDigest;
    finalizedWithPlaceholder.bundleDigest = replacement.bundleDigest;
    expect(() => validatePolicyPublicationManifest(finalizedWithPlaceholder))
      .toThrow(/placeholder·준비본|베타 서비스 정책 안내/);

    expect(() => validatePolicyPublicationManifest(manifest, { requireFinalized: true }))
      .toThrow(/finalized=true/);
  });

  it("never permits identity, secret, or personal-data values in the hashed manifest", () => {
    const manifest = loadPolicyPublicationManifest();
    const unsafe = structuredClone(manifest);
    unsafe.operatorName = "person name";
    expect(() => validatePolicyPublicationManifest(unsafe)).toThrow(/schema/);

    const unsafeNested = structuredClone(manifest);
    unsafeNested.documents.privacy.sections[0].blocks[0].secret = "do-not-hash";
    expect(() => validatePolicyPublicationManifest(unsafeNested)).toThrow(/schema/);

    const personalEmail = structuredClone(manifest);
    personalEmail.documents.terms.lead += " person@example.com";
    expect(() => expectedPolicyPublicationDigests(personalEmail)).toThrow(/이메일/);
  });

  it("prints deterministic replacement digests without mutating the manifest", () => {
    const manifest = loadPolicyPublicationManifest();
    expect(expectedPolicyPublicationDigests(manifest)).toEqual({
      privacyContentDigest: manifest.documents.privacy.contentDigest,
      termsContentDigest: manifest.documents.terms.contentDigest,
      bundleDigest: manifest.bundleDigest,
    });
  });
});
