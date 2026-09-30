const DEFAULT_SITE_ORIGIN = "https://ilgam.studioyeolmae.com";

/** Build-time public origin for metadata and native app bootstrap, never an OAuth redirect input. */
export function deploymentOrigin(raw: string | undefined = process.env.NEXT_PUBLIC_SITE_ORIGIN): string {
  if (!raw?.trim()) return DEFAULT_SITE_ORIGIN;
  const value = raw.trim();
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("SITE_ORIGIN_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || url.pathname !== "/" || url.search || url.hash || /[\s<>"'\\]/.test(value)
    || !/^[a-z\d.-]+$/i.test(url.hostname)) {
    throw new Error("SITE_ORIGIN_INVALID");
  }
  return url.origin;
}

export function renderDeploymentHtml(html: string, rawOrigin?: string): string {
  return html.replaceAll("__ILGAMCHECK_SITE_ORIGIN__", deploymentOrigin(rawOrigin));
}
