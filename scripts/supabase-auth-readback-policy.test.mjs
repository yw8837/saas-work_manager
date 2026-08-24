import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AUTH_READBACK_MAX_BYTES,
  SUPABASE_MANAGEMENT_ORIGIN,
  supabaseAuthConfigIssue,
  supabaseAuthReadbackIssue,
} from "./supabase-auth-readback-policy.mjs";

const projectRef = "abcdefghijklmnopqrst";
const expectedOrigin = "https://preview.example.com";
const accessToken = "sbp_private-test-token";

function authResponse(overrides = {}, options = {}) {
  return Response.json({
    site_url: `${expectedOrigin}/`,
    disable_signup: false,
    external_email_enabled: true,
    uri_allow_list: `${expectedOrigin}/auth/reset`,
    ...overrides,
  }, options);
}

describe("Supabase Auth Management API readback policy", () => {
  it("uses only the fixed GET endpoint and validates public email signup", async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url).toBeInstanceOf(URL);
      expect(url.href).toBe(`${SUPABASE_MANAGEMENT_ORIGIN}/v1/projects/${projectRef}/config/auth`);
      expect(options).toMatchObject({ method: "GET", cache: "no-store", redirect: "manual" });
      expect(options.headers.Accept).toBe("application/json");
      expect(options.headers.Authorization).toBe(`Bearer ${accessToken}`);
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return authResponse();
    });

    await expect(supabaseAuthReadbackIssue({
      projectRef,
      expectedOrigin,
      accessToken,
      fetchImpl,
    })).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("requires an exact normalized site URL, public signup, and enabled email login", () => {
    expect(supabaseAuthConfigIssue({
      site_url: "https://other.example.com",
      disable_signup: false,
      external_email_enabled: true,
      uri_allow_list: `${expectedOrigin}/auth/reset`,
    }, expectedOrigin)).toMatch(/site_url/);

    expect(supabaseAuthConfigIssue({
      site_url: expectedOrigin,
      disable_signup: true,
      external_email_enabled: true,
      uri_allow_list: `${expectedOrigin}/auth/reset`,
    }, expectedOrigin)).toMatch(/disable_signup/);

    expect(supabaseAuthConfigIssue({
      site_url: expectedOrigin,
      disable_signup: false,
      external_email_enabled: false,
      uri_allow_list: `${expectedOrigin}/auth/reset`,
    }, expectedOrigin)).toMatch(/external_email_enabled/);

    expect(supabaseAuthConfigIssue({
      site_url: expectedOrigin,
      disable_signup: false,
    }, expectedOrigin)).toMatch(/external_email_enabled/);
  });

  it("accepts only the one literal reset URL in string or array form", () => {
    const publicConfig = {
      site_url: expectedOrigin,
      disable_signup: false,
      external_email_enabled: true,
    };
    const resetUrl = `${expectedOrigin}/auth/reset`;

    expect(supabaseAuthConfigIssue({
      ...publicConfig,
      uri_allow_list: resetUrl,
    }, expectedOrigin)).toBeNull();
    expect(supabaseAuthConfigIssue({
      ...publicConfig,
      uri_allow_list: [resetUrl],
    }, expectedOrigin)).toBeNull();

    const rejectedAllowLists = [
      undefined,
      "",
      [],
      `${resetUrl},https://evil.example/auth/reset`,
      [resetUrl, "https://evil.example/auth/reset"],
      [resetUrl, resetUrl],
      `${expectedOrigin}/*`,
      "https://old-preview.example.com/auth/reset",
      `https://user:pass@preview.example.com/auth/reset`,
      `${resetUrl}?next=evil`,
      `${resetUrl}#evil`,
      `${resetUrl}/`,
      "https://PREVIEW.example.com/auth/reset",
      `${expectedOrigin}/auth/%72eset`,
      ` ${resetUrl}`,
    ];

    for (const uriAllowList of rejectedAllowLists) {
      expect(supabaseAuthConfigIssue({
        ...publicConfig,
        uri_allow_list: uriAllowList,
      }, expectedOrigin)).toMatch(/uri_allow_list/);
    }
  });

  it("rejects a malicious remote allow-list even when all other auth fields are valid", async () => {
    const maliciousAllowLists = [
      `${expectedOrigin}/auth/reset,https://evil.example/auth/reset`,
      `${expectedOrigin}/*`,
      [
        `${expectedOrigin}/auth/reset`,
        "https://old-preview.example.com/auth/reset",
      ],
    ];

    for (const uriAllowList of maliciousAllowLists) {
      await expect(supabaseAuthReadbackIssue({
        projectRef,
        expectedOrigin,
        accessToken,
        fetchImpl: async () => authResponse({ uri_allow_list: uriAllowList }),
      })).resolves.toMatch(/uri_allow_list/);
    }
  });

  it("fails before fetch when ref, origin, or shell-only token is missing", async () => {
    const fetchImpl = vi.fn();
    await expect(supabaseAuthReadbackIssue({
      projectRef: "../../attacker",
      expectedOrigin,
      accessToken,
      fetchImpl,
    })).resolves.toMatch(/20자리/);
    await expect(supabaseAuthReadbackIssue({
      projectRef,
      expectedOrigin: "http://preview.example.com",
      accessToken,
      fetchImpl,
    })).resolves.toMatch(/HTTPS/);
    await expect(supabaseAuthReadbackIssue({ projectRef, expectedOrigin, fetchImpl }))
      .resolves.toMatch(/현재 shell/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not follow redirects or accept a response from another endpoint", async () => {
    await expect(supabaseAuthReadbackIssue({
      projectRef,
      expectedOrigin,
      accessToken,
      fetchImpl: async (_url, options) => {
        expect(options.redirect).toBe("manual");
        return new Response(null, { status: 302, headers: { location: "https://evil.example/config" } });
      },
    })).resolves.toMatch(/redirect/);

    const wrongUrlResponse = authResponse();
    Object.defineProperty(wrongUrlResponse, "url", { value: `${SUPABASE_MANAGEMENT_ORIGIN}/v1/projects/${projectRef}/config/auth?leak=1` });
    await expect(supabaseAuthReadbackIssue({
      projectRef,
      expectedOrigin,
      accessToken,
      fetchImpl: async () => wrongUrlResponse,
    })).resolves.toMatch(/고정 endpoint/);
  });

  it("fails closed on permissions, non-JSON, invalid JSON, and oversized bodies", async () => {
    await expect(supabaseAuthReadbackIssue({
      projectRef,
      expectedOrigin,
      accessToken,
      fetchImpl: async () => Response.json({ message: "denied" }, { status: 403 }),
    })).resolves.toMatch(/auth_config_read.*403/);

    await expect(supabaseAuthReadbackIssue({
      projectRef,
      expectedOrigin,
      accessToken,
      fetchImpl: async () => new Response("ok", { headers: { "content-type": "text/plain" } }),
    })).resolves.toMatch(/content-type/);

    await expect(supabaseAuthReadbackIssue({
      projectRef,
      expectedOrigin,
      accessToken,
      fetchImpl: async () => new Response("{", { headers: { "content-type": "application/json" } }),
    })).resolves.toMatch(/해석/);

    await expect(supabaseAuthReadbackIssue({
      projectRef,
      expectedOrigin,
      accessToken,
      fetchImpl: async () => new Response("{}", {
        headers: {
          "content-type": "application/json",
          "content-length": String(DEFAULT_AUTH_READBACK_MAX_BYTES + 1),
        },
      }),
    })).resolves.toMatch(/byte 제한/);

    await expect(supabaseAuthReadbackIssue({
      projectRef,
      expectedOrigin,
      accessToken,
      maxResponseBytes: 16,
      fetchImpl: async () => authResponse(),
    })).resolves.toMatch(/byte 제한/);
  });

  it("never reflects the token or a remote/network error body in returned issues", async () => {
    const networkIssue = await supabaseAuthReadbackIssue({
      projectRef,
      expectedOrigin,
      accessToken,
      fetchImpl: async () => { throw new Error(`network ${accessToken}`); },
    });
    expect(networkIssue).toMatch(/네트워크/);
    expect(networkIssue).not.toContain(accessToken);

    const permissionIssue = await supabaseAuthReadbackIssue({
      projectRef,
      expectedOrigin,
      accessToken,
      fetchImpl: async () => Response.json({ message: accessToken }, { status: 401 }),
    });
    expect(permissionIssue).toMatch(/401/);
    expect(permissionIssue).not.toContain(accessToken);
  });
});
