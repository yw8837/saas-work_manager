// @vitest-environment node
import { describe, expect, it } from "vitest";

import { withHtmlNoTransform } from "./html-delivery";

const html = "<!doctype html><html><head><title>일감체크</title></head><body>본문</body></html>";

function page(headers: Record<string, string> = {}, init: ResponseInit = {}): Response {
  return new Response(html, { status: 200, ...init, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

function visit(acceptEncoding?: string): Request {
  return new Request("https://ilgam.studioyeolmae.com/", {
    headers: acceptEncoding === undefined ? {} : { "accept-encoding": acceptEncoding },
  });
}

/** 운영 에지는 Accept-Encoding을 바꿔 넘기고 브라우저가 보낸 원래 값을 `cf.clientAcceptEncoding`에 둔다. */
function visitThroughEdge(clientAcceptEncoding: string | null, normalized = "br, gzip"): Request {
  return Object.assign(visit(normalized), { cf: { clientAcceptEncoding } });
}

describe("HTML 응답을 에지가 고치지 못하게 하기", () => {
  it("HTML에 no-transform을 붙이고 원래 캐시 지시와 본문은 그대로 둔다", async () => {
    const result = withHtmlNoTransform(visit("gzip, deflate, br, zstd"), page({ "cache-control": "s-maxage=31536000" }));

    expect(result.headers.get("cache-control")).toBe("s-maxage=31536000, no-transform");
    expect(await result.text()).toBe(html);
  });

  it("캐시 지시가 없거나 이미 no-transform이면 한 번만 둔다", () => {
    expect(withHtmlNoTransform(visit("br"), page()).headers.get("cache-control")).toBe("no-transform");
    expect(withHtmlNoTransform(visit("br"), page({ "cache-control": "private, no-transform" })).headers.get("cache-control"))
      .toBe("private, no-transform");
  });

  it("에지 압축이 꺼지므로 Workers 런타임이 압축할 방식을 정한다(br 먼저, 그다음 gzip)", () => {
    const encoding = (acceptEncoding?: string) => withHtmlNoTransform(visit(acceptEncoding), page()).headers.get("content-encoding");

    expect(encoding("gzip, deflate, br, zstd")).toBe("br");
    expect(encoding("gzip")).toBe("gzip");
    expect(encoding("br;q=0, gzip;q=0.8")).toBe("gzip");
    expect(encoding("*")).toBe("br");
    expect(encoding("identity")).toBeNull();
    expect(encoding()).toBeNull();
  });

  it("에지가 바꾼 Accept-Encoding이 아니라 브라우저가 보낸 원래 값으로 고른다(no-transform이면 에지가 다시 바꿔 주지 않는다)", () => {
    const encoding = (request: Request) => withHtmlNoTransform(request, page()).headers.get("content-encoding");

    expect(encoding(visitThroughEdge("gzip"))).toBe("gzip");
    expect(encoding(visitThroughEdge("br;q=0, gzip"))).toBe("gzip");
    expect(encoding(visitThroughEdge("identity"))).toBeNull();
    expect(encoding(visitThroughEdge(""))).toBeNull();
    expect(encoding(visitThroughEdge("gzip, deflate, br, zstd", "gzip"))).toBe("br");
    expect(encoding(visitThroughEdge(null, "gzip"))).toBe("gzip");
  });

  it("압축하면 원래 길이는 지우고 기존 Vary 뒤에 Accept-Encoding을 더한다", () => {
    const result = withHtmlNoTransform(visit("br"), page({ "content-length": "88", vary: "rsc, next-router-state-tree" }));

    expect(result.headers.get("content-length")).toBeNull();
    expect(result.headers.get("vary")).toBe("rsc, next-router-state-tree, Accept-Encoding");
  });

  it("본문 없는 응답은 압축 방식을 붙이지 않는다", () => {
    const result = withHtmlNoTransform(visit("br"), new Response(null, { status: 304, headers: { "content-type": "text/html" } }));

    expect(result.status).toBe(304);
    expect(result.headers.get("content-encoding")).toBeNull();
    expect(result.headers.get("cache-control")).toBe("no-transform");
  });

  it("이미 압축된 HTML은 본문·압축 방식은 그대로 두고 no-transform만 더한다", async () => {
    const original = page({ "content-encoding": "gzip", "cache-control": "s-maxage=60" });
    const result = withHtmlNoTransform(visit("br"), original);

    expect(result).toBe(original);
    expect(result.headers.get("content-encoding")).toBe("gzip");
    expect(result.headers.get("cache-control")).toBe("s-maxage=60, no-transform");
    expect(await result.text()).toBe(html);
  });

  it("HTML이 아닌 응답(RSC·JSON·그림)은 손대지 않는다", () => {
    for (const type of ["text/x-component", "application/json", "image/png"]) {
      const original = new Response("x", { headers: { "content-type": type, "cache-control": "public, max-age=60" } });
      const result = withHtmlNoTransform(visit("br"), original);

      expect(result).toBe(original);
      expect(result.headers.get("cache-control")).toBe("public, max-age=60");
    }
  });

  it("상태 코드·상태 문구·보안 헤더·쿠키는 그대로 넘긴다", () => {
    const original = page(
      { "content-security-policy": "default-src 'self'", "set-cookie": "a=1; Path=/" },
      { status: 404, statusText: "Not Found" },
    );
    const result = withHtmlNoTransform(visit("br"), original);

    expect(result.status).toBe(404);
    expect(result.statusText).toBe("Not Found");
    expect(result.headers.get("content-security-policy")).toBe("default-src 'self'");
    expect(result.headers.get("set-cookie")).toBe("a=1; Path=/");
  });
});
