import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOSTED_RUNTIME_CONTRACT } from "./verify-hosted-runtime-policy.mjs";
import {
  SERVICE_ROLE_PROBE_MAX_BYTES,
  SERVICE_ROLE_PROBE_PATH,
  verifySupabaseServiceRoleBinding,
} from "./supabase-service-role-binding.mjs";

const projectRef = "abcdefghijklmnopqrst";
const projectUrl = `https://${projectRef}.supabase.co`;
const endpoint = `${projectUrl}${SERVICE_ROLE_PROBE_PATH}`;
const secretKey = "sb_secret_exact_project_binding_test";

function legacyServiceRoleJwt() {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  return `${header}.${payload}.test-signature`;
}

function jsonResponse(value, { status = 200, url = endpoint, headers = {} } = {}) {
  const response = new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
  Object.defineProperty(response, "url", { configurable: true, value: url });
  return response;
}

function responseFromExactEndpoint(body, init) {
  const response = new Response(body, init);
  Object.defineProperty(response, "url", { configurable: true, value: endpoint });
  return response;
}

function validInput(overrides = {}) {
  return {
    projectUrl,
    expectedProjectRef: projectRef,
    serviceRoleKey: secretKey,
    fetchImpl: vi.fn(async () => jsonResponse(HOSTED_RUNTIME_CONTRACT)),
    ...overrides,
  };
}

describe("Supabase service-role target binding", () => {
  it("ships a data-free RPC executable only by service_role at the current contract", () => {
    // 계약 함수를 마지막으로 정의한 migration이 현재 계약이다.
    // 파일 이름을 박아두면 계약을 올릴 때마다 여기가 낡는다.
    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const serviceRoleFile = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .filter((name) => readFileSync(join(migrationsDir, name), "utf8")
        .includes("function public.get_ilgamcheck_service_role_contract()"))
      .at(-1);
    const migration = readFileSync(join(migrationsDir, serviceRoleFile), "utf8");
    expect(migration).toMatch(/create or replace function public\.get_ilgamcheck_service_role_contract\(\)[\s\S]*?stable/);
    expect(migration).toMatch(new RegExp(`select '${HOSTED_RUNTIME_CONTRACT}'::text`));
    expect(migration).toMatch(
      /revoke all on function public\.get_ilgamcheck_service_role_contract\(\) from public, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.get_ilgamcheck_service_role_contract\(\) to service_role;/,
    );
  });

  it("probes only the exact linked runtime-contract RPC before accepting a new secret key", async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url).toBe(endpoint);
      expect(options).toMatchObject({
        method: "POST",
        body: "{}",
        cache: "no-store",
        redirect: "manual",
        referrerPolicy: "no-referrer",
      });
      expect(options.headers).toMatchObject({
        Accept: "application/json",
        apikey: secretKey,
        "Content-Type": "application/json",
      });
      expect(options.headers).not.toHaveProperty("Authorization");
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return jsonResponse(HOSTED_RUNTIME_CONTRACT);
    });

    await expect(verifySupabaseServiceRoleBinding(validInput({ fetchImpl }))).resolves.toEqual({
      projectRef,
      runtimeContract: HOSTED_RUNTIME_CONTRACT,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses a legacy service_role JWT as both apikey and bearer without putting it in URL/body", async () => {
    const legacyKey = legacyServiceRoleJwt();
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url).not.toContain(legacyKey);
      expect(options.body).not.toContain(legacyKey);
      expect(options.headers.apikey).toBe(legacyKey);
      expect(options.headers.Authorization).toBe(`Bearer ${legacyKey}`);
      return jsonResponse(HOSTED_RUNTIME_CONTRACT);
    });

    await expect(verifySupabaseServiceRoleBinding(validInput({
      serviceRoleKey: legacyKey,
      fetchImpl,
    }))).resolves.toMatchObject({ projectRef });
  });

  it("rejects URL/ref mismatch locally and never sends the key", async () => {
    const fetchImpl = vi.fn();
    await expect(verifySupabaseServiceRoleBinding(validInput({
      expectedProjectRef: "12345678901234567890",
      fetchImpl,
    }))).rejects.toThrow(/URL과 연결된 project ref/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a browser publishable key before the role-only RPC", async () => {
    const fetchImpl = vi.fn();
    await expect(verifySupabaseServiceRoleBinding(validInput({
      serviceRoleKey: "sb_publishable_not_an_admin_key",
      fetchImpl,
    }))).rejects.toThrow(/Supabase secret key 또는 legacy service_role JWT/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed on rejected credentials without exposing response body, URL query, or key", async () => {
    const hostileBody = `${secretKey} https://attacker.test/?token=${secretKey}`;
    let error;
    try {
      await verifySupabaseServiceRoleBinding(validInput({
        fetchImpl: vi.fn(async () => jsonResponse(hostileBody, { status: 401 })),
      }));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/거부/);
    expect(error.message).not.toContain(secretKey);
    expect(error.message).not.toContain("attacker.test");
  });

  it("never follows redirects and rejects a forged successful response URL", async () => {
    const redirectFetch = vi.fn(async (_url, options) => {
      expect(options.redirect).toBe("manual");
      return new Response(null, {
        status: 302,
        headers: { location: "https://attacker.test/collect" },
      });
    });
    await expect(verifySupabaseServiceRoleBinding(validInput({ fetchImpl: redirectFetch })))
      .rejects.toThrow(/redirect/);

    await expect(verifySupabaseServiceRoleBinding(validInput({
      fetchImpl: vi.fn(async () => jsonResponse(HOSTED_RUNTIME_CONTRACT, {
        url: "https://attacker.test/rest/v1/rpc/get_ilgamcheck_service_role_contract",
      })),
    }))).rejects.toThrow(/origin 또는 경로/);
  });

  it("requires JSON and the exact current runtime contract", async () => {
    await expect(verifySupabaseServiceRoleBinding(validInput({
      fetchImpl: vi.fn(async () => responseFromExactEndpoint(JSON.stringify(HOSTED_RUNTIME_CONTRACT), {
        headers: { "content-type": "text/plain" },
      })),
    }))).rejects.toThrow(/JSON이 아닙니다/);

    await expect(verifySupabaseServiceRoleBinding(validInput({
      fetchImpl: vi.fn(async () => jsonResponse("199901010001")),
    }))).rejects.toThrow(/runtime contract/);

    await expect(verifySupabaseServiceRoleBinding(validInput({
      fetchImpl: vi.fn(async () => responseFromExactEndpoint("not-json", {
        headers: { "content-type": "application/json" },
      })),
    }))).rejects.toThrow(/JSON을 해석/);
  });

  it("rejects oversized declared and streamed bodies before parsing", async () => {
    await expect(verifySupabaseServiceRoleBinding(validInput({
      fetchImpl: vi.fn(async () => jsonResponse(HOSTED_RUNTIME_CONTRACT, {
        headers: { "content-length": String(SERVICE_ROLE_PROBE_MAX_BYTES + 1) },
      })),
    }))).rejects.toThrow(/허용 크기/);

    const oversized = `"${"x".repeat(SERVICE_ROLE_PROBE_MAX_BYTES)}"`;
    await expect(verifySupabaseServiceRoleBinding(validInput({
      fetchImpl: vi.fn(async () => responseFromExactEndpoint(oversized, {
        headers: { "content-type": "application/json" },
      })),
    }))).rejects.toThrow(/허용 크기/);
  });

  it("aborts on timeout and sanitizes arbitrary transport exceptions", async () => {
    const hangingFetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error(`transport leaked ${secretKey}`)), { once: true });
    }));
    let timeoutError;
    try {
      await verifySupabaseServiceRoleBinding(validInput({ fetchImpl: hangingFetch, timeoutMs: 1 }));
    } catch (caught) {
      timeoutError = caught;
    }
    expect(timeoutError.message).toMatch(/제한 시간/);
    expect(timeoutError.message).not.toContain(secretKey);

    const stalledBody = new ReadableStream({ start() {} });
    const stalledResponse = responseFromExactEndpoint(stalledBody, {
      headers: { "content-type": "application/json" },
    });
    await expect(verifySupabaseServiceRoleBinding(validInput({
      fetchImpl: vi.fn(async () => stalledResponse),
      timeoutMs: 1,
    }))).rejects.toThrow(/제한 시간/);

    let transportError;
    try {
      await verifySupabaseServiceRoleBinding(validInput({
        fetchImpl: vi.fn(async () => { throw new Error(`network ${secretKey}`); }),
      }));
    } catch (caught) {
      transportError = caught;
    }
    expect(transportError.message).toBe("Supabase service-role probe 요청에 실패했습니다.");
    expect(transportError.message).not.toContain(secretKey);
  });
});
