import { getPublicEnvironmentValue } from "@/lib/public-environment";

export type StorageMode = "local" | "hosted";

export type HostedRuntimeBoundary = {
  requestedMode: StorageMode;
  effectiveMode: StorageMode;
  configured: boolean;
  supabaseProjectRefConfigured: string | null;
  adapterReady: boolean;
  blockedExternal: boolean;
  reason: string | null;
};

const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

export function requestedStorageMode(): StorageMode {
  return getPublicEnvironmentValue("NEXT_PUBLIC_STORAGE_MODE") === "hosted" ? "hosted" : "local";
}

export function configuredSupabaseProjectRef(
  rawUrl = getPublicEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL"),
): string | null {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;

  try {
    const url = new URL(rawUrl.trim());
    const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.port
      || url.search
      || url.hash
      || !["", "/"].includes(url.pathname)
      || !match
      || !SUPABASE_PROJECT_REF_PATTERN.test(match[1])
    ) {
      return null;
    }
    return match[1];
  } catch {
    return null;
  }
}

export function hasSupabasePublicConfiguration(): boolean {
  return Boolean(
    configuredSupabaseProjectRef() &&
    getPublicEnvironmentValue("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}

export function isHostedAdapterExplicitlyReady(): boolean {
  return true;
}

export function getHostedRuntimeBoundary(): HostedRuntimeBoundary {
  const requestedMode = requestedStorageMode();
  const supabaseProjectRefConfigured = configuredSupabaseProjectRef();
  const configured = hasSupabasePublicConfiguration();
  const adapterReady = isHostedAdapterExplicitlyReady();
  const hostedReady = requestedMode === "hosted" && configured && adapterReady;

  return {
    requestedMode,
    effectiveMode: hostedReady ? "hosted" : "local",
    configured,
    supabaseProjectRefConfigured,
    adapterReady,
    blockedExternal: !hostedReady,
    reason: hostedReady
      ? null
      : requestedMode === "hosted"
        ? "Supabase 공개 URL/anon key가 없어 로컬 모드로 제한됩니다."
        : "로컬 모드에서는 다른 기기의 고객 수정 링크와 Web Push를 사용할 수 없습니다."
  };
}
