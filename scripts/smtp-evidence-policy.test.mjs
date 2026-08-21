import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeFinalOrigin,
  readSmtpEvidenceConfig,
  readSmtpEvidenceFile,
  validateSmtpEvidence,
} from "./smtp-evidence-policy.mjs";

const roots = [];
const NOW = Date.parse("2026-08-17T04:00:00.000Z");
const config = {
  finalOrigin: "https://ilgamcheck.kr",
  fromDomain: "mail.ilgamcheck.kr",
  returnPathDomain: "bounce.ilgamcheck.kr",
  dmarcDomain: "ilgamcheck.kr",
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function flow(name, offsetMinutes = 0) {
  return {
    receivedAt: new Date(NOW - offsetMinutes * 60_000).toISOString(),
    messageId: `<${name}@sender.example.net>`,
    authenticationResults: { spf: "pass", dkim: "pass", dmarc: "pass" },
    landingOrigin: "https://ilgamcheck.kr",
    landingPath: "/auth/reset",
  };
}

function validEvidence() {
  return {
    schemaVersion: 2,
    verifiedAt: new Date(NOW).toISOString(),
    finalOrigin: "https://ilgamcheck.kr",
    fromDomain: "mail.ilgamcheck.kr",
    returnPathDomain: "bounce.ilgamcheck.kr",
    dmarcDomain: "ilgamcheck.kr",
    mailboxes: [
      {
        provider: "provider-a",
        recipientDomain: "mailbox-a.com",
        invite: flow("provider-a-invite", 1),
        reset: flow("provider-a-reset", 2),
      },
      {
        provider: "provider-b",
        recipientDomain: "mailbox-b.net",
        invite: flow("provider-b-invite", 3),
        reset: flow("provider-b-reset", 4),
      },
    ],
    bounce: {
      testedAt: new Date(NOW - 5 * 60_000).toISOString(),
      messageId: "<controlled-bounce@sender.example.net>",
      method: "provider-sandbox",
      event: "hard_bounce",
      suppressionConfirmed: true,
      suppressionConfirmedAt: new Date(NOW - 4 * 60_000).toISOString(),
    },
  };
}

describe("SMTP manual evidence policy", () => {
  it("accepts two distinct providers with invite/reset auth passes and bounce suppression", () => {
    expect(validateSmtpEvidence(validEvidence(), config, { nowMs: NOW })).toEqual({
      finalOrigin: "https://ilgamcheck.kr",
      providerCount: 2,
      flowCount: 4,
      bounceSuppressed: true,
    });
  });

  it("rejects preview origins, credentials, paths, and domain injection", () => {
    for (const value of [
      "http://ilgamcheck.kr",
      "https://preview.vercel.app",
      "https://user:pass@ilgamcheck.kr",
      "https://ilgamcheck.kr/path",
      "https://ilgamcheck.kr?token=secret",
      "https://ilgamcheck.kr\n.attacker.test",
    ]) expect(() => normalizeFinalOrigin(value)).toThrow();
  });

  it("rejects fewer than two providers, reused providers, and failed authentication", () => {
    const one = validEvidence();
    one.mailboxes.pop();
    expect(() => validateSmtpEvidence(one, config, { nowMs: NOW })).toThrow(/2개 이상/);

    const reused = validEvidence();
    reused.mailboxes[1].provider = reused.mailboxes[0].provider;
    expect(() => validateSmtpEvidence(reused, config, { nowMs: NOW })).toThrow(/서로 달라야/);

    const failedAuth = validEvidence();
    failedAuth.mailboxes[0].invite.authenticationResults.dkim = "fail";
    expect(() => validateSmtpEvidence(failedAuth, config, { nowMs: NOW })).toThrow(/정확히 pass/);
  });

  it("rejects stale proof, wrong final landing, and absent suppression", () => {
    const stale = validEvidence();
    stale.verifiedAt = "2026-08-01T00:00:00.000Z";
    expect(() => validateSmtpEvidence(stale, config, { nowMs: NOW })).toThrow(/7일/);

    const wrongLanding = validEvidence();
    wrongLanding.mailboxes[0].reset.landingOrigin = "https://other-domain.kr";
    expect(() => validateSmtpEvidence(wrongLanding, config, { nowMs: NOW })).toThrow(/최종 domain/);

    const noSuppression = validEvidence();
    noSuppression.bounce.suppressionConfirmed = false;
    expect(() => validateSmtpEvidence(noSuppression, config, { nowMs: NOW })).toThrow(/suppression/);
  });

  it("rejects unknown fields so recipient addresses, raw links, tokens, and secrets cannot be embedded", () => {
    for (const [key, value] of [
      ["recipientEmail", "person@example.com"],
      ["rawAuthenticationResults", "spf=pass"],
      ["inviteUrl", "https://ilgamcheck.kr/auth/reset?token=secret"],
      ["smtpPassword", "secret"],
    ]) {
      const evidence = validEvidence();
      evidence.mailboxes[0][key] = value;
      expect(() => validateSmtpEvidence(evidence, config, { nowMs: NOW })).toThrow(/schema/);
    }
  });

  it("requires an absolute JSON path and reads it only outside the repository", async () => {
    const root = mkdtempSync(join(tmpdir(), "ilgamcheck-smtp-evidence-"));
    roots.push(root);
    const repositoryRoot = join(root, "repo");
    mkdirSync(repositoryRoot);
    const outside = join(root, "manual-evidence.json");
    writeFileSync(outside, JSON.stringify(validEvidence()));
    await expect(readSmtpEvidenceFile(outside, repositoryRoot)).resolves.toMatchObject({ schemaVersion: 2 });

    const inside = join(repositoryRoot, "evidence.json");
    writeFileSync(inside, JSON.stringify(validEvidence()));
    await expect(readSmtpEvidenceFile(inside, repositoryRoot)).rejects.toThrow(/저장소 밖/);
    expect(() => readSmtpEvidenceConfig({
      ILGAMCHECK_SMTP_EVIDENCE_PATH: "relative.json",
      ILGAMCHECK_FINAL_ORIGIN: config.finalOrigin,
      ILGAMCHECK_SMTP_FROM_DOMAIN: config.fromDomain,
      ILGAMCHECK_SMTP_RETURN_PATH_DOMAIN: config.returnPathDomain,
      ILGAMCHECK_SMTP_DMARC_DOMAIN: config.dmarcDomain,
    })).toThrow(/절대 경로/);
  });
});
