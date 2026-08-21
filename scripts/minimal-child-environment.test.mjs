import { describe, expect, it } from "vitest";
import {
  MINIMAL_CHILD_SAFE_BASE_ENV_NAMES,
  minimalChildEnvironment,
} from "./minimal-child-environment.mjs";

describe("minimal child environment", () => {
  it("keeps the safe OS baseline plus explicitly allowed values only", () => {
    const selected = minimalChildEnvironment({
      Path: "C:\\safe-bin",
      USERPROFILE: "C:\\safe-user",
      SUPABASE_AUTH_SITE_URL: "https://ilgamcheck.kr",
      VERCEL_TOKEN: "must-not-leak",
      AWS_SECRET_ACCESS_KEY: "must-not-leak",
    }, ["SUPABASE_AUTH_SITE_URL"]);

    expect(selected).toEqual({
      PATH: "C:\\safe-bin",
      USERPROFILE: "C:\\safe-user",
      SUPABASE_AUTH_SITE_URL: "https://ilgamcheck.kr",
    });
    expect(selected).not.toHaveProperty("VERCEL_TOKEN");
    expect(selected).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
  });

  it("does not invent absent baseline values or coerce non-string inputs", () => {
    expect(minimalChildEnvironment({ HOME: undefined, PATH: 123 }, ["MISSING_VALUE"]))
      .toEqual({});
    expect(MINIMAL_CHILD_SAFE_BASE_ENV_NAMES).not.toContain("NODE_OPTIONS");
    expect(MINIMAL_CHILD_SAFE_BASE_ENV_NAMES).not.toContain("HTTPS_PROXY");
  });
});
