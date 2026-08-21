import { describe, expect, it } from "vitest";

import { createSeedState } from "./seed";
import { serializeWorkspaceExport } from "./export";

describe("workspace export", () => {
  it("exports user-visible workspace data without public-link bearer tokens", () => {
    const state = createSeedState("2026-08-16");
    const secret = state.jobs[0].revisionPortalToken;
    const output = serializeWorkspaceExport(
      state,
      "owner@example.test",
      "2026-08-16T00:00:00.000Z",
    );
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(output).not.toContain(secret);
    expect(output).not.toContain("revisionPortalToken");
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      product: "ilgamcheck",
      exportedAt: "2026-08-16T00:00:00.000Z",
      accountEmail: "owner@example.test",
    });
  });
});
