import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { minimalChildEnvironment } from "./minimal-child-environment.mjs";
import {
  VERCEL_RUNTIME_ENV_NAMES,
  vercelEnvAddInvocation,
  vercelEnvTargetBinding,
} from "./vercel-env-push-policy.mjs";

export function pushVercelRuntimeEnvironment({
  target,
  vercelProject,
  values,
  env = process.env,
  spawn = spawnSync,
  onPass = () => {},
} = {}) {
  // Capture verified primitives once. Neither a later local re-link nor mutation of
  // the guard result can redirect any of the seven writes.
  const capturedTarget = vercelEnvTargetBinding(vercelProject);
  const childEnv = minimalChildEnvironment(env);
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ilgamcheck-vercel-env-"));

  try {
    const vercelDirectory = join(isolatedRoot, ".vercel");
    mkdirSync(vercelDirectory);
    writeFileSync(
      join(vercelDirectory, "project.json"),
      JSON.stringify(capturedTarget),
      { encoding: "utf8", flag: "wx" },
    );

    for (const name of VERCEL_RUNTIME_ENV_NAMES) {
      const command = vercelEnvAddInvocation(name, target, values?.[name], capturedTarget);
      const result = spawn(command.executable, command.args, {
        cwd: isolatedRoot,
        env: childEnv,
        input: command.input,
        stdio: ["pipe", "inherit", "inherit"],
        shell: false,
        windowsHide: true,
      });
      if (result.error || result.status !== 0) {
        return { ok: false, name, status: result.status ?? 1 };
      }
      onPass(name);
    }

    return {
      ok: true,
      count: VERCEL_RUNTIME_ENV_NAMES.length,
      projectId: capturedTarget.projectId,
      orgId: capturedTarget.orgId,
    };
  } finally {
    const resolvedRoot = resolve(isolatedRoot);
    const relativeToSystemTemp = relative(resolve(tmpdir()), resolvedRoot);
    if (!relativeToSystemTemp || relativeToSystemTemp.startsWith("..") || isAbsolute(relativeToSystemTemp)) {
      throw new Error("격리 Vercel 작업 폴더가 시스템 임시 폴더 밖이라 삭제하지 않았습니다.");
    }
    rmSync(resolvedRoot, { recursive: true, force: true });
  }
}
