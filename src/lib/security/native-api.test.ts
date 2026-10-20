import { expect, it } from "vitest";
import { nativeApiPreflight, trustedAccountDeletionOrigin, withNativeApiCors } from "./native-api";

function preflight(origin = "https://localhost", method = "POST", headers = "authorization,content-type,x-ilgamcheck-delete-confirm", path = "/api/account/delete") {
  return new Request(`https://ilgam.studioyeolmae.com${path}`, {
    method: "OPTIONS",
    headers: { origin, "access-control-request-method": method, "access-control-request-headers": headers },
  });
}
it.each(["https://localhost", "capacitor://localhost"])("permits only the native API contract from %s", (origin) => {
  const response = nativeApiPreflight(preflight(origin));
  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  expect(response.headers.has("Access-Control-Allow-Credentials")).toBe(false);
});
it.each([
  ["https://attacker.test", "POST", "authorization", "/api/account/delete"],
  ["http://localhost", "POST", "authorization", "/api/account/delete"],
  ["https://localhost:443", "POST", "authorization", "/api/account/delete"],
  ["https://localhost", "DELETE", "authorization", "/api/account/delete"],
  ["https://localhost", "POST", "x-admin-secret", "/api/account/delete"],
  ["https://localhost", "POST", "authorization", "/api/health"],
])("rejects a broader preflight %s %s %s %s", (origin, method, headers, path) => {
  expect(nativeApiPreflight(preflight(origin, method, headers, path)).status).toBe(403);
});
it("does not permit a missing origin or forged normal cross-site request", () => {
  expect(trustedAccountDeletionOrigin(new Request("https://example.test/api/account/delete"))).toBe(false);
  expect(trustedAccountDeletionOrigin(new Request("https://example.test/api/account/delete", {
    headers: { origin: "https://example.test", "sec-fetch-site": "cross-site" },
  }))).toBe(false);
});
it("adds readable CORS to native failures without reflecting arbitrary origins or removing Vary", () => {
  const response = withNativeApiCors(new Response("denied", { status: 401, headers: { vary: "Accept-Encoding" } }), preflight());
  expect(response.status).toBe(401);
  expect(response.headers.get("vary")).toContain("Accept-Encoding");
  expect(response.headers.get("vary")).toContain("Origin");
  expect(withNativeApiCors(new Response("no"), preflight("https://evil.test")).headers.has("Access-Control-Allow-Origin")).toBe(false);
});
