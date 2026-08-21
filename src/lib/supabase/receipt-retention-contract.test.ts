import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/202608160004_workspace_save_receipt_retention.sql",
), "utf8");

describe("workspace save receipt retention contract", () => {
  it("keeps receipts for at least 30 days and bounds each cleanup", () => {
    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("p_batch_size not between 1 and 10000");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("workspace_save_requests_created_at_idx");
  });

  it("runs opportunistically without exposing cleanup to browser roles", () => {
    expect(migration).toMatch(/after insert on public\.workspace_save_requests/i);
    expect(migration).toMatch(/revoke all on function public\.cleanup_workspace_save_requests\([^)]+\) from anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.cleanup_workspace_save_requests\([^)]+\) to service_role/i);
  });

  it("records its own migration contract step", () => {
    expect(migration).toContain("202608160004");
  });
});
