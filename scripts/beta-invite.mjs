import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  publicOperatorNameIssue,
  publicSupportEmailIssue,
  serverSupabaseAdminKeyIssue,
  supabaseProjectUrlIssue,
} from "./deploy-env-policy.mjs";
import { verifyLinkedSupabaseProject } from "./supabase-project-guard.mjs";
import { verifyLinkedVercelDeployment } from "./vercel-project-guard.mjs";

export const BETA_INVITE_ACK = "I_CONFIRMED_POLICY_AND_SMTP_SEND_ONE_INVITE";

const USAGE = [
  "사용법: npm run beta:invite -- --email tester@example.com",
  `실행 직전 현재 셀에 ILGAMCHECK_BETA_INVITE_ACK=${BETA_INVITE_ACK} 확인값을 설정하세요.`,
].join("\n");

export class BetaInviteInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "BetaInviteInputError";
  }
}

export function normalizeHttpsOrigin(rawValue, variableName) {
  const value = rawValue?.trim();
  if (!value) throw new BetaInviteInputError(`${variableName} 값이 없습니다.`);

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new BetaInviteInputError(`${variableName}은 유효한 HTTPS origin이어야 합니다.`);
  }
  if (url.protocol !== "https:") {
    throw new BetaInviteInputError(`${variableName}은 HTTPS origin이어야 합니다.`);
  }
  if (url.username || url.password || url.port || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new BetaInviteInputError(`${variableName}은 비표준 포트·자격증명·경로·query·hash가 없는 origin이어야 합니다.`);
  }
  return url.origin;
}

export function normalizeInviteEmail(rawEmail) {
  const email = rawEmail?.trim();
  if (
    !email
    || email.length > 254
    || /[\r\n]/.test(email)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new BetaInviteInputError("유효한 초대 이메일을 --email 인자로 지정하세요.");
  }
  return email;
}

export function parseBetaInviteArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { help: true, email: null };
  }

  let email = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token !== "--email" || email !== null || index + 1 >= argv.length) {
      throw new BetaInviteInputError("인자는 --email tester@example.com 형식으로 한 명만 지정하세요.");
    }
    email = normalizeInviteEmail(argv[index + 1]);
    index += 1;
  }

  if (!email) {
    throw new BetaInviteInputError("유효한 초대 이메일을 --email 인자로 지정하세요.");
  }
  return { help: false, email };
}

export function readBetaInviteConfig(env) {
  if (env.ILGAMCHECK_BETA_INVITE_ACK !== BETA_INVITE_ACK) {
    throw new BetaInviteInputError(
      `ILGAMCHECK_BETA_INVITE_ACK=${BETA_INVITE_ACK} 확인값이 필요합니다.`,
    );
  }

  const supabaseUrlIssue = supabaseProjectUrlIssue(env.NEXT_PUBLIC_SUPABASE_URL);
  if (supabaseUrlIssue) {
    throw new BetaInviteInputError(`NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrlIssue}`);
  }
  const supabaseUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL.trim()).origin;
  const authSiteUrl = normalizeHttpsOrigin(
    env.SUPABASE_AUTH_SITE_URL,
    "SUPABASE_AUTH_SITE_URL",
  );
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const serviceRoleKeyIssue = serverSupabaseAdminKeyIssue(serviceRoleKey);
  if (serviceRoleKeyIssue) {
    throw new BetaInviteInputError(`SUPABASE_SERVICE_ROLE_KEY: ${serviceRoleKeyIssue}`);
  }
  const operatorNameIssue = publicOperatorNameIssue(env.NEXT_PUBLIC_OPERATOR_NAME);
  if (operatorNameIssue) {
    throw new BetaInviteInputError(`NEXT_PUBLIC_OPERATOR_NAME: ${operatorNameIssue}`);
  }
  const supportEmailIssue = publicSupportEmailIssue(env.NEXT_PUBLIC_SUPPORT_EMAIL);
  if (supportEmailIssue) {
    throw new BetaInviteInputError(`NEXT_PUBLIC_SUPPORT_EMAIL: ${supportEmailIssue}`);
  }
  if (env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED !== "false") {
    throw new BetaInviteInputError("NEXT_PUBLIC_BETA_SIGNUP_ENABLED=false 폐쇄 베타 설정이 필요합니다.");
  }

  return {
    authSiteUrl,
    redirectTo: `${authSiteUrl}/auth/reset`,
    serviceRoleKey,
    supabaseUrl,
  };
}

export function betaInviteEnvironment(loadedEnv, shellAcknowledgement) {
  const env = { ...loadedEnv };
  delete env.ILGAMCHECK_BETA_INVITE_ACK;
  if (shellAcknowledgement === BETA_INVITE_ACK) {
    env.ILGAMCHECK_BETA_INVITE_ACK = shellAcknowledgement;
  }
  return env;
}

export async function verifyBetaInviteTarget({
  config,
  env,
  root = process.cwd(),
  verifySupabase = verifyLinkedSupabaseProject,
  verifyVercel = verifyLinkedVercelDeployment,
}) {
  const linked = verifySupabase({ root, env });
  const configuredRef = new URL(config.supabaseUrl).hostname.replace(/\.supabase\.co$/, "");
  if (linked.projectRef !== configuredRef) {
    throw new Error("BETA_INVITE_TARGET_MISMATCH");
  }
  verifyVercel({ root, authOrigin: config.authSiteUrl, env });
}

export async function sendBetaInvite({ email, env, config = readBetaInviteConfig(env), createClientImpl = createClient }) {
  const admin = createClientImpl(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: config.redirectTo,
  });
  if (error || !data?.user?.id) {
    throw new Error("BETA_INVITE_FAILED");
  }
}

export async function runBetaInvite({
  argv = process.argv.slice(2),
  env = process.env,
  createClientImpl = createClient,
  verifyTargetImpl = verifyBetaInviteTarget,
  root = process.cwd(),
  logger = console,
} = {}) {
  try {
    const input = parseBetaInviteArgs(argv);
    if (input.help) {
      logger.log(USAGE);
      return 0;
    }

    const config = readBetaInviteConfig(env);
    await verifyTargetImpl({ config, env, root });
    await sendBetaInvite({ email: input.email, env, config, createClientImpl });
    logger.log("[beta-invite] 초대 이메일 전송 요청이 접수됐습니다.");
    return 0;
  } catch (error) {
    if (error instanceof BetaInviteInputError) {
      logger.error(`[beta-invite] ${error.message}`);
    } else {
      logger.error("[beta-invite] Supabase 초대 요청이 실패했습니다. Dashboard Auth 로그에서 원인을 확인하세요.");
    }
    return 1;
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

if (entryUrl === import.meta.url) {
  const { loadEnvConfig } = nextEnv;
  const shellAcknowledgement = process.env.ILGAMCHECK_BETA_INVITE_ACK;
  loadEnvConfig(process.cwd());
  process.exitCode = await runBetaInvite({
    env: betaInviteEnvironment(process.env, shellAcknowledgement),
  });
}
