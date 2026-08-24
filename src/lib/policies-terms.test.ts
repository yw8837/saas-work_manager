import { describe, expect, it } from "vitest";

import { POLICY_PUBLICATION_MANIFEST } from "./policies";

describe("beta terms responsibility boundary", () => {
  it("describes ordinary account creation while keeping beta access codes separate", () => {
    const text = JSON.stringify(POLICY_PUBLICATION_MANIFEST);

    expect(text).toContain("이메일로 계정을 만들 수 있습니다");
    expect(text).toContain("30일 Pro 이용 코드");
    expect(text).not.toContain("초대 계정");
    expect(text).not.toContain("초대를 받은 테스트 계정만");
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
