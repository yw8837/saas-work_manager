import { HOSTED_RUNTIME_CONTRACT } from "./verify-hosted-runtime-policy.mjs";
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
      signupPolicyConfigured: true,
      databaseContractExpected: HOSTED_RUNTIME_CONTRACT,
      databaseContractDetected: HOSTED_RUNTIME_CONTRACT,
      serviceRoleContractCurrent: true,
      policyPublication: {
        ...POLICY_PUBLICATION_EXPECTED,
        databaseExpected: policyDatabaseContract,
        databaseDetected: policyDatabaseContract,
        databaseMatches: true,
      },
    }, { headers: { "cache-control": "no-store" } }));
  }
  if (path === "/today") {
    return Promise.resolve(new Response('<!doctype html><meta name="robots" content="noindex, nofollow">', {
      headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", ...secureHeaders },
    }));
  }
  if (path === "/") {
    return Promise.resolve(new Response(
      '<!doctype html><link rel="canonical" href="https://preview.vercel.app/"><meta property="og:image" content="https://preview.vercel.app/og/ilgamcheck-social.png">',
      { headers: { "content-type": "text/html; charset=utf-8", ...secureHeaders } },
    ));
  }
  if (["/guide", "/privacy", "/terms"].includes(path)) {
    return Promise.resolve(new Response("<!doctype html>", {
      headers: { "content-type": "text/html; charset=utf-8", ...secureHeaders },
    }));
  }
  if (path === "/robots.txt") {
    return Promise.resolve(new Response("User-agent: *\nAllow: /\n\nSitemap: https://preview.vercel.app/sitemap.xml\n", {
      headers: { "content-type": "text/plain; charset=utf-8" },
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
      `health(hosted/configured/ref:${projectRef}/db:${HOSTED_RUNTIME_CONTRACT}/service-role:current/policy:${POLICY_PUBLICATION_EXPECTED.bundleDigest}/no-store)`,
    );
    expect(result.checks).toContain("/privacy(html/security-headers)");
    expect(result.checks).toContain("/terms(html/security-headers)");
    expect(result.checks).toContain("/guide(html/security-headers)");
    expect(result.checks).toContain("manifest+icons");
    expect(result.checks).toContain("service-worker");
  });

  it("checks search exposure: robots.txt sitemap, workspace noindex, indexable public pages, landing canonical and og:image", async () => {
    const result = await runRemoteSmoke("https://preview.vercel.app", successfulFetch);
    expect(result.checks).toContain("robots.txt(sitemap)");
    expect(result.checks).toContain("/today(noindex)");
    expect(result.checks).toContain("public-pages(indexable)");
    expect(result.checks).toContain("/(canonical/og:image)");
  });

  it("fails when the workspace is missing its X-Robots-Tag noindex header", async () => {
    const indexableWorkspaceFetch = async (url, options) => {
      if (new URL(url).pathname === "/today") {
        return new Response("<!doctype html>", { headers: { "content-type": "text/html; charset=utf-8", ...secureHeaders } });
      }
      return successfulFetch(url, options);
    };
    await expect(runRemoteSmoke("https://preview.vercel.app", indexableWorkspaceFetch)).rejects.toThrow(/\/today: .*noindex/);
  });

  it("fails when a public page carries noindex in its header or robots meta", async () => {
    for (const [path, headers, body] of [
      ["/guide", { "x-robots-tag": "noindex, nofollow" }, "<!doctype html>"],
      ["/terms", {}, '<!doctype html><meta name="robots" content="noindex, nofollow">'],
    ]) {
      const blockedPublicFetch = async (url, options) => {
        if (new URL(url).pathname === path) {
          return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", ...secureHeaders, ...headers } });
        }
        return successfulFetch(url, options);
      };
      await expect(runRemoteSmoke("https://preview.vercel.app", blockedPublicFetch))
        .rejects.toThrow(new RegExp(`${path}: .*noindex`));
    }
  });

  it("fails when robots.txt has no Sitemap line", async () => {
    const noSitemapFetch = async (url, options) => {
      if (new URL(url).pathname === "/robots.txt") {
        return new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain" } });
      }
      return successfulFetch(url, options);
    };
    await expect(runRemoteSmoke("https://preview.vercel.app", noSitemapFetch)).rejects.toThrow(/\/robots\.txt: .*Sitemap/);
  });

  it("fails when the landing page has no canonical link or og:image", async () => {
    for (const body of [
      '<!doctype html><meta property="og:image" content="https://preview.vercel.app/og/ilgamcheck-social.png">',
      '<!doctype html><link rel="canonical" href="https://preview.vercel.app/">',
    ]) {
      const bareLandingFetch = async (url, options) => {
        if (new URL(url).pathname === "/") {
          return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", ...secureHeaders } });
        }
        return successfulFetch(url, options);
      };
      await expect(runRemoteSmoke("https://preview.vercel.app", bareLandingFetch)).rejects.toThrow(/^\/: .*(canonical|og:image)/);
    }
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
