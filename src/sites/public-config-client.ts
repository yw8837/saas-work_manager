import {
  ILGAMCHECK_PUBLIC_ENV_KEYS,
  type IlgamcheckPublicEnvironment,
  type IlgamcheckPublicEnvironmentKey,
} from "@/lib/public-environment";
import { deploymentOrigin } from "@/lib/deployment-origin";
import { nativeApiUrl, nativePlatform } from "@/lib/native/platform";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const publicKeySet = new Set<string>(ILGAMCHECK_PUBLIC_ENV_KEYS);

export function publicConfigEndpoint(locationLike: { hostname: string } = globalThis.location): string {
  if (nativePlatform() !== "web") return nativeApiUrl("/api/public-config");
  // The existing localhost Sites preview also reads its deployed public config.
  return locationLike.hostname === "localhost" ? `${deploymentOrigin()}/api/public-config` : "/api/public-config";
}

function parsePublicEnvironment(payload: unknown): IlgamcheckPublicEnvironment {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("PUBLIC_CONFIG_INVALID");
  }
  const config = (payload as { config?: unknown }).config;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("PUBLIC_CONFIG_INVALID");
  }

  const result: IlgamcheckPublicEnvironment = {};
  for (const [key, value] of Object.entries(config)) {
    if (!publicKeySet.has(key) || typeof value !== "string") {
      throw new Error("PUBLIC_CONFIG_INVALID");
    }
    result[key as IlgamcheckPublicEnvironmentKey] = value;
  }
  if (
    result.NEXT_PUBLIC_STORAGE_MODE !== "hosted"
    || !result.NEXT_PUBLIC_SUPABASE_URL
    || !result.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error("PUBLIC_CONFIG_INVALID");
  }
  return result;
}

export async function loadSitesPublicEnvironment(request: FetchLike = fetch): Promise<void> {
  const response = await request(publicConfigEndpoint(), {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("PUBLIC_CONFIG_UNAVAILABLE");
  globalThis.__ILGAMCHECK_PUBLIC_ENV__ = parsePublicEnvironment(await response.json());
}
