import { describe, expect, it, vi } from "vitest";
import { handleAccountDeletion } from "./account-delete";

const now = Math.floor(new Date("2026-08-24T00:00:00.000Z").getTime() / 1_000);

function accessToken(payload: Record<string, unknown> = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "ES256", typ: "JWT" })}.${encode({
    sub: "owner-a",
    role: "authenticated",
    amr: [{ method: "password", timestamp: now - 30 }],
    ...payload,
  })}.signature`;
}

function request({
  origin = "https://beta.example.test",
  fetchSite = "same-origin",
  token = accessToken(),
  confirmation = "DELETE_ACCOUNT",
}: {
  origin?: string;
  fetchSite?: string;
  token?: string;
  confirmation?: string;
} = {}) {
  return new Request("https://beta.example.test/api/account/delete", {
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

const environment = {
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-secret",
};

describe("Sites account deletion", () => {
  it("rejects a cross-origin request before it talks to Supabase", async () => {
    const requestFn = vi.fn();
    const response = await handleAccountDeletion(
      request({ origin: "https://attacker.example.test" }),
      environment,
      requestFn,
      now,
    );

    expect(response.status).toBe(403);
    expect(requestFn).not.toHaveBeenCalled();
  });

  it("deletes only the user verified from the recent-password access token", async () => {
    const requestFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "owner-a" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const response = await handleAccountDeletion(request(), environment, requestFn, now);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(requestFn.mock.calls[0]?.[0]).toBe(`${environment.SUPABASE_URL}/auth/v1/user`);
    expect(requestFn.mock.calls[1]?.[0]).toBe(`${environment.SUPABASE_URL}/auth/v1/admin/users/owner-a`);
    expect(requestFn.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
  });
});
