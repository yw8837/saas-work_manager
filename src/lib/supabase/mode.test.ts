import { afterEach, describe, expect, it } from "vitest";

import { configuredSupabaseProjectRef, getHostedRuntimeBoundary } from "./mode";

const projectRef = "abcdefghijklmnopqrst";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("hosted runtime boundary", () => {
  it("defaults to honest local mode", () => {
    delete process.env.NEXT_PUBLIC_STORAGE_MODE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(getHostedRuntimeBoundary()).toMatchObject({
      requestedMode: "local",
      effectiveMode: "local",
      blockedExternal: true,
      supabaseProjectRefConfigured: null,
    });
  });

  it("activates hosted mode only when explicitly requested and configured", () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${projectRef}.supabase.co`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";

    expect(getHostedRuntimeBoundary()).toMatchObject({
      configured: true,
      adapterReady: true,
      effectiveMode: "hosted",
      blockedExternal: false,
      supabaseProjectRefConfigured: projectRef,
    });
  });

  it("extracts a public project ref only from the exact Supabase project origin", () => {
    expect(configuredSupabaseProjectRef(`https://${projectRef}.supabase.co`)).toBe(projectRef);
    expect(configuredSupabaseProjectRef(`https://${projectRef}.supabase.co/`)).toBe(projectRef);

    for (const invalid of [
      "https://example.supabase.co",
      `http://${projectRef}.supabase.co`,
      `https://${projectRef}.supabase.co/rest/v1`,
      `https://${projectRef}.supabase.co?redirect=1`,
      `https://${projectRef}.supabase.co:444`,
      `https://${projectRef}.supabase.co.evil.example`,
    ]) {
      expect(configuredSupabaseProjectRef(invalid)).toBeNull();
    }
  });

  it("fails closed when the public URL does not contain an exact 20-character project ref", () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";

    expect(getHostedRuntimeBoundary()).toMatchObject({
      configured: false,
      effectiveMode: "local",
      blockedExternal: true,
      supabaseProjectRefConfigured: null,
    });
  });

  it("fails closed when hosted mode is requested without public configuration", () => {
    process.env.NEXT_PUBLIC_STORAGE_MODE = "hosted";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(getHostedRuntimeBoundary()).toMatchObject({
      requestedMode: "hosted",
      configured: false,
      effectiveMode: "local",
      blockedExternal: true,
    });
  });
});
