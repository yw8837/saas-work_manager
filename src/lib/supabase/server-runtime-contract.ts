import { ILGAMCHECK_RUNTIME_CONTRACT } from "./runtime-contract";

const SERVICE_ROLE_CONTRACT_PATH = "/rest/v1/rpc/get_ilgamcheck_service_role_contract";
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024;

type ServerContractProbeOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

function exactSupabaseOrigin(rawUrl: unknown): string | null {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;
  try {
    const url = new URL(rawUrl.trim());
    if (
      url.protocol !== "https:"
      || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)
      || url.username
      || url.password
      || url.port
      || url.search
      || url.hash
      || !["", "/"].includes(url.pathname)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function isServerAdminKey(rawKey: unknown): rawKey is string {
  if (typeof rawKey !== "string") return false;
  const key = rawKey.trim();
  if (key.startsWith("sb_secret_") && key.length > "sb_secret_".length) return true;

  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as unknown;
    return Boolean(
      payload
      && typeof payload === "object"
      && !Array.isArray(payload)
      && (payload as { role?: unknown }).role === "service_role",
    );
  } catch {
    return false;
  }
}

function serviceRoleHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    apikey: key,
    "Content-Type": "application/json",
  };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function readBoundedUtf8(response: Response, maxBytes: number): Promise<string | null> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes) return null;
  }

  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (Object.prototype.toString.call(value) !== "[object Uint8Array]") return null;
    const chunk = Uint8Array.from(value);
    total += chunk.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(chunk);
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
    return null;
  }
}

/**
 * Server route only. It exposes no key, response body, or transport error and
 * returns only whether the currently deployed service-role key is bound to the
 * exact configured project and current data-free DB contract.
 */
export async function probeHostedServiceRoleContract(
  projectUrl: unknown = process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: unknown = process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  }: ServerContractProbeOptions = {},
): Promise<boolean> {
  const origin = exactSupabaseOrigin(projectUrl);
  if (!origin || !isServerAdminKey(serviceRoleKey)) return false;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) return false;
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 64 || maxResponseBytes > 64 * 1024) {
    return false;
  }

  const key = serviceRoleKey.trim();
  const endpoint = `${origin}${SERVICE_ROLE_CONTRACT_PATH}`;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const request = async (): Promise<boolean> => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: serviceRoleHeaders(key),
      body: "{}",
      cache: "no-store",
      redirect: "manual",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (
      response.status !== 200
      || response.redirected
      || response.type === "opaqueredirect"
      || response.url !== endpoint
      || response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json"
    ) {
      return false;
    }

    const rawBody = await readBoundedUtf8(response, maxResponseBytes);
    if (rawBody === null) return false;
    let contract: unknown;
    try {
      contract = JSON.parse(rawBody) as unknown;
    } catch {
      return false;
    }
    return !controller.signal.aborted && contract === ILGAMCHECK_RUNTIME_CONTRACT;
  };

  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, timeoutMs);
  });

  try {
    return await Promise.race([request(), timeout]);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
