import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { normalizeAuthSiteUrl } from "./supabase-config-push-policy.mjs";
import { minimalChildEnvironment } from "./minimal-child-environment.mjs";
import {
  computeReleaseFingerprint,
  RELEASE_FINGERPRINT_META_KEY,
} from "./release-fingerprint.mjs";
import { pinnedNpxInvocation } from "./pinned-npx.mjs";

export function vercelNpxInvocation(args, platform = process.platform, runtime = {}) {
  return pinnedNpxInvocation("vercel@59.1.3", args, platform, runtime);
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} JSON을 해석할 수 없습니다.`);
  }
}

function readVercelLink(root) {
  let link;
  try {
    link = JSON.parse(readFileSync(join(root, ".vercel", "project.json"), "utf8"));
  } catch {
    throw new Error("Vercel 연결 정보가 없습니다. 먼저 vercel:link를 실행하세요.");
  }
  if (!link?.projectId || !link?.orgId || !/^[A-Za-z0-9_-]+$/.test(link.projectId) || !/^[A-Za-z0-9_-]+$/.test(link.orgId)) {
    throw new Error("Vercel project.json의 projectId/orgId가 올바르지 않습니다.");
  }
  return link;
}

export function vercelProjectIssue({ link, project }) {
  if (!link?.projectId || !link?.orgId) return "Vercel link의 projectId/orgId가 없습니다.";
  if (project?.id !== link.projectId) return "Vercel link와 원격 project ID가 다릅니다.";
  if (!project?.name || typeof project.name !== "string") return "원격 Vercel project 이름이 없습니다.";
  return null;
}

export function verifyLinkedVercelProject({
  root = process.cwd(),
  spawn = spawnSync,
  env = process.env,
} = {}) {
  const link = readVercelLink(root);
  const childEnv = minimalChildEnvironment(env);
  const projectPath = `/v9/projects/${encodeURIComponent(link.projectId)}?teamId=${encodeURIComponent(link.orgId)}`;
  const projectCommand = vercelNpxInvocation(["api", projectPath]);
  const projectResult = spawn(projectCommand.executable, projectCommand.args, {
    cwd: root,
    encoding: "utf8",
    env: childEnv,
    shell: false,
    windowsHide: true,
  });
  if (projectResult.error || projectResult.status !== 0) {
    throw new Error("연결된 Vercel project 조회에 실패했습니다. 로그인과 scope를 확인하세요.");
  }
  const project = parseJson(projectResult.stdout ?? "", "Vercel project");
  const issue = vercelProjectIssue({ link, project });
  if (issue) throw new Error(issue);
  return { projectId: link.projectId, orgId: link.orgId, projectName: project.name, link, project };
}

function validDeploymentId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id);
}

function deploymentHost(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

function stringArray(value) {
  return Array.isArray(value) ? value : [];
}

export function vercelDeploymentIssue({
  link,
  project,
  deployment,
  details,
  authOrigin,
  expectedFingerprint,
  expectedTarget,
}) {
  if (!link?.projectId || !link?.orgId) return "Vercel link의 projectId/orgId가 없습니다.";
  if (project?.id !== link.projectId) return "Vercel link와 원격 project ID가 다릅니다.";
  if (!validDeploymentId(deployment?.id)) return "Vercel inspect 결과의 deployment ID가 올바르지 않습니다.";
  if (details?.id !== deployment.id) return "Vercel inspect와 상세 API의 deployment ID가 다릅니다.";
  if (details?.projectId !== link.projectId) return "Auth origin의 deployment project ID가 연결된 Vercel project와 다릅니다.";
  if (details?.ownerId !== link.orgId) return "Auth origin의 deployment owner ID가 연결된 Vercel scope와 다릅니다.";
  if (!project?.name || deployment?.name !== project.name) return "Auth origin의 deployment가 연결된 Vercel project 소속이 아닙니다.";
  if (details?.name !== project.name) return "Vercel 상세 API의 deployment가 연결된 project 소속이 아닙니다.";
  if (deployment?.readyState !== "READY" || details?.readyState !== "READY") {
    return "Auth origin의 Vercel deployment가 READY 상태가 아닙니다.";
  }
  if (expectedTarget !== undefined && expectedTarget !== "production") {
    return "요구한 Vercel deployment target이 올바르지 않습니다.";
  }
  if (expectedTarget === "production" && details?.target !== "production") {
    return "Auth origin의 Vercel deployment가 production target이 아닙니다.";
  }

  if (typeof expectedFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(expectedFingerprint)) {
    return "현재 로컬 release fingerprint가 올바르지 않습니다.";
  }
  if (details?.meta?.[RELEASE_FINGERPRINT_META_KEY] !== expectedFingerprint) {
    return "Auth origin의 배포 소스가 현재 로컬 release fingerprint와 다릅니다.";
  }

  let authUrl;
  try {
    authUrl = new URL(normalizeAuthSiteUrl(authOrigin));
  } catch (error) {
    return error instanceof Error ? error.message : "Auth origin이 올바르지 않습니다.";
  }
  const host = authUrl.host.toLowerCase();
  const deploymentHosts = [
    deployment.url,
    ...stringArray(deployment.aliases),
    details.url,
    ...stringArray(details.alias),
  ].map(deploymentHost).filter(Boolean);
  if (!deploymentHosts.includes(host)) return "Auth origin이 확인된 deployment URL 또는 alias가 아닙니다.";
  return null;
}

function readDeploymentDetails({ root, deploymentId, orgId, spawn, env }) {
  const detailsPath = `/v13/deployments/${encodeURIComponent(deploymentId)}?teamId=${encodeURIComponent(orgId)}`;
  const detailsCommand = vercelNpxInvocation(["api", detailsPath, "--raw"]);
  const detailsResult = spawn(detailsCommand.executable, detailsCommand.args, {
    cwd: root,
    encoding: "utf8",
    env: minimalChildEnvironment(env),
    shell: false,
    windowsHide: true,
  });
  if (detailsResult.error || detailsResult.status !== 0) {
    throw new Error("Auth origin의 Vercel deployment 상세 조회에 실패했습니다. 로그인과 scope를 확인하세요.");
  }
  return parseJson(detailsResult.stdout ?? "", "Vercel deployment 상세");
}

export function verifyCapturedVercelDeployment({
  root = process.cwd(),
  verifiedProject,
  deployment,
  authOrigin,
  expectedFingerprint,
  expectedTarget,
  spawn = spawnSync,
  env = process.env,
} = {}) {
  const { link, project } = verifiedProject ?? {};
  const projectIssue = vercelProjectIssue({ link, project });
  if (projectIssue) throw new Error(projectIssue);
  if (!validDeploymentId(deployment?.id)) {
    throw new Error("Vercel inspect 결과의 deployment ID가 올바르지 않습니다.");
  }

  const origin = normalizeAuthSiteUrl(authOrigin);
  const details = readDeploymentDetails({
    root,
    deploymentId: deployment.id,
    orgId: link.orgId,
    spawn,
    env,
  });
  const issue = vercelDeploymentIssue({
    link,
    project,
    deployment,
    details,
    authOrigin: origin,
    expectedFingerprint,
    expectedTarget,
  });
  if (issue) throw new Error(issue);

  return Object.freeze({
    projectId: link.projectId,
    orgId: link.orgId,
    projectName: project.name,
    deploymentId: deployment.id,
    origin,
    releaseFingerprint: expectedFingerprint,
    target: details.target ?? null,
  });
}

export function verifyLinkedVercelDeployment({
  root = process.cwd(),
  authOrigin,
  expectedTarget,
  spawn = spawnSync,
  fingerprint = computeReleaseFingerprint,
  env = process.env,
} = {}) {
  const verifiedProject = verifyLinkedVercelProject({ root, spawn, env });
  const childEnv = minimalChildEnvironment(env);

  const origin = normalizeAuthSiteUrl(authOrigin);
  const inspectCommand = vercelNpxInvocation(["inspect", origin, "--json"]);
  const inspectResult = spawn(inspectCommand.executable, inspectCommand.args, {
    cwd: root,
    encoding: "utf8",
    env: childEnv,
    shell: false,
    windowsHide: true,
  });
  if (inspectResult.error || inspectResult.status !== 0) {
    throw new Error("Auth origin의 Vercel deployment 조회에 실패했습니다.");
  }

  const deployment = parseJson(inspectResult.stdout ?? "", "Vercel deployment");
  if (!validDeploymentId(deployment?.id)) {
    throw new Error("Vercel inspect 결과의 deployment ID가 올바르지 않습니다.");
  }

  const expectedFingerprint = fingerprint(root);
  const verifiedDeployment = verifyCapturedVercelDeployment({
    root,
    verifiedProject,
    deployment,
    authOrigin: origin,
    expectedFingerprint,
    expectedTarget,
    spawn,
    env,
  });
  const fingerprintAfterVerification = fingerprint(root);
  if (fingerprintAfterVerification !== expectedFingerprint) {
    throw new Error("Vercel deployment 원격 검증 중 로컬 release source가 변경되었습니다. 현재 상태를 신뢰하지 말고 다시 확인하세요.");
  }
  return verifiedDeployment;
}
