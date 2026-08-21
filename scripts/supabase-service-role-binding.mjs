import {
  serverSupabaseAdminKeyIssue,
  supabaseProjectUrlIssue,
} from "./deploy-env-policy.mjs";
import { projectRefIssue } from "./supabase-cli-policy.mjs";
import { HOSTED_RUNTIME_CONTRACT } from "./verify-hosted-runtime-policy.mjs";

export const SERVICE_ROLE_PROBE_TIMEOUT_MS = 5_000;
export const SERVICE_ROLE_PROBE_MAX_BYTES = 4 * 1024;
export const SERVICE_ROLE_PROBE_PATH = "/rest/v1/rpc/get_ilgamcheck_service_role_contract";

class SupabaseServiceRoleBindingError extends Error {
  constructor(message) {
    super(message);
    this.name = "SupabaseServiceRoleBindingError";
  }
}

function bindingFailure(message) {
  return new SupabaseServiceRoleBindingError(message);
}

function probeHeaders(serviceRoleKey) {
  const headers = {
    Accept: "application/json",
    apikey: serviceRoleKey,
    "Content-Type": "application/json",
  };

  // New Supabase API keys are opaque and belong only in `apikey`. Legacy
  // service_role JWTs also need to be the PostgREST bearer identity.
  if (!serviceRoleKey.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${serviceRoleKey}`;
  }
  return headers;
}

async function readBoundedBody(response, maxBytes, signal) {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw bindingFailure("Supabase service-role probe 응답 크기 헤더가 올바르지 않습니다.");
    }
    if (Number(contentLength) > maxBytes) {
      throw bindingFailure("Supabase service-role probe 응답이 허용 크기를 초과했습니다.");
    }
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    throw bindingFailure("Supabase service-role probe 응답 본문을 안전하게 읽을 수 없습니다.");
  }

  let rejectOnAbort;
  const aborted = new Promise((_resolve, reject) => {
    rejectOnAbort = reject;
  });
  const onAbort = () => {
    void reader.cancel().catch(() => {});
    rejectOnAbort(bindingFailure("Supabase service-role probe가 제한 시간 안에 응답하지 않았습니다."));
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });

  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      // Response streams may be produced by a different JS realm (for example
      // undici inside a test worker), so `instanceof Uint8Array` is too narrow.
      if (Object.prototype.toString.call(value) !== "[object Uint8Array]") {
        throw bindingFailure("Supabase service-role probe 응답 형식이 올바르지 않습니다.");
      }
      const chunk = Uint8Array.from(value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw bindingFailure("Supabase service-role probe 응답이 허용 크기를 초과했습니다.");
      }
      chunks.push(chunk);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(merged);
  } catch {
    throw bindingFailure("Supabase service-role probe 응답이 유효한 UTF-8이 아닙니다.");
  }
}

export async function verifySupabaseServiceRoleBinding({
  projectUrl,
  expectedProjectRef,
  serviceRoleKey,
  expectedRuntimeContract = HOSTED_RUNTIME_CONTRACT,
  fetchImpl = globalThis.fetch,
  timeoutMs = SERVICE_ROLE_PROBE_TIMEOUT_MS,
  maxBytes = SERVICE_ROLE_PROBE_MAX_BYTES,
} = {}) {
  const urlIssue = supabaseProjectUrlIssue(projectUrl);
  if (urlIssue) throw bindingFailure(`Supabase service-role probe URL: ${urlIssue}`);

  const refIssue = projectRefIssue(expectedProjectRef);
  if (refIssue) throw bindingFailure(`Supabase service-role probe project ref: ${refIssue}`);

  const normalizedUrl = projectUrl.trim();
  const urlRef = new URL(normalizedUrl).hostname.replace(/\.supabase\.co$/, "");
  if (urlRef !== expectedProjectRef) {
    throw bindingFailure("Supabase service-role probe URL과 연결된 project ref가 다릅니다.");
  }

  const keyIssue = serverSupabaseAdminKeyIssue(serviceRoleKey);
  if (keyIssue) throw bindingFailure(`SUPABASE_SERVICE_ROLE_KEY: ${keyIssue}`);
  if (typeof expectedRuntimeContract !== "string" || !/^\d{12}$/.test(expectedRuntimeContract)) {
    throw bindingFailure("Supabase service-role probe runtime contract가 올바르지 않습니다.");
  }
  if (typeof fetchImpl !== "function") {
    throw bindingFailure("Supabase service-role probe fetch 구현이 없습니다.");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw bindingFailure("Supabase service-role probe 제한 시간이 올바르지 않습니다.");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 64 || maxBytes > 64 * 1024) {
    throw bindingFailure("Supabase service-role probe 응답 제한이 올바르지 않습니다.");
  }

  const normalizedKey = serviceRoleKey.trim();
  const endpoint = new URL(SERVICE_ROLE_PROBE_PATH, normalizedUrl).href;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response;
  let receivedResponse = false;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: probeHeaders(normalizedKey),
      body: "{}",
      cache: "no-store",
      redirect: "manual",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    receivedResponse = true;
    if (!response || typeof response.status !== "number" || !response.headers) {
      throw bindingFailure("Supabase service-role probe 응답 형식이 올바르지 않습니다.");
    }
    if (response.type === "opaqueredirect" || response.redirected || (response.status >= 300 && response.status < 400)) {
      throw bindingFailure("Supabase service-role probe는 redirect를 허용하지 않습니다.");
    }
    if (response.url !== endpoint) {
      throw bindingFailure("Supabase service-role probe 응답 origin 또는 경로가 바뀌었습니다.");
    }
    if (!response.ok) {
      throw bindingFailure("SUPABASE_SERVICE_ROLE_KEY가 연결된 Supabase 프로젝트에서 거부되었습니다.");
    }

    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      throw bindingFailure("Supabase service-role probe 응답이 JSON이 아닙니다.");
    }

    const rawBody = await readBoundedBody(response, maxBytes, controller.signal);
    if (controller.signal.aborted) {
      throw bindingFailure("Supabase service-role probe가 제한 시간 안에 응답하지 않았습니다.");
    }
    let contract;
    try {
      contract = JSON.parse(rawBody);
    } catch {
      throw bindingFailure("Supabase service-role probe JSON을 해석할 수 없습니다.");
    }
    if (contract !== expectedRuntimeContract) {
      throw bindingFailure("연결된 Supabase 프로젝트의 runtime contract가 현재 소스와 다릅니다.");
    }
    if (controller.signal.aborted) {
      throw bindingFailure("Supabase service-role probe가 제한 시간 안에 응답하지 않았습니다.");
    }

    return Object.freeze({
      projectRef: expectedProjectRef,
      runtimeContract: expectedRuntimeContract,
    });
  } catch (error) {
    if (timedOut) {
      throw bindingFailure("Supabase service-role probe가 제한 시간 안에 응답하지 않았습니다.");
    }
    if (error instanceof SupabaseServiceRoleBindingError) throw error;
    throw bindingFailure(
      receivedResponse
        ? "Supabase service-role probe 응답 검증에 실패했습니다."
        : "Supabase service-role probe 요청에 실패했습니다.",
    );
  } finally {
    clearTimeout(timer);
  }
}
