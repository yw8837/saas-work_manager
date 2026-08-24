export function normalizeSitesDeploymentUrl(rawUrl) {
  const raw = rawUrl?.trim();
  if (!raw) throw new Error("첫 번째 인수로 HTTPS 공개 배포 URL을 넣으세요.");
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(candidate);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("자격증명·query·fragment가 없는 HTTPS 배포 origin을 넣으세요.");
  }
  url.pathname = "/";
  return url;
}

async function checkedFetch(fetchImpl, baseUrl, path, accept = "*/*") {
  const response = await fetchImpl(new URL(path, baseUrl), {
    cache: "no-store",
    headers: { Accept: accept, "User-Agent": "ilgamcheck-sites-smoke/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
  if (response.url && new URL(response.url).origin !== baseUrl.origin) throw new Error(`${path}: 다른 origin으로 이동했습니다.`);
  return response;
}

export async function runSitesRemoteSmoke(rawUrl, fetchImpl = fetch) {
  const baseUrl = normalizeSitesDeploymentUrl(rawUrl);
  const checks = [];
  const health = await checkedFetch(fetchImpl, baseUrl, "/api/health");
  const healthBody = await health.json();
  if (healthBody?.status !== "ok" || healthBody?.ready !== true || !health.headers.get("cache-control")?.includes("no-store")) {
    throw new Error("/api/health: Sites Worker 상태 응답이 올바르지 않습니다.");
  }
  checks.push("health(ready/no-store)");

  const publicConfig = await checkedFetch(fetchImpl, baseUrl, "/api/public-config");
  const publicConfigBody = await publicConfig.json();
  if (
    publicConfigBody?.config?.NEXT_PUBLIC_STORAGE_MODE !== "hosted"
    || !publicConfigBody?.config?.NEXT_PUBLIC_SUPABASE_URL
    || !publicConfigBody?.config?.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || JSON.stringify(publicConfigBody).includes("SUPABASE_SERVICE_ROLE_KEY")
    || !publicConfig.headers.get("cache-control")?.includes("no-store")
  ) {
    throw new Error("/api/public-config: 브라우저 런타임 설정이 올바르지 않습니다.");
  }
  checks.push("public-config(hosted/no-secret/no-store)");

  for (const path of ["/", "/today", "/privacy", "/terms"]) {
    const response = await checkedFetch(fetchImpl, baseUrl, path, "text/html");
    if (!response.headers.get("content-type")?.includes("text/html")) throw new Error(`${path}: HTML 응답이 아닙니다.`);
    if (response.url && new URL(response.url).pathname.replace(/\/$/, "") !== path.replace(/\/$/, "")) {
      throw new Error(`${path}: 다른 화면으로 이동했습니다.`);
    }
    const html = await response.text();
    if (!html.includes('http-equiv="Content-Security-Policy"') || !html.includes("object-src 'none'")) {
      throw new Error(`${path}: 정적 문서 보안 정책이 없습니다.`);
    }
    if (path === "/today" && !html.includes('window.location.replace("about:blank")')) {
      throw new Error("/today: 프레임 차단 보호가 없습니다.");
    }
    checks.push(`${path}(html/spa-route)`);
  }

  const manifest = await checkedFetch(fetchImpl, baseUrl, "/manifest.webmanifest");
  if (!manifest.headers.get("content-type")?.includes("application/manifest+json")) throw new Error("/manifest.webmanifest: manifest JSON이 아닙니다.");
  if ((await manifest.json())?.name !== "일감체크") throw new Error("/manifest.webmanifest: 앱 이름이 일치하지 않습니다.");
  checks.push("manifest");

  const serviceWorker = await checkedFetch(fetchImpl, baseUrl, "/sw.js");
  if (!serviceWorker.headers.get("content-type")?.includes("javascript")) throw new Error("/sw.js: JavaScript 응답이 아닙니다.");
  checks.push("service-worker");

  const favicon = await checkedFetch(fetchImpl, baseUrl, "/icons/app-icon.svg", "image/svg+xml,image/*");
  if (!favicon.headers.get("content-type")?.includes("image/svg+xml")) throw new Error("/icons/app-icon.svg: SVG 아이콘 응답이 아닙니다.");
  checks.push("favicon");
  return { baseUrl: baseUrl.origin, checks };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runSitesRemoteSmoke(process.argv[2]);
    for (const check of result.checks) console.log(`[sites-remote-smoke] PASS ${check}`);
    console.log(`[sites-remote-smoke] PASS ${result.baseUrl} 공개 배포 기본 계약 확인 완료.`);
  } catch (error) {
    console.error(`[sites-remote-smoke] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
