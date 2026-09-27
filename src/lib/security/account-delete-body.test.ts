import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAccountDeletion } from "@/sites/account-delete";
import { POST } from "@/app/api/account/delete/route";

const admin = vi.hoisted(() => ({ get: vi.fn(() => null) }));
vi.mock("@/lib/supabase/server-admin", () => ({ getSupabaseAdminClient: admin.get }));

const handlers = [
  ["Sites", (request: Request) => handleAccountDeletion(request, {})],
  ["Next", POST],
] as const;

function deletionRequest(body: ReadableStream<Uint8Array>, length?: string) {
  const headers = new Headers({
    Origin: "https://ilgam.example.test",
    "Sec-Fetch-Site": "same-origin",
    Authorization: "Bearer deliberately-unverified",
    "Content-Type": "application/json",
    "X-Ilgamcheck-Delete-Confirm": "DELETE_ACCOUNT",
  });
  if (length !== undefined) headers.set("Content-Length", length);
  return new Request("https://ilgam.example.test/api/account/delete", {
    method: "POST", headers, body, duplex: "half",
  } as RequestInit);
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe.each(handlers)("%s account deletion body boundary", (_label, handle) => {
  it.each([undefined, "1"])("stops at 1025 bytes, without trusting length %s", async (length) => {
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        if (pulls <= 4) controller.enqueue(new Uint8Array(pulls === 1 ? 1024 : 1));
        else controller.close();
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const response = await handle(deletionRequest(body, length));
    expect(response.status).toBe(413);
    expect(pulls).toBe(2);
    expect(cancelled).toBe(true);
    expect(admin.get).not.toHaveBeenCalled();
  });

  it("ends a stalled upload after five seconds without waiting for cancellation", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() { cancelled = true; return new Promise(() => {}); },
    }, { highWaterMark: 0 });
    const pending = handle(deletionRequest(body));
    await vi.advanceTimersByTimeAsync(5001);
    const response = await Promise.race([pending, Promise.resolve(null)]);
    expect(response?.status).toBe(408);
    expect(cancelled).toBe(true);
    expect(admin.get).not.toHaveBeenCalled();
  });

  it("accepts exactly 1024 bytes and split UTF-8 before checking server configuration", async () => {
    const prefix = JSON.stringify({ confirmation: "DELETE_ACCOUNT", padding: "한" });
    const bytes = new TextEncoder().encode(prefix + " ".repeat(1024 - new TextEncoder().encode(prefix).length));
    let index = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < bytes.length) controller.enqueue(bytes.slice(index, ++index));
        else controller.close();
      },
    }, { highWaterMark: 0 });
    // No server credentials: 503 proves the body passed validation, no real deletion.
    expect((await handle(deletionRequest(body))).status).toBe(503);
  });

  it("rejects invalid UTF-8 rather than silently replacing it", async () => {
    const prefix = new TextEncoder().encode('{"confirmation":"DELETE_ACCOUNT","padding":"');
    const suffix = new TextEncoder().encode('"}');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([...prefix, 0xff, ...suffix]));
        controller.close();
      },
    });
    expect((await handle(deletionRequest(body))).status).toBe(400);
    expect(admin.get).not.toHaveBeenCalled();
  });
});
