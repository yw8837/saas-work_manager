import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authConfigApplyAck,
  linkedSupabaseProjectIssue,
  migrationApplyAck,
  parseSupabaseProjects,
  verifyLinkedSupabaseProject,
} from "./supabase-project-guard.mjs";

const ref = "abcdefghijklmnopqrst";

describe("Supabase remote target guard", () => {
  it("requires the linked ref, app URL and Seoul project to agree", () => {
    expect(linkedSupabaseProjectIssue({
      projectRef: ref,
      projectUrl: `https://${ref}.supabase.co`,
      projects: [{ id: ref, region: "ap-northeast-2" }],
    })).toBeNull();
  });

  it("rejects a stale link or a non-Seoul project", () => {
    expect(linkedSupabaseProjectIssue({
      projectRef: ref,
      projectUrl: "https://12345678901234567890.supabase.co",
      projects: [{ id: ref, region: "ap-northeast-2" }],
    })).toMatch(/ref가 다릅니다/);
    expect(linkedSupabaseProjectIssue({
      projectRef: ref,
      projectUrl: `https://${ref}.supabase.co`,
      projects: [{ id: ref, region: "ap-northeast-1" }],
    })).toMatch(/Seoul/);
  });

  it("accepts both array and projects-wrapper CLI JSON", () => {
    const project = { id: ref, region: "ap-northeast-2" };
    expect(parseSupabaseProjects(JSON.stringify([project]))).toEqual([project]);
    expect(parseSupabaseProjects(JSON.stringify({ projects: [project] }))).toEqual([project]);
    expect(() => parseSupabaseProjects("not-json")).toThrow(/해석/);
  });

  it("binds destructive acknowledgements to the exact project ref", () => {
    expect(migrationApplyAck(ref)).toBe(`APPLY_MIGRATIONS_TO_${ref}`);
    expect(authConfigApplyAck(ref)).toBe(`PUSH_CLOSED_BETA_AUTH_CONFIG_TO_${ref}`);
    expect(migrationApplyAck(ref)).not.toContain("secret");
  });

  it("does not pass service keys, PATs, test passwords, or cloud secrets to the CLI", () => {
    const root = mkdtempSync(join(tmpdir(), "ilgamcheck-supabase-guard-"));
    try {
      mkdirSync(join(root, "supabase", ".temp"), { recursive: true });
      writeFileSync(join(root, "supabase", ".temp", "project-ref"), ref, "utf8");
      const spawn = (...args) => {
        expect(args[2].env).toEqual({
          PATH: "C:\\bin",
          USERPROFILE: "C:\\Users\\tester",
        });
        return {
          status: 0,
          stdout: JSON.stringify([{ id: ref, region: "ap-northeast-2" }]),
        };
      };

      expect(verifyLinkedSupabaseProject({
        root,
        spawn,
        env: {
          PATH: "C:\\bin",
          USERPROFILE: "C:\\Users\\tester",
          NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
          SUPABASE_ACCESS_TOKEN: "pat-secret",
          SUPABASE_SERVICE_ROLE_KEY: "service-secret",
          VERCEL_TOKEN: "vercel-secret",
          ILGAMCHECK_TEST_A_PASSWORD: "test-password",
          AWS_SECRET_ACCESS_KEY: "aws-secret",
        },
      })).toEqual({ projectRef: ref, region: "ap-northeast-2" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
