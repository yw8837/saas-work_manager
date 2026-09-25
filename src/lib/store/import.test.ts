import { describe, expect, it } from "vitest";

import { isSecurePortalToken } from "@/lib/supabase/workspace";

import { serializeWorkspaceExport } from "./export";
import { mergeImportedWorkspace, parseWorkspaceImport, WORKSPACE_IMPORT_MAX_BYTES } from "./import";
import { createSeedState, createStarterState } from "./seed";

describe("parseWorkspaceImport", () => {
  it("reads a file made by the export button and gives every job a fresh secure portal token", () => {
    const state = createSeedState("2026-09-01");
    const text = serializeWorkspaceExport(state, "owner@example.com", "2026-09-20T10:00:00.000Z");

    const result = parseWorkspaceImport(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.jobCount).toBe(state.jobs.length);
    expect(result.exportedAt).toBe("2026-09-20T10:00:00.000Z");
    expect(result.workspace.jobs.map((job) => job.clientLabel)).toEqual(state.jobs.map((job) => job.clientLabel));
    expect(result.workspace.packages).toHaveLength(state.packages.length);
    for (const job of result.workspace.jobs) {
      expect(isSecurePortalToken(job.revisionPortalToken)).toBe(true);
    }
  });

  it("rejects text that is not JSON", () => {
    const result = parseWorkspaceImport("not json");
    expect(result).toEqual({ ok: false, message: expect.stringContaining("JSON") });
  });

  it("rejects JSON from another product", () => {
    const result = parseWorkspaceImport(JSON.stringify({ product: "other", schemaVersion: 1, workspace: {} }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("일감체크 백업 파일이 아니에요");
  });

  it("rejects an unknown schema version", () => {
    const state = createSeedState("2026-09-01");
    const parsed = JSON.parse(serializeWorkspaceExport(state, null));
    parsed.schemaVersion = 99;
    const result = parseWorkspaceImport(JSON.stringify(parsed));
    expect(result.ok).toBe(false);
  });

  it("rejects a damaged workspace", () => {
    const state = createSeedState("2026-09-01");
    const parsed = JSON.parse(serializeWorkspaceExport(state, null));
    parsed.workspace.jobs[0].tasks = "broken";
    const result = parseWorkspaceImport(JSON.stringify(parsed));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("손상");
  });

  it("rejects files larger than the limit before parsing", () => {
    const result = parseWorkspaceImport(" ".repeat(WORKSPACE_IMPORT_MAX_BYTES + 1));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("너무 커요");
  });
});

describe("mergeImportedWorkspace", () => {
  it("replaces the data but never rolls back plan counters, trial, beta access or used codes", () => {
    const current = {
      ...createStarterState("2026-09-10"),
      jobsCreatedTotal: 9,
      trialStartedAt: "2026-09-01T00:00:00.000Z",
      betaAccess: { code: "BETA2026", grantedAt: "2026-09-02T00:00:00.000Z", expiresAt: "2026-10-02T00:00:00.000Z" },
      redeemedInviteCodes: ["BETA2026"],
      activityDates: ["2026-09-10"],
    };
    const backup = createSeedState("2026-08-01");
    const imported = parseWorkspaceImport(serializeWorkspaceExport({ ...backup, jobsCreatedTotal: 2, trialStartedAt: null, betaAccess: null }, null));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const merged = mergeImportedWorkspace(current, imported.workspace);

    expect(merged.jobs.map((job) => job.id)).toEqual(backup.jobs.map((job) => job.id));
    expect(merged.jobsCreatedTotal).toBe(Math.max(9, backup.jobs.length));
    expect(merged.trialStartedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(merged.betaAccess?.code).toBe("BETA2026");
    expect(merged.redeemedInviteCodes).toEqual(["BETA2026"]);
    expect(merged.activityDates).toContain("2026-09-10");
  });

  it("keeps the backup's counter when it is larger than the current one", () => {
    const current = { ...createStarterState("2026-09-10"), jobsCreatedTotal: 1 };
    const imported = parseWorkspaceImport(serializeWorkspaceExport({ ...createSeedState("2026-08-01"), jobsCreatedTotal: 30 }, null));
    if (!imported.ok) throw new Error("fixture should parse");
    expect(mergeImportedWorkspace(current, imported.workspace).jobsCreatedTotal).toBe(30);
  });
});
