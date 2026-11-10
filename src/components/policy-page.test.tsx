import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PolicyPage } from "./policy-page";
import { POLICY_PUBLICATION_MANIFEST } from "@/lib/policies";

describe("정책 화면", () => {
  it.each(["terms", "privacy"] as const)("%s 화면에는 링크 안에 링크가 없다(있으면 서버 화면과 브라우저 화면이 어긋난다)", (key) => {
    const { container } = render(<PolicyPage document={POLICY_PUBLICATION_MANIFEST.documents[key]} />);
    expect(container.querySelectorAll("a a")).toHaveLength(0);
    expect(container.querySelectorAll('a[href="/"]').length).toBeGreaterThan(0);
  });
});
