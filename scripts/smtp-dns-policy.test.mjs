import { describe, expect, it } from "vitest";
import {
  normalizeDkimSelectors,
  normalizeMailDomain,
  readSmtpDnsConfig,
  verifySmtpDns,
} from "./smtp-dns-policy.mjs";

function missingDnsError() {
  return Object.assign(new Error("missing"), { code: "ENODATA" });
}

function fakeResolver({ txt = {}, cname = {} } = {}) {
  return {
    async resolveTxt(name) {
      if (!(name in txt)) throw missingDnsError();
      return txt[name].map((value) => [value]);
    },
    async resolveCname(name) {
      if (!(name in cname)) throw missingDnsError();
      return cname[name];
    },
  };
}

const validConfig = {
  fromDomain: "mail.ilgamcheck.kr",
  returnPathDomain: "bounce.ilgamcheck.kr",
  dmarcDomain: "ilgamcheck.kr",
  selectors: ["primary", "backup"],
};

describe("SMTP DNS policy", () => {
  it("accepts one SPF, direct/CNAME DKIM keys, and an explicit DMARC policy", async () => {
    const resolver = fakeResolver({
      txt: {
        "bounce.ilgamcheck.kr": ["v=spf1 include:sender.example.net -all"],
        "primary._domainkey.mail.ilgamcheck.kr": ["v=DKIM1; k=rsa; p=QUJDREVGRw=="],
        "dkim.vendor.example.net": ["v=DKIM1; p=YWJjZGVmZw=="],
        "_dmarc.ilgamcheck.kr": ["v=DMARC1; p=quarantine; rua=mailto:dmarc@ilgamcheck.kr"],
      },
      cname: {
        "backup._domainkey.mail.ilgamcheck.kr": ["dkim.vendor.example.net"],
      },
    });

    await expect(verifySmtpDns(validConfig, resolver)).resolves.toMatchObject({
      ok: true,
      spfCount: 1,
      dmarcPolicy: "quarantine",
      dkim: [
        expect.objectContaining({ selector: "primary", viaCname: false }),
        expect.objectContaining({ selector: "backup", viaCname: true }),
      ],
    });
  });

  it("rejects duplicate SPF, missing DKIM, and DMARC without p=", async () => {
    const resolver = fakeResolver({
      txt: {
        "bounce.ilgamcheck.kr": ["v=spf1 -all", "v=spf1 include:other.example.net -all"],
        "_dmarc.ilgamcheck.kr": ["v=DMARC1; rua=mailto:dmarc@ilgamcheck.kr"],
      },
    });
    const result = await verifySmtpDns(validConfig, resolver);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("SPF"),
      expect.stringContaining("DKIM"),
      expect.stringContaining("DMARC"),
    ]));
  });

  it("rejects SPF +all", async () => {
    const resolver = fakeResolver({
      txt: {
        "bounce.ilgamcheck.kr": ["v=spf1 +all"],
        "primary._domainkey.mail.ilgamcheck.kr": ["v=DKIM1; p=QUJDRA=="],
        "backup._domainkey.mail.ilgamcheck.kr": ["v=DKIM1; p=QUJDRA=="],
        "_dmarc.ilgamcheck.kr": ["v=DMARC1; p=none"],
      },
    });
    const result = await verifySmtpDns(validConfig, resolver);
    expect(result.issues).toContain("SPF +all은 외부 베타에서 허용하지 않습니다.");
  });

  it("fails closed for missing values, reserved domains, and injection-like input", () => {
    expect(() => readSmtpDnsConfig({})).toThrow(/FROM domain/);
    for (const value of [
      "https://mail.ilgamcheck.kr",
      "mail.ilgamcheck.kr;whoami",
      "mail.ilgamcheck.kr\nattacker.test",
      "127.0.0.1",
      "mail.example",
    ]) expect(() => normalizeMailDomain(value)).toThrow();
    for (const value of [
      "selector;whoami",
      "selector\nsecond",
      "primary._domainkey",
      "dup,dup",
      "a,,",
    ]) expect(() => normalizeDkimSelectors(value)).toThrow();
  });
});
