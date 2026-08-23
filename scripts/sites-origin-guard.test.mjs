import { describe, expect, it, vi } from "vitest";
import { verifyHostedAuthOrigin } from "./sites-origin-guard.mjs";

describe("Sites Auth origin guard", () => {
  it("accepts only the explicitly configured Sites origin", () => {
    expect(verifyHostedAuthOrigin({
      authOrigin: "https://ilgamcheck-beta.bsfire1237.chatgpt.site",
      env: { ILGAMCHECK_SITES_ORIGIN: "https://ilgamcheck-beta.bsfire1237.chatgpt.site" },
    })).toEqual({ provider: "sites", origin: "https://ilgamcheck-beta.bsfire1237.chatgpt.site" });
  });

  it("falls back to the existing Vercel identity guard only when no Sites origin is set", () => {
    const verifyVercel = vi.fn(() => ({ provider: "vercel" }));
    expect(verifyHostedAuthOrigin({
      authOrigin: "https://preview.example.test",
      env: {},
      verifyVercel,
    })).toEqual({ provider: "vercel" });
    expect(verifyVercel).toHaveBeenCalledWith({ authOrigin: "https://preview.example.test" });
  });
});
