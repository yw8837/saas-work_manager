// OpenNext가 만든 fetch 처리기를 그대로 쓰고, HTML 응답만 에지가 고치지 못하게 감싼다(src/lib/security/html-delivery.ts).
// 진입 파일을 바꾸는 방법: https://opennext.js.org/cloudflare/howtos/custom-worker
// @ts-expect-error `.open-next/worker.js`는 빌드 때 생기고 타입 선언이 없다.
import { default as handler } from "./.open-next/worker.js";
import { withHtmlNoTransform } from "./src/lib/security/html-delivery";

const worker = {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    return withHtmlNoTransform(request, await handler.fetch(request, env, ctx));
  },
};

export default worker;
