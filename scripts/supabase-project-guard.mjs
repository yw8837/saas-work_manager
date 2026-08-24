import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { supabaseProjectUrlIssue } from "./deploy-env-policy.mjs";
import { minimalChildEnvironment } from "./minimal-child-environment.mjs";
import { projectRefIssue, supabaseNpxInvocation } from "./supabase-cli-policy.mjs";

export const REQUIRED_SUPABASE_REGION = "ap-northeast-2";

export function migrationApplyAck(projectRef) {
  return `APPLY_MIGRATIONS_TO_${projectRef}`;
}

export function authConfigApplyAck(projectRef) {
  return `PUSH_PUBLIC_SIGNUP_AUTH_CONFIG_TO_${projectRef}`;
}

export function parseSupabaseProjects(rawJson) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Supabase projects list JSON을 해석할 수 없습니다.");
  }
  const projects = Array.isArray(parsed) ? parsed : parsed?.projects;
  if (!Array.isArray(projects)) throw new Error("Supabase projects list 응답 형식이 올바르지 않습니다.");
  return projects;
}

export function linkedSupabaseProjectIssue({ projectRef, projectUrl, projects }) {
  const refIssue = projectRefIssue(projectRef);
  if (refIssue) return refIssue;

  const urlIssue = supabaseProjectUrlIssue(projectUrl);
  if (urlIssue) return `NEXT_PUBLIC_SUPABASE_URL: ${urlIssue}`;

  const urlRef = new URL(projectUrl).hostname.replace(/\.supabase\.co$/, "");
  if (urlRef !== projectRef) return "연결된 project ref와 NEXT_PUBLIC_SUPABASE_URL의 ref가 다릅니다.";

  const project = projects.find((item) => (item?.id ?? item?.ref) === projectRef);
  if (!project) return "현재 로그인한 Supabase 계정에서 연결 프로젝트를 찾을 수 없습니다.";
  if (project.region !== REQUIRED_SUPABASE_REGION) {
    return `Supabase 프로젝트 region이 ${REQUIRED_SUPABASE_REGION}(Seoul)이 아닙니다.`;
  }
  return null;
}

export function verifyLinkedSupabaseProject({ root = process.cwd(), env = process.env, spawn = spawnSync } = {}) {
  let projectRef;
  try {
    projectRef = readFileSync(join(root, "supabase", ".temp", "project-ref"), "utf8").trim();
  } catch {
    throw new Error("Supabase 연결 정보가 없습니다. 먼저 supabase:link를 실행하세요.");
  }

  const command = supabaseNpxInvocation(["projects", "list", "--output", "json"]);
  const result = spawn(command.executable, command.args, {
    cwd: root,
    encoding: "utf8",
    env: minimalChildEnvironment(env),
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error("Supabase 프로젝트 조회에 실패했습니다. 로그인 상태와 네트워크를 확인하세요.");
  }

  const projects = parseSupabaseProjects(result.stdout ?? "");
  const issue = linkedSupabaseProjectIssue({
    projectRef,
    projectUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    projects,
  });
  if (issue) throw new Error(issue);
  return { projectRef, region: REQUIRED_SUPABASE_REGION };
}
