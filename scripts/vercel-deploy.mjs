import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  verifyCapturedVercelDeployment,
  verifyLinkedVercelProject,
  vercelNpxInvocation,
} from "./vercel-project-guard.mjs";
import {
  computeReleaseFingerprint,
  RELEASE_FINGERPRINT_META_KEY,
} from "./release-fingerprint.mjs";
import { minimalChildEnvironment } from "./minimal-child-environment.mjs";

export function parseDeployTarget(argv) {
  if (argv.length === 0) return "preview";
  if (argv.length === 2 && argv[0] === "--target" && ["preview", "production"].includes(argv[1])) {
    return argv[1];
  }
  if (argv.length === 1 && /^--target=(preview|production)$/.test(argv[0])) {
    return argv[0].slice("--target=".length);
  }
  throw new Error("사용법: vercel-deploy.mjs [--target preview|production]");
}

export function buildVercelDeployCommand({ target, projectId, fingerprint, platform = process.platform, runtime = {} }) {
  if (!["preview", "production"].includes(target)) throw new Error("Vercel 배포 target이 올바르지 않습니다.");
  if (typeof projectId !== "string" || !/^[A-Za-z0-9_-]+$/.test(projectId)) {
    throw new Error("Vercel project ID가 올바르지 않습니다.");
  }
  if (typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new Error("Release fingerprint가 올바르지 않습니다.");
  }

  const args = [
    "deploy",
    "--yes",
    "--json",
    "--meta",
    `${RELEASE_FINGERPRINT_META_KEY}=${fingerprint}`,
    "--project",
    projectId,
    "--target",
    target,
  ];
  if (target === "production") args.push("--skip-domain");
  return vercelNpxInvocation(args, platform, runtime);
}

export function buildVercelPromoteCommand(deploymentId, platform = process.platform, runtime = {}) {
  if (typeof deploymentId !== "string" || !/^[A-Za-z0-9_-]+$/.test(deploymentId)) {
    throw new Error("Vercel deployment ID가 올바르지 않습니다.");
  }
  return vercelNpxInvocation(["promote", deploymentId, "--yes"], platform, runtime);
}

export function parseVercelDeployOutput(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("Vercel deploy JSON을 해석할 수 없습니다.");
  }
  const deployment = payload?.deployment ?? payload;
  if (!deployment || typeof deployment !== "object") {
    throw new Error("Vercel deploy 결과에 deployment가 없습니다.");
  }
  if (typeof deployment.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(deployment.id)) {
    throw new Error("Vercel deploy 결과의 deployment ID가 올바르지 않습니다.");
  }
  if (typeof deployment.url !== "string" || !deployment.url.trim()) {
    throw new Error("Vercel deploy 결과의 deployment URL이 없습니다.");
  }
  return deployment;
}

export function runVercelDeploy({
  root = process.cwd(),
  argv = [],
  spawn = spawnSync,
  fingerprint = computeReleaseFingerprint,
  env = process.env,
} = {}) {
  const target = parseDeployTarget(argv);
  const verifiedProject = verifyLinkedVercelProject({ root, spawn, env });
  const { projectId } = verifiedProject;
  const releaseFingerprint = fingerprint(root);
  const command = buildVercelDeployCommand({ target, projectId, fingerprint: releaseFingerprint });
  const result = spawn(command.executable, command.args, {
    cwd: root,
    encoding: "utf8",
    env: minimalChildEnvironment(env),
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Vercel ${target} 배포에 실패했습니다.`);
  }
  const fingerprintAfterDeploy = fingerprint(root);
  if (fingerprintAfterDeploy !== releaseFingerprint) {
    throw new Error("Vercel 배포 중 로컬 release source가 변경되었습니다. 생성된 deployment를 신뢰하지 말고 현재 소스로 다시 배포하세요.");
  }

  let deploymentId;
  if (target === "production") {
    const deployment = parseVercelDeployOutput(result.stdout ?? "");
    if (deployment.target !== "production") {
      throw new Error("Vercel deploy 결과가 production target이 아니어서 domain promotion을 중단합니다.");
    }
    const verifiedDeployment = verifyCapturedVercelDeployment({
      root,
      verifiedProject,
      deployment: {
        ...deployment,
        name: verifiedProject.projectName,
        aliases: [],
      },
      authOrigin: deployment.url,
      expectedFingerprint: releaseFingerprint,
      expectedTarget: "production",
      spawn,
      env,
    });
    deploymentId = verifiedDeployment.deploymentId;
    const fingerprintBeforePromotion = fingerprint(root);
    if (fingerprintBeforePromotion !== releaseFingerprint) {
      throw new Error("Vercel production 검증 중 로컬 release source가 변경되어 domain promotion을 중단합니다.");
    }

    const promoteCommand = buildVercelPromoteCommand(deploymentId);
    const promoteResult = spawn(promoteCommand.executable, promoteCommand.args, {
      cwd: root,
      encoding: "utf8",
      env: minimalChildEnvironment(env),
      shell: false,
      windowsHide: true,
    });
    if (promoteResult.error || promoteResult.status !== 0) {
      throw new Error("검증된 Vercel production deployment의 domain promotion에 실패했습니다.");
    }
    const fingerprintAfterPromotion = fingerprint(root);
    if (fingerprintAfterPromotion !== releaseFingerprint) {
      throw new Error("Vercel domain promotion 뒤 로컬 release source가 변경되었습니다. promotion 결과를 신뢰하지 말고 원격 deployment를 다시 확인하세요.");
    }
  }
  return {
    target,
    projectId,
    deploymentId,
    releaseFingerprint,
    stdout: result.stdout ?? "",
  };
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href;

if (isMain) {
  try {
    const result = runVercelDeploy({ argv: process.argv.slice(2) });
    process.stdout.write(result.stdout);
  } catch (error) {
    console.error(`[vercel-deploy] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
