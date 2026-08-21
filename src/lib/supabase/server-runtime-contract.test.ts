import { afterEach, describe, expect, it, vi } from "vitest";

import { ILGAMCHECK_RUNTIME_CONTRACT } from "./runtime-contract";
import { probeHostedServiceRoleContract } from "./server-runtime-contract";

const projectRef = "abcdefghijklmnopqrst";
const projectUrl = `https://${projectRef}.supabase.co`;
const endpoint = `${projectUrl}/rest/v1/rpc/get_ilgamcheck_service_role_contract`;
const secretKey = "sb_secret_server_runtime_binding_test";

function responseAtEndpoint(
  body: BodyInit | null = JSON.stringify(ILGAMCHECK_RUNTIME_CONTRACT),
  init: ResponseInit = {},
  url = endpoint,
) {
  const response = new Response(body, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });
  Object.defineProperty(response, "url", { configurable: true, value: url });
  return response;
}

function legacyServiceRoleJwt() {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  return `${header}.${payload}.test-signature`;
}

afterEach(() => vi.useRealTimers());

describe("deployed service-role runtime contract", () => {
  it("uses the exact project role-only RPC and keeps a new secret out of URL/body/bearer", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      expect(String(url)).toBe(endpoint);
      expect(String(url)).not.toContain(secretKey);
      expect(options).toMatchObject({
        method: "POST",
        body: "{}",
        cache: "no-store",
        redirect: "manual",
        referrerPolicy: "no-referrer",
      });
      expect(options?.headers).toMatchObject({
        Accept: "application/json",
        apikey: secretKey,
        "Content-Type": "application/json",
      });
      expect(options?.headers).not.toHaveProperty("Authorization");
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return responseAtEndpoint();
    });

    await expect(probeHostedServiceRoleContract(projectUrl, secretKey, { fetchImpl }))
      .resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("supports only a legacy service_role JWT as bearer", async () => {
    const legacyKey = legacyServiceRoleJwt();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      expect(options?.headers).toMatchObject({
        apikey: legacyKey,
        Authorization: `Bearer ${legacyKey}`,
      });
      return responseAtEndpoint();
    });

    await expect(probeHostedServiceRoleContract(projectUrl, legacyKey, { fetchImpl }))
      .resolves.toBe(true);
  });

  it("rejects missing, public, malformed, and non-exact project configuration before fetch", async () => {
    const fetchImpl = vi.fn();
    for (const [url, key] of [
      [projectUrl, undefined],
      [projectUrl, "sb_publishable_public_key"],
      [projectUrl, "not-a-server-key"],
      ["https://evil.example", secretKey],
      [`https://${projectRef}.supabase.co/path`, secretKey],
      [`http://${projectRef}.supabase.co`, secretKey],
    ]) {
      await expect(probeHostedServiceRoleContract(url, key, { fetchImpl })).resolves.toBe(false);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed on rejection, redirect, changed URL, content type, size, and contract drift", async () => {
    const cases = [
      responseAtEndpoint(`"${secretKey}"`, { status: 401 }),
      responseAtEndpoint(null, { status: 302, headers: { location: "https://evil.example/collect" } }),
      responseAtEndpoint(undefined, {}, "https://evil.example/rest/v1/rpc/get_ilgamcheck_service_role_contract"),
      responseAtEndpoint("plain", { headers: { "content-type": "text/plain" } }),
      responseAtEndpoint(JSON.stringify(ILGAMCHECK_RUNTIME_CONTRACT), {
        headers: { "content-type": "application/json", "content-length": "4097" },
      }),
      responseAtEndpoint(JSON.stringify("stale-contract")),
      responseAtEndpoint("not-json"),
    ];

    for (const response of cases) {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      await expect(probeHostedServiceRoleContract(projectUrl, secretKey, {
        fetchImpl: vi.fn(async () => response),
      })).resolves.toBe(false);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it("times out both a stalled request and a stalled response body", async () => {
    vi.useFakeTimers();
    const pendingRequest = probeHostedServiceRoleContract(projectUrl, secretKey, {
      fetchImpl: vi.fn(() => new Promise<Response>(() => undefined)),
      timeoutMs: 5,
    });
    await vi.advanceTimersByTimeAsync(5);
    await expect(pendingRequest).resolves.toBe(false);

    const stalledBody = new ReadableStream<Uint8Array>({ start() {} });
    const pendingBody = probeHostedServiceRoleContract(projectUrl, secretKey, {
      fetchImpl: vi.fn(async () => responseAtEndpoint(stalledBody)),
      timeoutMs: 5,
    });
    await vi.advanceTimersByTimeAsync(5);
    await expect(pendingBody).resolves.toBe(false);
  });
});
