import { describe, expect, it } from "vitest";

import { POLICY_PUBLICATION_MANIFEST } from "./policies";

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

  it("keeps the beta limitation clear without excluding mandatory liability", () => {
    const responsibility = POLICY_PUBLICATION_MANIFEST.documents.terms.sections
      .find((section) => section.heading.includes("책임"));
    const text = JSON.stringify(responsibility);

    expect(text).toContain("계약·납품·고객 분쟁");
    expect(text).toContain("고의 또는 중대한 과실");
    expect(text).toContain("최종 납기");
  });
});
