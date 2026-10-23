import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getHostedRuntimeBoundary } from "./mode";
import { getPublicEnvironmentValue } from "@/lib/public-environment";
import { nativePlatform } from "@/lib/native/platform";
import { createSecureSessionStore } from "@/lib/native/secure-storage";

let browserClient: SupabaseClient | null = null;

/**
 * Browser anon client only. Never put a service-role key in NEXT_PUBLIC_*.
 * Returns null in local mode so callers cannot accidentally imply sync.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const boundary = getHostedRuntimeBoundary();
  if (boundary.effectiveMode !== "hosted") return null;
  if (browserClient) return browserClient;

  const url = getPublicEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getPublicEnvironmentValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;

  const platform = nativePlatform();
  browserClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: platform === "web",
      ...(platform !== "web" ? {
        flowType: "pkce" as const,
        storage: createSecureSessionStore(),
      } : {}),
    },
    global: {
      headers: { "X-Client-Info": `ilgamcheck-${platform}/0.1` }
    }
  });
  return browserClient;
}
