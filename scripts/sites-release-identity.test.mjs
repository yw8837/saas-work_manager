import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateSitesReleaseReceipt, sitesReleaseIdentityMismatch, waitForSitesFinalReceipt } from "./sites-release-identity.mjs";

const project = "appgprj_6a8b16a27df88191b5cad3afd63a9366";
const version = `${project}~appgver_bea4700d1744819182051c87f79ec4a4`;
const deployment = "appgdep_6ac50e3f5c108191923310c57fee6de6";
const source = "52183676be62d21ef2ff68d2f1aa4db14d2a06b7";
const archive = Buffer.from("test archive, not a production artifact");
const hash = `sha256:${createHash("sha256").update(archive).digest("hex")}`;
const nowMs = Date.parse("2026-10-10T04:00:00Z");
const expected = { origin: "https://ilgam.studioyeolmae.com", projectId: project, sourceCommit: source };
function receipt() {
  return {
    capturedAt: "2026-10-10T03:59:59Z",
    site: { id: project, current_live_url: expected.origin, status: "active", access_mode: "public", latest_version_number: 31 },
    version: { id: version, project_id: project, version_number: 31, source: { commit_sha: source }, archive_storage: { content_hash: hash }, deployment_id: deployment },
    deployment: { id: deployment, project_id: project, version_id: version, type: "publish", status: "succeeded", env_set_revision: 7 },
  };
}
describe("Sites release identity", () => {
  it("binds provider metadata to the exact archive and source, not just client JS", () => {
    const identity = validateSitesReleaseReceipt(receipt(), expected, archive, { nowMs });
    expect(identity).toMatchObject({ projectId: project, versionId: version, deploymentId: deployment, sourceCommit: source, archiveDigest: hash, envRevision: 7, origin: expected.origin });
    expect(sitesReleaseIdentityMismatch(identity, identity)).toBeNull();
    expect(sitesReleaseIdentityMismatch(identity, { ...identity, envRevision: 8 })).toMatch(/envRevision/);
  });
  it("fails closed on stale or unbound source, archive, project, latest version, visibility, or deployment", () => {
    for (const mutate of [
      r => { r.capturedAt = "2026-10-10T03:54:00Z"; },
      r => { delete r.version.source; },
      r => { r.version.archive_storage.content_hash = `sha256:${"a".repeat(64)}`; },
      r => { r.deployment.project_id = "other"; },
      r => { r.site.latest_version_number = 32; },
      r => { r.site.access_mode = "private"; },
      r => { r.deployment.status = "pending"; },
      r => { r.deployment.accessToken = "synthetic-must-not-be-recorded"; },
    ]) {
      const invalid = receipt(); mutate(invalid);
      expect(() => validateSitesReleaseReceipt(invalid, expected, archive, { nowMs })).toThrow();
    }
  });
  it("rejects a final receipt captured before the final checkpoint", () => {
    expect(() => validateSitesReleaseReceipt(receipt(), expected, archive, { nowMs, minimumCapturedAtMs: nowMs })).toThrow(/recheck|snapshot/);
  });
  it("does not let malformed checkpoint times disable freshness enforcement", () => {
    expect(() => validateSitesReleaseReceipt(receipt(), expected, archive, { nowMs, minimumCapturedAtMs: NaN })).toThrow(/snapshot/);
  });
  it("treats provider IDs as opaque, with exact cross-record equality", () => {
    const opaque = receipt();
    opaque.site.id = opaque.version.project_id = opaque.deployment.project_id = "opaque-project-id";
    opaque.version.id = opaque.deployment.version_id = "opaque-version-id";
    opaque.version.deployment_id = opaque.deployment.id = "opaque-deployment-id";
    expect(validateSitesReleaseReceipt(opaque, { ...expected, projectId: "opaque-project-id" }, archive, { nowMs }).projectId).toBe("opaque-project-id");
  });
  it("waits for an operator's new final metadata snapshot instead of accepting the old file", async () => {
    let reads = 0;
    const fresh = { ...receipt(), capturedAt: "2026-10-10T04:00:00Z" };
    const result = await waitForSitesFinalReceipt(async () => ++reads === 1 ? receipt() : fresh, nowMs, { timeoutMs: 50, pollMs: 1 });
    expect(result.capturedAt).toBe("2026-10-10T04:00:00Z");
  });
  it("times out fail-closed if the operator never refreshes the final receipt", async () => {
    await expect(waitForSitesFinalReceipt(async () => receipt(), nowMs, { timeoutMs: 5, pollMs: 1 })).rejects.toThrow(/BLOCKED|snapshot/);
  });
});
