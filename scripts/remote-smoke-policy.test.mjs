import { describe, expect, it } from "vitest";
import {
  normalizeDeploymentUrl,
  runRemoteSmoke,
  securityHeaderIssues,
} from "./remote-smoke-policy.mjs";
import { POLICY_PUBLICATION_EXPECTED } from "./runtime-contract-readback-policy.mjs";

const secureHeaders = {
  "content-security-policy": "default-src 'self'; object-src 'none'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=()",
};
const projectRef = "abcdefghijklmnopqrst";

function successfulFetch(url) {
  const path = new URL(url).pathname;
  if (path === "/api/health") {
    const policyDatabaseContract = {
      finalized: POLICY_PUBLICATION_EXPECTED.finalized,
      bundleDigest: POLICY_PUBLICATION_EXPECTED.bundleDigest,
      termsVersion: POLICY_PUBLICATION_EXPECTED.termsVersion,
      privacyVersion: POLICY_PUBLICATION_EXPECTED.privacyVersion,
    };
    return Promise.resolve(Response.json({
      status: "ok",
      ready: true,
      service: "ilgamcheck",
      version: "0.1.0",
      runtimeRequested: "hosted",
      runtimeEffective: "hosted",
      hostedConfigured: true,
      hostedAdapterReady: true,
      supabaseProjectRefConfigured: projectRef,
      publicConfigDigest: `sha256:${"1".repeat(64)}`,
      publicIdentityConfigured: true,
      closedBetaConfigured: true,
      databaseContractExpected: "202608170006",
      databaseContractDetected: "202608170006",
      serviceRoleContractCurrent: true,
      policyPublication: {
        ...POLICY_PUBLICATION_EXPECTED,
        databaseExpected: policyDatabaseContract,
        databaseDetected: policyDatabaseContract,
        databaseMatches: true,
      },
    }, { headers: { "cache-control": "no-store" } }));
  }
  if (["/", "/today", "/auth/reset", "/privacy", "/terms"].includes(path)) {
    return Promise.resolve(new Response("<!doctype html>", {
      headers: { "content-type": "text/html; charset=utf-8", ...secureHeaders },
    }));
  }
  if (path === "/manifest.webmanifest") {
    return Promise.resolve(Response.json({
      name: "일감체크",
      start_url: "/today?source=pwa",
      icons: [{ src: "/icons/app-icon.svg" }],
    }));
  }
  if (path === "/icons/app-icon.svg") {
    return Promise.resolve(new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }));
  }
  if (path === "/sw.js") {
    return Promise.resolve(new Response("self.addEventListener('install', () => {});", {
      headers: { "content-type": "application/javascript" },
    }));
  }
  return Promise.resolve(new Response("missing", { status: 404 }));
}

describe("remote deployment smoke policy", () => {
  it("normalizes a Vercel host and rejects insecure targets", () => {
    expect(normalizeDeploymentUrl("preview.vercel.app").href).toBe("https://preview.vercel.app/");
    expect(() => normalizeDeploymentUrl("http://preview.vercel.app")).toThrow(/HTTPS/);
  });

  it("rejects a missing production security header", () => {
    const headers = new Headers(secureHeaders);
    headers.delete("strict-transport-security");
    expect(securityHeaderIssues(headers)).toContain("strict-transport-security 누락");
  });

  it("checks health, app routes and PWA assets without credentials", async () => {
    const result = await runRemoteSmoke("https://preview.vercel.app", successfulFetch);
    expect(result.baseUrl).toBe("https://preview.vercel.app");
    expect(result.checks).toContain(
      `health(hosted/configured/ref:${projectRef}/db:202608170006/service-role:current/policy:${POLICY_PUBLICATION_EXPECTED.bundleDigest}/no-store)`,
    );
    expect(result.checks).toContain("/privacy(html/security-headers)");
    expect(result.checks).toContain("/terms(html/security-headers)");
    expect(result.checks).toContain("manifest+icons");
    expect(result.checks).toContain("service-worker");
  });

  it("fails closed when the deployed runtime is local", async () => {
    const localHealthFetch = async (url, options) => {
      if (new URL(url).pathname === "/api/health") {
        return Response.json({ status: "ok", ready: true, service: "ilgamcheck", runtimeRequested: "local", hostedConfigured: false }, {
          headers: { "cache-control": "no-store" },
        });
      }
      return successfulFetch(url, options);
    };
    await expect(runRemoteSmoke("https://preview.vercel.app", localHealthFetch)).rejects.toThrow(/Hosted/);
  });

  it("fails closed when health omits the configured Supabase project ref", async () => {
    const missingRefFetch = async (url, options) => {
      if (new URL(url).pathname === "/api/health") {
        const response = await successfulFetch(url, options);
        const body = await response.json();
        delete body.supabaseProjectRefConfigured;
        return Response.json(body, { headers: { "cache-control": "no-store" } });
      }
      return successfulFetch(url, options);
    };

    await expect(runRemoteSmoke("https://preview.vercel.app", missingRefFetch))
      .rejects.toThrow(/project ref/);
  });

  it("fails closed when the deployed service-role binding is false, missing, or schema is extended", async () => {
    for (const mode of ["false", "missing", "extra"]) {
      const mutatedHealthFetch = async (url, options) => {
        if (new URL(url).pathname === "/api/health") {
          const response = await successfulFetch(url, options);
          const body = await response.json();
          if (mode === "false") body.serviceRoleContractCurrent = false;
          if (mode === "missing") delete body.serviceRoleContractCurrent;
          if (mode === "extra") body.serviceRoleProbeError = "must-not-be-public";
          return Response.json(body, { headers: { "cache-control": "no-store" } });
        }
        return successfulFetch(url, options);
      };

      await expect(runRemoteSmoke("https://preview.vercel.app", mutatedHealthFetch))
        .rejects.toThrow(mode === "extra" ? /top-level schema/ : /service-role key/);
    }
  });

  it("rejects protocol-relative manifest assets before any external fetch", async () => {
    const fetchedOrigins = [];
    const maliciousManifestFetch = async (url, options) => {
      fetchedOrigins.push(new URL(url).origin);
      if (new URL(url).pathname === "/manifest.webmanifest") {
        return Response.json({
          name: "일감체크",
          start_url: "/today",
          icons: [{ src: "//127.0.0.1/internal" }],
        });
      }
      return successfulFetch(url, options);
    };

    await expect(runRemoteSmoke("https://preview.vercel.app", maliciousManifestFetch)).rejects.toThrow(/icon 경로/);
    expect(fetchedOrigins).not.toContain("https://127.0.0.1");
  });

  it("does not follow deployment redirects", async () => {
    const redirectingFetch = async (url, options) => {
      if (new URL(url).pathname === "/api/health") {
        expect(options.redirect).toBe("manual");
        return new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/internal" },
        });
      }
      return successfulFetch(url, options);
    };

    await expect(runRemoteSmoke("https://preview.vercel.app", redirectingFetch)).rejects.toThrow(/HTTP 302/);
  });

  it("rejects an unexpected policy-page redirect", async () => {
    const redirectingPolicyFetch = async (url, options) => {
      if (new URL(url).pathname === "/privacy") {
        expect(options.redirect).toBe("manual");
        return new Response(null, { status: 307, headers: { location: "/login" } });
      }
      return successfulFetch(url, options);
    };

    await expect(runRemoteSmoke("https://preview.vercel.app", redirectingPolicyFetch))
      .rejects.toThrow(/\/privacy: HTTP 307/);
  });

  it("rejects deployed policy digest drift and draft policy at the external-beta boundary", async () => {
    const driftedPolicyFetch = async (url, options) => {
      if (new URL(url).pathname === "/api/health") {
        const response = await successfulFetch(url, options);
        const body = await response.json();
        body.policyPublication.bundleDigest = `sha256:${"0".repeat(64)}`;
        return Response.json(body, { headers: { "cache-control": "no-store" } });
      }
      return successfulFetch(url, options);
    };
    await expect(runRemoteSmoke("https://preview.vercel.app", driftedPolicyFetch))
      .rejects.toThrow(/privacy\/terms bundle/);

    expect(POLICY_PUBLICATION_EXPECTED.finalized).toBe(false);
    await expect(runRemoteSmoke(
      "https://preview.vercel.app",
      successfulFetch,
      { requirePolicyFinalized: true },
    )).rejects.toThrow(/finalized=true/);
  });
});
