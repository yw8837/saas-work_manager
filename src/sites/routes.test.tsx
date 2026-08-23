import { describe, expect, it } from "vitest";
import { SITE_ROUTE_PATHS } from "./routes";

describe("Sites route contract", () => {
  it("preserves every public and workspace path used by the Next application", () => {
    expect(SITE_ROUTE_PATHS).toEqual([
      "/",
      "/today",
      "/jobs",
      "/jobs/new",
      "/jobs/:id",
      "/packages",
      "/settings",
      "/feedback",
      "/auth/reset",
      "/r/:token",
      "/privacy",
      "/terms",
    ]);
  });
});
