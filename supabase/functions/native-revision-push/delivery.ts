export type Claim = {
  request_id: string; device_id: string; lease_id: string; token: string; platform: string; job_key: string;
};
export type DeliveryResult = "sent" | "retry" | "invalid" | "discarded";
type Dependencies = {
  claim(limit: number): Promise<Claim[]>;
  current(claim: Claim): Promise<boolean>;
  send(claim: Claim): Promise<DeliveryResult>;
  finish(claim: Claim, result: DeliveryResult): Promise<void>;
};
export function revisionMessage(claim: Claim) {
  return { message: {
    token: claim.token,
    notification: { title: "일감체크", body: "새 수정 요청이 도착했어요" },
    data: { type: "revision", request_id: claim.request_id, job_key: claim.job_key },
    android: { priority: "high", ttl: "3600s", notification: {
      channel_id: "revisions", tag: claim.request_id,
    } },
    apns: { headers: { "apns-push-type": "alert", "apns-priority": "10", "apns-collapse-id": claim.request_id },
      payload: { aps: { sound: "default" } } },
  } };
}
export function classifyFcmResponse(status: number, body: unknown): DeliveryResult {
  const data=body as { name?: unknown; error?: { details?: { "@type"?: string; errorCode?: string }[] } } | null;
  if (status===200 && typeof data?.name==="string") return "sent";
  if (data?.error?.details?.some((detail) => detail["@type"]==="type.googleapis.com/google.firebase.fcm.v1.FcmError"
    && detail.errorCode==="UNREGISTERED")) return "invalid";
  if (status===408 || status===429 || status>=500 || status===401 || status===403) return "retry";
  return "discarded";
}
/** 'sent' means FCM accepted it, never proof that a phone displayed it. */
export async function deliverBatch(now: Date, limit: number, deps: Dependencies) {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(limit) || limit<1 || limit>25) throw new Error("invalid batch");
  const stats={sent:0,retrying:0,discarded:0};
  const claims=await deps.claim(limit);
  for (const claim of claims) {
    let result: DeliveryResult="discarded";
    try {
      if (await deps.current(claim)) result=await deps.send(claim);
    } catch { result="retry"; }
    // Failed ACK leaves a leased item for a later retry, not a fabricated success.
    await deps.finish(claim,result);
    if (result==="sent") stats.sent++;
    else if (result==="retry") stats.retrying++;
    else stats.discarded++;
  }
  return stats;
}
