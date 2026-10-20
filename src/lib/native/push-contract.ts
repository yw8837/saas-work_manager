export function parseRevisionNotification(data: unknown): { requestId: string; jobKey: string } | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  if (value.type !== "revision"
    || typeof value.request_id !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.request_id)
    || typeof value.job_key !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(value.job_key)) return null;
  return { requestId: value.request_id, jobKey: value.job_key };
}
