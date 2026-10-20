import { describe, expect, it, vi } from "vitest";
import { handleAccountDeletion } from "./account-delete";

const now = Math.floor(new Date("2026-08-24T00:00:00.000Z").getTime() / 1_000);

function accessToken(payload: Record<string, unknown> = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "ES256", typ: "JWT" })}.${encode({
    sub: "owner-a",
    role: "authenticated",
    amr: [{ method: "oauth", timestamp: now - 30 }],
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
  it.each(["https://localhost", "capacitor://localhost"])("authenticates a native deletion from %s and returns scoped CORS", async (origin) => {
    const requestFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "owner-a" })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const response = await handleAccountDeletion(request({ origin, fetchSite: "cross-site" }), environment, requestFn, now);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(requestFn).toHaveBeenCalledTimes(2);
  });
  it("native origin does not bypass token, confirmation or recent authentication", async () => {
    const requestFn = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: "owner-a" }))));
    for (const fields of [
      { token: "" },
      { confirmation: "WRONG" },
      { token: accessToken({ amr: [{ method: "oauth", timestamp: now - 86_400 }] }) },
    ]) {
      const response = await handleAccountDeletion(request({ origin: "https://localhost", fetchSite: "cross-site", ...fields }), environment, requestFn, now);
      expect([400,401]).toContain(response.status);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://localhost");
    }
    expect(requestFn).toHaveBeenCalledTimes(1);
  });
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

  it("never sends the service-role key to a non-Supabase URL", async () => {
    const requestFn = vi.fn();
    const response = await handleAccountDeletion(
      request(),
      {
        ...environment,
        SUPABASE_URL: "https://attacker.example.test",
      },
      requestFn,
      now,
    );

    expect(response.status).toBe(503);
    expect(requestFn).not.toHaveBeenCalled();
  });

  it("deletes only the user verified from a recent Google OAuth access token", async () => {
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

  it("rejects a password token because the service uses Google-only login", async () => {
    const requestFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "owner-a" }), { status: 200 }));
    const response = await handleAccountDeletion(request({
      token: accessToken({ amr: [{ method: "password", timestamp: now - 30 }] }),
    }), environment, requestFn, now);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      message: "Google로 다시 본인 확인한 뒤 시도해주세요.",
    });
  });

  it("fails closed when any Google AMR entry has a malformed timestamp", async () => {
    const requestFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "owner-a" }), { status: 200 }));
    const response = await handleAccountDeletion(request({
      token: accessToken({
        amr: [
          { method: "oauth", timestamp: "not-a-number" },
          { method: "oauth", timestamp: now - 30 },
        ],
      }),
    }), environment, requestFn, now);

    expect(response.status).toBe(401);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });
});
