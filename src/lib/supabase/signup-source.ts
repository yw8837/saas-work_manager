import type { SupabaseClient } from "@supabase/supabase-js";

import { clearPendingAcquisition, readPendingAcquisition } from "@/lib/acquisition-link";

let inFlight = false;

/**
 * 받아 둔 유입 경로를 서버에 한 번 남긴다(약관 동의가 끝난 뒤에만 부른다).
 * 서버가 받았든(true) 새 계정이 아니라 안 받았든(false) 보관 값은 지운다.
 * 서버·연결 오류면 남겨 두어 다음 화면에서 다시 시도한다. 실패해도 화면에는 아무것도 알리지 않는다.
 */
export async function recordPendingSignupSource(client: SupabaseClient | null): Promise<void> {
  const acquisition = readPendingAcquisition();
  if (!acquisition || !client || inFlight) return;
  inFlight = true;
  try {
    const { error } = await client.rpc("record_signup_source", {
      p_source: acquisition.source,
      p_medium: acquisition.medium,
      p_campaign: acquisition.campaign,
    });
    if (!error) clearPendingAcquisition();
  } catch {
    // 예외로 온 오류도 같다: 보관 값을 남겨 다음에 다시 시도한다.
  } finally {
    inFlight = false;
  }
}
