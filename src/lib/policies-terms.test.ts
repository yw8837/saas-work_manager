import { describe, expect, it } from "vitest";

import { POLICY_PUBLICATION_MANIFEST } from "./policies";

describe("beta terms responsibility boundary", () => {
  it("keeps the beta limitation clear without excluding mandatory liability", () => {
    const responsibility = POLICY_PUBLICATION_MANIFEST.documents.terms.sections
      .find((section) => section.heading.includes("책임"));
    const text = JSON.stringify(responsibility);

    expect(text).toContain("계약·납품·고객 분쟁");
    expect(text).toContain("고의 또는 중대한 과실");
    expect(text).toContain("최종 납기");
  });
});
