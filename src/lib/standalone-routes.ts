/**
 * 작업공간 없이 그리는 공개 화면. 체험 링크는 서버·DB·브라우저 저장소를 쓰지 않아야 하므로
 * Next 루트 레이아웃과 Sites 셸 모두 이 경로에서는 WorkspaceProvider(Supabase 세션·Realtime·localStorage)를 띄우지 않는다.
 */
export const STANDALONE_ROUTE_PATHS = ["/guide", "/demo/r"] as const;

export function isStandaloneRoutePath(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (STANDALONE_ROUTE_PATHS as readonly string[]).includes(normalized);
}
