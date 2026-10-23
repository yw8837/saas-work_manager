import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getAdmin: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server-admin", () => ({
  getSupabaseAdminClient: mocked.getAdmin,
}));

import { POST } from "./route";

const ORIGINAL_ENV = { ...process.env };
const NOW_SECONDS = Math.floor(new Date("2026-08-16T12:00:00.000Z").getTime() / 1_000);

function accessToken(payload: Record<string, unknown> = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "ES256", typ: "JWT" })}.${encode({
    sub: "owner-a",
    role: "authenticated",
    amr: [{ method: "oauth", timestamp: NOW_SECONDS - 30 }],
    ...payload,
  })}.test-signature`;
}

function deleteRequest({
  origin = "https://beta.ilgamcheck.test",
  fetchSite = "same-origin",
  token = accessToken(),
  confirmation = "DELETE_ACCOUNT",
}: {
  origin?: string;
  fetchSite?: string;
  token?: string;
  confirmation?: string;
} = {}) {
  return new Request("https://beta.ilgamcheck.test/api/account/delete", {
    method: "POST",
    headers: {
      Origin: origin,
      "Sec-Fetch-Site": fetchSite,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Ilgamcheck-Delete-Confirm": confirmation,
    },
    body: JSON.stringify({ confirmation }),
  });
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_SECONDS * 1_000));
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    mocked.getUser.mockResolvedValue({
      data: { user: { id: "owner-a" } },
      error: null,
    });
    mocked.deleteUser.mockResolvedValue({ data: { user: null }, error: null });
    mocked.getAdmin.mockReturnValue({
      auth: {
        getUser: mocked.getUser,
        admin: { deleteUser: mocked.deleteUser },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it("rejects cross-origin and non-browser deletion requests before authentication", async () => {
    const crossOrigin = await POST(deleteRequest({ origin: "https://attacker.test" }));
    expect(crossOrigin.status).toBe(403);

    const missingFetchMetadata = await POST(deleteRequest({ fetchSite: "none" }));
    expect(missingFetchMetadata.status).toBe(403);
    expect(mocked.getUser).not.toHaveBeenCalled();
  });
  it.each(["https://localhost", "capacitor://localhost"])("preserves verified-token deletion for native origin %s", async (origin) => {
    const response = await POST(deleteRequest({ origin, fetchSite: "cross-site" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(mocked.deleteUser).toHaveBeenCalledWith("owner-a", false);
  });

  it("requires the confirmation in both a custom header and JSON body", async () => {
    const badHeader = await POST(deleteRequest({ confirmation: "WRONG" }));
    expect(badHeader.status).toBe(400);

    const request = deleteRequest();
    const badBody = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ confirmation: "WRONG" }),
    });
    const response = await POST(badBody);
    expect(response.status).toBe(400);
    expect(mocked.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects an oversized body even when content-length is omitted", async () => {
    const request = deleteRequest();
    const oversized = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ confirmation: "DELETE_ACCOUNT", padding: "x".repeat(2_000) }),
    });
    oversized.headers.delete("content-length");

    const response = await POST(oversized);
    expect(response.status).toBe(413);
    expect(mocked.getUser).not.toHaveBeenCalled();
  });

  it("fails closed when the server-only admin client is not configured", async () => {
    mocked.getAdmin.mockReturnValue(null);
    const response = await POST(deleteRequest());
    expect(response.status).toBe(503);
    expect(mocked.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects an expired access token", async () => {
    mocked.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    const token = accessToken();
    const response = await POST(deleteRequest({ token }));
    expect(response.status).toBe(401);
    expect(mocked.getUser).toHaveBeenCalledWith(token);
    expect(mocked.deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ["missing AMR", { amr: undefined }],
    ["refresh-only AMR", { amr: [{ method: "refresh_token", timestamp: NOW_SECONDS - 5 }] }],
    ["password AMR", { amr: [{ method: "password", timestamp: NOW_SECONDS - 5 }] }],
    ["old OAuth AMR", { amr: [{ method: "oauth", timestamp: NOW_SECONDS - 301 }] }],
    ["future OAuth AMR", { amr: [{ method: "oauth", timestamp: NOW_SECONDS + 1 }] }],
    ["wrong subject", { sub: "owner-b" }],
  ])("rejects %s after server-side token verification", async (_label, payload) => {
    const token = accessToken(payload);
    const response = await POST(deleteRequest({ token }));

    expect(response.status).toBe(401);
    expect(mocked.getUser).toHaveBeenCalledWith(token);
    expect(mocked.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects a malformed token payload even when getUser is mocked as valid", async () => {
    const response = await POST(deleteRequest({ token: "not.a-valid-json.signature" }));
    expect(response.status).toBe(401);
    expect(mocked.getUser).toHaveBeenCalledWith("not.a-valid-json.signature");
    expect(mocked.deleteUser).not.toHaveBeenCalled();
  });

  it("accepts a recent Google OAuth AMR and derives the only deletion target from the verified token", async () => {
    const token = accessToken({
      amr: [
        { method: "oauth", timestamp: NOW_SECONDS - 300 },
        { method: "oauth", timestamp: NOW_SECONDS - 2 },
      ],
    });
    const response = await POST(deleteRequest({ token }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocked.getUser).toHaveBeenCalledWith(token);
    expect(mocked.deleteUser).toHaveBeenCalledWith("owner-a", false);
  });
});
