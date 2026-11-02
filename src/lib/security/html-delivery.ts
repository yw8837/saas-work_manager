/**
 * HTML 응답에 `Cache-Control: no-transform`을 붙여 Cloudflare 에지가 본문을 고치지 못하게 한다.
 * 운영 주소에 우리 계정에 없는 Web Analytics 스크립트가 끼워져 CSP에 막히며 콘솔 오류를 남겼다(2026-11-03 확인,
 * 도메인 RUM 꺼짐·계정 사이트 목록에 없음). no-transform이면 에지 압축도 꺼지므로 Content-Encoding을 여기서 정하고
 * 압축은 Workers 런타임에 맡긴다(Response의 encodeBody 기본값 "automatic").
 */
export function withHtmlNoTransform(request: Request, response: Response): Response {
  if (!/^text\/html\b/i.test(response.headers.get("content-type") ?? "")) return response;

  if (response.headers.has("content-encoding")) {
    // 이미 압축된 본문과 방식은 그대로 두고 표시만 더한다. 헤더를 못 바꾸는 응답(fetch 결과)은 감싸되
    // 본문을 읽지 않으므로 런타임이 다시 압축하지 않고 그대로 넘긴다.
    try {
      addNoTransform(response.headers);
      return response;
    } catch {
      const wrapped = new Response(response.body, response);
      addNoTransform(wrapped.headers);
      return wrapped;
    }
  }

  const result = new Response(response.body, response);
  addNoTransform(result.headers);
  if (result.body) {
    const encoding = preferredEncoding(clientAcceptEncoding(request));
    if (encoding) {
      result.headers.set("content-encoding", encoding);
      result.headers.delete("content-length");
    }
    result.headers.append("vary", "Accept-Encoding");
  }
  return result;
}

function addNoTransform(headers: Headers): void {
  const cacheControl = headers.get("cache-control");
  if (!cacheControl) headers.set("cache-control", "no-transform");
  else if (!/(?:^|,)\s*no-transform\s*(?:,|$)/i.test(cacheControl)) headers.set("cache-control", `${cacheControl}, no-transform`);
}

/**
 * 브라우저가 보낸 원래 Accept-Encoding. 에지는 이 헤더를 바꿔 넘기고 원래 값을 `cf.clientAcceptEncoding`에 둔다.
 * no-transform이면 에지가 브라우저에 맞게 다시 압축해 주지 않으므로 바뀐 값으로 고르면 못 푸는 압축을 보낼 수 있다.
 */
function clientAcceptEncoding(request: Request): string | null {
  const original = (request as Request & { cf?: { clientAcceptEncoding?: string | null } }).cf?.clientAcceptEncoding;
  return typeof original === "string" ? original : request.headers.get("accept-encoding");
}

/** 런타임이 압축할 수 있는 br·gzip 중 브라우저가 받는 것. `q=0`은 거절로 본다. */
function preferredEncoding(acceptEncoding: string | null): "br" | "gzip" | null {
  const weights = new Map<string, number>();
  for (const part of (acceptEncoding ?? "").toLowerCase().split(",")) {
    const [name, ...params] = part.split(";").map((value) => value.trim());
    if (!name) continue;
    const quality = params.find((param) => param.startsWith("q="));
    weights.set(name, quality ? Number(quality.slice(2)) : 1);
  }
  const accepts = (name: string) => (weights.get(name) ?? weights.get("*") ?? 0) > 0;
  if (accepts("br")) return "br";
  if (accepts("gzip")) return "gzip";
  return null;
}
