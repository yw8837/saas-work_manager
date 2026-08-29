import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { configuredSupabaseProjectRef } from "./mode";

let adminClient: SupabaseClient | null = null;

function isServerAdminKey(value: string): boolean {
  if (value.startsWith("sb_secret_") && value.length > "sb_secret_".length) return true;

  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: unknown };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

/**
 * Server route 전용 관리자 클라이언트다. 이 모듈은 브라우저 코드나 supabase/index.ts에서
 * 내보내지 않는다. SUPABASE_SERVICE_ROLE_KEY는 반드시 서버 환경변수로만 주입한다.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (process.env.NEXT_PUBLIC_STORAGE_MODE !== "hosted") return null;

  const projectRef = configuredSupabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!projectRef || !key || !isServerAdminKey(key)) return null;
  if (adminClient) return adminClient;

  adminClient = createClient(`https://${projectRef}.supabase.co`, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Client-Info": "ilgamcheck-account-delete/0.1" },
    },
  });
  return adminClient;
}
