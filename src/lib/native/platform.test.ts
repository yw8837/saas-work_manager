import { describe, expect, it, vi } from "vitest";
import { nativeApiUrl, nativePlatform } from "./platform";

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android", isNativePlatform: () => true },
}));

describe("native API boundary", () => {
  it("detects the runtime, not localhost alone", () => {
    expect(nativePlatform()).toBe("android");
  });
  it("keeps web relative and native on the deployment HTTPS origin", () => {
    expect(nativeApiUrl("/api/account/delete", "web")).toBe("/api/account/delete");
    for (const platform of ["android", "ios"] as const) {
      expect(nativeApiUrl("/api/public-config", platform)).toBe("https://ilgam.studioyeolmae.com/api/public-config");
      expect(nativeApiUrl("/api/account/delete", platform)).toBe("https://ilgam.studioyeolmae.com/api/account/delete");
    }
  });
  it.each(["//evil.example", "/api/public-config?next=evil", "/api/account/delete/../x", "https://evil.example"])(
    "rejects non-allowlisted paths: %s", (path) => {
      expect(() => nativeApiUrl(path as "/api/public-config", "android")).toThrow("NATIVE_API_PATH_INVALID");
    },
  );
});
