import { act, within } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { POLICY_PUBLICATION_MANIFEST } from "@/lib/policies";
import { PolicyPage } from "./policy-page";

const mounted: { container: HTMLElement; root?: Root }[] = [];

afterEach(() => {
  for (const { container, root } of mounted.splice(0)) {
    if (root) act(() => root.unmount());
    container.remove();
  }
});

describe("정책 화면은 서버가 그린 HTML을 브라우저에서 그대로 이어 받는다", () => {
  it.each([
    ["개인정보처리방침", POLICY_PUBLICATION_MANIFEST.documents.privacy],
    ["이용약관", POLICY_PUBLICATION_MANIFEST.documents.terms],
  ])("%s 화면은 hydrate 불일치(운영 React #418)가 없다", async (_, policy) => {
    const container = document.createElement("div");
    const entry: { container: HTMLElement; root?: Root } = { container };
    mounted.push(entry);
    // 브라우저처럼 HTML 해석기를 거친다. 해석기는 링크 안의 링크를 형제로 떼어 내므로 React가 그린 트리와 어긋난다.
    container.innerHTML = renderToString(<PolicyPage document={policy} />);
    document.body.appendChild(container);
    const serverBrand = container.querySelector("a.brand");

    const hydrationErrors: string[] = [];
    await act(async () => {
      entry.root = hydrateRoot(container, <PolicyPage document={policy} />, {
        onRecoverableError: (error) => hydrationErrors.push(String(error)),
      });
    });

    expect(hydrationErrors).toEqual([]);
    // 불일치가 나면 React는 서버 노드를 버리고 새로 그린다. 같은 노드가 남아 있어야 이어 받은 것이다.
    expect(serverBrand).not.toBeNull();
    expect(container.querySelector("a.brand")).toBe(serverBrand);
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByRole("link", { name: "일감체크 홈" })).toHaveAttribute("href", "/");
  });
});
