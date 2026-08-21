import { describe, expect, it } from "vitest";
import {
  captureVercelRuntimeEnvironment,
  VERCEL_RUNTIME_ENV_NAMES,
  VERCEL_SECRET_ENV_NAMES,
  vercelEnvAddInvocation,
  vercelEnvApplyAck,
  vercelEnvTargetBinding,
} from "./vercel-env-push-policy.mjs";

const vercelTarget = { projectId: "prj_abc", orgId: "team_abc" };

describe("Vercel env push policy", () => {
  it("uses the seven exact Hosted runtime variables", () => {
    expect(VERCEL_RUNTIME_ENV_NAMES).toEqual([
      "NEXT_PUBLIC_STORAGE_MODE",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_OPERATOR_NAME",
      "NEXT_PUBLIC_SUPPORT_EMAIL",
      "NEXT_PUBLIC_BETA_SIGNUP_ENABLED",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });

  it("captures and freezes the exact trimmed values that will be probed and pushed", () => {
    const env = Object.fromEntries(
      VERCEL_RUNTIME_ENV_NAMES.map((name) => [name, `  ${name}-value  `]),
    );
    const captured = captureVercelRuntimeEnvironment(env);
    env.SUPABASE_SERVICE_ROLE_KEY = "attacker-swapped-after-probe";

    expect(Object.isFrozen(captured)).toBe(true);
    expect(captured.SUPABASE_SERVICE_ROLE_KEY).toBe("SUPABASE_SERVICE_ROLE_KEY-value");
    expect(() => {
      captured.SUPABASE_SERVICE_ROLE_KEY = "mutated";
    }).toThrow();
  });

  it("passes values through stdin and never command arguments", () => {
    const secret = "sb_secret_never_in_argv";
    const command = vercelEnvAddInvocation("SUPABASE_SERVICE_ROLE_KEY", "preview", secret, vercelTarget, "win32", {
      nodeExecutable: "C:\\node\\node.exe",
      npxCliPath: "C:\\node\\npm\\npx-cli.js",
    });
    expect(command.executable).toBe("C:\\node\\node.exe");
    expect(command.args[0]).toBe("C:\\node\\npm\\npx-cli.js");
    expect(command.args).not.toContain(secret);
    expect(command.input).toBe(`${secret}\n`);
    expect(command.args).toEqual(expect.arrayContaining(["--sensitive", "--force", "--yes"]));
    expect(command.args).toEqual(expect.arrayContaining([
      "--project",
      "prj_abc",
    ]));
    expect(command.args).not.toContain("--scope");
    expect(command.args).not.toContain("--no-sensitive");
  });

  it("stores all browser-visible values as config and only the admin key as secret", () => {
    expect(VERCEL_SECRET_ENV_NAMES).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
    for (const name of VERCEL_RUNTIME_ENV_NAMES) {
      const command = vercelEnvAddInvocation(name, "preview", "contract-value", vercelTarget);
      if (name === "SUPABASE_SERVICE_ROLE_KEY") {
        expect(command.args).toContain("--sensitive");
        expect(command.args).not.toContain("--no-sensitive");
      } else {
        expect(command.args).toContain("--no-sensitive");
        expect(command.args).not.toContain("--sensitive");
      }
    }
  });

  it("binds confirmation to target and linked project", () => {
    expect(vercelEnvApplyAck("preview", "prj_abc")).toBe("PUSH_HOSTED_ENV_TO_PREVIEW_prj_abc");
    expect(vercelEnvApplyAck("production", "prj_abc")).toBe("PUSH_HOSTED_ENV_TO_PRODUCTION_prj_abc");
  });

  it("rejects unapproved names and targets", () => {
    expect(() => vercelEnvAddInvocation("SUPABASE_AUTH_SITE_URL", "preview", "https://example.com", vercelTarget))
      .toThrow(/허용되지 않은/);
    expect(() => vercelEnvAddInvocation("NEXT_PUBLIC_STORAGE_MODE", "development", "hosted", vercelTarget))
      .toThrow(/target/);
    expect(() => vercelEnvTargetBinding({ projectId: "../other", orgId: "team_abc" }))
      .toThrow(/project ID/);
    expect(() => vercelEnvTargetBinding({ projectId: "prj_abc", orgId: "team other" }))
      .toThrow(/scope ID/);
  });
});
