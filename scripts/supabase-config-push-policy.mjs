import { supabaseNpxInvocation } from "./supabase-cli-policy.mjs";

export function normalizeAuthSiteUrl(rawUrl) {
  const value = rawUrl?.trim();
  if (!value) throw new Error("SUPABASE_AUTH_SITE_URL 값이 없습니다.");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Auth Site URL은 HTTPS여야 합니다.");
  if (url.username || url.password || url.port || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new Error("Auth Site URL은 비표준 포트·자격증명·경로·query가 없는 배포 origin이어야 합니다.");
  }
  return url.origin;
}

function tomlSection(text, sectionName) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `[${sectionName}]`);
  if (start < 0) return "";
  const next = lines.findIndex((line, index) => index > start && /^\s*\[.+\]\s*$/.test(line));
  return lines.slice(start + 1, next < 0 ? undefined : next).join("\n");
}

export function renderHostedSupabaseConfig(localConfig, rawSiteUrl) {
  const siteUrl = normalizeAuthSiteUrl(rawSiteUrl);
  const auth = tomlSection(localConfig, "auth");
  const email = tomlSection(localConfig, "auth.email");
  if (!/^\s*enable_signup\s*=\s*false\s*$/m.test(auth)) {
    throw new Error("[auth] enable_signup=false가 아니어서 원격 config push를 중단합니다.");
  }
  if (!/^\s*enable_signup\s*=\s*true\s*$/m.test(email)) {
    throw new Error("[auth.email] enable_signup=true가 아니어서 초대 계정의 이메일 로그인을 보장할 수 없습니다.");
  }

  let hosted = localConfig.replace(
    /^site_url\s*=\s*"[^"]*"\s*$/m,
    `site_url = "${siteUrl}"`,
  );
  hosted = hosted.replace(
    /^additional_redirect_urls\s*=\s*\[[\s\S]*?^\]/m,
    `additional_redirect_urls = [\n  "${siteUrl}/auth/reset"\n]`,
  );
  if (!hosted.includes(`site_url = "${siteUrl}"`) || !hosted.includes(`"${siteUrl}/auth/reset"`)) {
    throw new Error("config.toml의 Auth URL 블록을 안전하게 바꾸지 못했습니다.");
  }
  return hosted;
}

export function configPushInvocation(projectRef, workdir, platform = process.platform, runtime = {}) {
  return supabaseNpxInvocation([
    "--workdir", workdir,
    "--yes",
    "config", "push",
    "--project-ref", projectRef,
  ], platform, runtime);
}
