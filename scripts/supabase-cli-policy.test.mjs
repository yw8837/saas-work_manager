import { describe, expect, it } from "vitest";
import {
  projectRefIssue,
  supabaseNpxInvocation,
  SUPABASE_CLI_VERSION,
} from "./supabase-cli-policy.mjs";

describe("Supabase CLI release commands", () => {
  it("accepts only a Dashboard project ref", () => {
    expect(projectRefIssue("abcdefghijklmnopqrst")).toBeNull();
    expect(projectRefIssue("PROJECT_REF")).toMatch(/20자리/);
    expect(projectRefIssue("abc; whoami")).toMatch(/20자리/);
  });

  it("pins the CLI and never builds a shell command string", () => {
    expect(supabaseNpxInvocation(["db", "push", "--dry-run"], "win32", {
      nodeExecutable: "C:\\node\\node.exe",
      npxCliPath: "C:\\node\\npm\\npx-cli.js",
    })).toEqual({
      executable: "C:\\node\\node.exe",
      args: ["C:\\node\\npm\\npx-cli.js", "-y", `supabase@${SUPABASE_CLI_VERSION}`, "db", "push", "--dry-run"],
    });
  });
});
