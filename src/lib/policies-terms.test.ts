import { describe, expect, it } from "vitest";

import { POLICY_CHANGE_NOTICE, POLICY_PUBLICATION_MANIFEST } from "./policies";

describe("beta terms responsibility boundary", () => {
  it("describes ordinary account creation while keeping beta access codes separate", () => {
    const text = JSON.stringify(POLICY_PUBLICATION_MANIFEST);

    expect(text).toContain("Google 계정으로 가입하고 로그인할 수 있습니다");
    expect(text).toContain("14일 Pro 이용 코드");
    expect(text).not.toContain("초대 계정");
    expect(text).not.toContain("초대를 받은 테스트 계정만");
  });

  it("베타 이용 코드 기간은 정책 어디서나 14일이다(2026-11-03 결정)", () => {
    const text = JSON.stringify(POLICY_PUBLICATION_MANIFEST);

    expect(POLICY_PUBLICATION_MANIFEST.shared.draftNoticeBody).toContain("가입 후 14일 Pro 권한");
    expect(text).not.toContain("30일");
  });

  it("14일 문구는 새 버전으로 올려 기존 계정도 다시 동의하게 한다", () => {
    expect(POLICY_PUBLICATION_MANIFEST.documents.terms.version).toBe("2026-11-03-beta.4");
    expect(POLICY_PUBLICATION_MANIFEST.documents.privacy.version).toBe("2026-11-03-beta.4");
    expect(POLICY_PUBLICATION_MANIFEST.effectiveDate).toBe("2026-11-03");
    expect(POLICY_PUBLICATION_MANIFEST.effectiveDateLabel).toBe("2026년 11월 3일");
    expect(POLICY_PUBLICATION_MANIFEST.finalized).toBe(false);
  });

  it("개인정보처리방침의 호스팅 처리자는 실제 호스팅인 Cloudflare다(2026-11-01 전환)", () => {
    const transfer = POLICY_PUBLICATION_MANIFEST.documents.privacy.sections
      .find((section) => section.heading.includes("처리 위탁"));
    const text = JSON.stringify(transfer);
    const table = transfer?.blocks.find((block) => block.type === "table");
    const links = transfer?.blocks.find((block) => block.type === "links");

    expect(table && table.type === "table" ? table.rows.map((row) => row[0]) : []).toEqual(["Supabase", "Cloudflare"]);
    expect(text).toContain("Cloudflare Workers 웹 호스팅");
    expect(text).toContain("Supabase와 Cloudflare의 지원·보안·전송망");
    expect(links && links.type === "links" ? links.items : []).toEqual(expect.arrayContaining([
      { label: "Cloudflare 개인정보처리방침", href: "https://www.cloudflare.com/privacypolicy/" },
      { label: "Cloudflare DPA", href: "https://www.cloudflare.com/cloudflare-customer-dpa/" },
    ]));
    expect(JSON.stringify(POLICY_PUBLICATION_MANIFEST)).not.toMatch(/OpenAI|openai\.com/);
  });

  it("다시 동의 화면의 바뀐 점 안내는 지금 버전 것이다", () => {
    expect(POLICY_CHANGE_NOTICE.version).toBe(POLICY_PUBLICATION_MANIFEST.documents.terms.version);
    expect(POLICY_CHANGE_NOTICE.summary).toBe("베타 이용 코드 Pro 기간 14일 · 호스팅 사업자 Cloudflare로 표기");
  });

  it("keeps the beta limitation clear without excluding mandatory liability", () => {
    const responsibility = POLICY_PUBLICATION_MANIFEST.documents.terms.sections
      .find((section) => section.heading.includes("책임"));
    const text = JSON.stringify(responsibility);

    expect(text).toContain("계약·납품·고객 분쟁");
    expect(text).toContain("고의 또는 중대한 과실");
    expect(text).toContain("최종 납기");
  });
});
