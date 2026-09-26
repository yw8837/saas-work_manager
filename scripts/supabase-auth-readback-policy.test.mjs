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
const expectedRedirects = `${expectedOrigin}/today,${expectedOrigin}/settings`;

function authResponse(overrides = {}, options = {}) {
  return Response.json({
    site_url: `${expectedOrigin}/`,
    disable_signup: false,
    external_email_enabled: false,
    external_google_enabled: true,
    uri_allow_list: expectedRedirects,
    ...overrides,
  }, options);
}

describe("Supabase Auth Management API readback policy", () => {
  it("rejects wildcard legacy configuration before contacting Management API", async () => {
    const fetchImpl = vi.fn();
    expect(await supabaseAuthReadbackIssue({ projectRef, expectedOrigin, legacyOrigin: "https://%2A.example.com", accessToken, fetchImpl })).not.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts only explicit old/new callbacks during migration, with no wildcard or extra origins", async () => {
    const legacyOrigin = "https://old.example.com";
    const callbacks = `${expectedRedirects},https://old.example.com/today,https://old.example.com/settings`;
    const config = await authResponse({ uri_allow_list: callbacks }).json();
    expect(supabaseAuthConfigIssue(config, expectedOrigin, legacyOrigin)).toBeNull();
    expect(supabaseAuthConfigIssue(config, expectedOrigin)).toMatch(/uri_allow_list/);
    expect(supabaseAuthConfigIssue({ ...config, uri_allow_list: `${callbacks},https://evil.example/today` }, expectedOrigin, legacyOrigin)).toMatch(/uri_allow_list/);
    expect(supabaseAuthConfigIssue(config, expectedOrigin, "https://old.example.com/*")).not.toBeNull();
    await expect(supabaseAuthReadbackIssue({ projectRef, expectedOrigin, legacyOrigin, accessToken, fetchImpl: async () => authResponse({ uri_allow_list: callbacks }) })).resolves.toBeNull();
  });

  it("uses only the fixed GET endpoint and validates public Google signup", async () => {
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

  it("requires an exact normalized site URL, public signup, Google enabled, and email disabled", () => {
    expect(supabaseAuthConfigIssue({
      site_url: "https://other.example.com",
      disable_signup: false,
      external_email_enabled: false,
      external_google_enabled: true,
      uri_allow_list: expectedRedirects,
    }, expectedOrigin)).toMatch(/site_url/);

    expect(supabaseAuthConfigIssue({
      site_url: expectedOrigin,
      disable_signup: true,
      external_email_enabled: false,
      external_google_enabled: true,
      uri_allow_list: expectedRedirects,
    }, expectedOrigin)).toMatch(/disable_signup/);

    expect(supabaseAuthConfigIssue({
      site_url: expectedOrigin,
      disable_signup: false,
      external_email_enabled: false,
      external_google_enabled: false,
      uri_allow_list: expectedRedirects,
    }, expectedOrigin)).toMatch(/external_google_enabled/);

    expect(supabaseAuthConfigIssue({
      site_url: expectedOrigin,
      disable_signup: false,
      external_email_enabled: true,
      external_google_enabled: true,
      uri_allow_list: expectedRedirects,
    }, expectedOrigin)).toMatch(/external_email_enabled/);
  });

  it("accepts only the two literal OAuth return URLs in string or array form", () => {
    const publicConfig = {
      site_url: expectedOrigin,
      disable_signup: false,
      external_email_enabled: false,
      external_google_enabled: true,
    };
    const todayUrl = `${expectedOrigin}/today`;
    const settingsUrl = `${expectedOrigin}/settings`;

    expect(supabaseAuthConfigIssue({
      ...publicConfig,
      uri_allow_list: `${todayUrl},${settingsUrl}`,
    }, expectedOrigin)).toBeNull();
    expect(supabaseAuthConfigIssue({
      ...publicConfig,
      uri_allow_list: [todayUrl, settingsUrl],
    }, expectedOrigin)).toBeNull();

    const rejectedAllowLists = [
      undefined,
      "",
      [],
      todayUrl,
      settingsUrl,
      `${todayUrl},https://evil.example/today`,
      [todayUrl, "https://evil.example/today"],
      [todayUrl, todayUrl],
      [settingsUrl, todayUrl],
      `${expectedOrigin}/*`,
      "https://old-preview.example.com/today",
      `https://user:pass@preview.example.com/today`,
      `${todayUrl}?next=evil,${settingsUrl}`,
      `${todayUrl}#evil,${settingsUrl}`,
      `${todayUrl}/,${settingsUrl}`,
      "https://PREVIEW.example.com/today",
      `${expectedOrigin}/%74oday`,
      ` ${todayUrl},${settingsUrl}`,
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
      `${expectedOrigin}/today,${expectedOrigin}/settings,https://evil.example/today`,
      `${expectedOrigin}/*`,
      [
        `${expectedOrigin}/today`,
        `${expectedOrigin}/settings`,
        "https://old-preview.example.com/today",
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
