/**
 * 작업공간 없이 그리는 공개 화면. 체험 링크는 서버·DB·브라우저 저장소를 쓰지 않아야 하므로
 * Next 루트 레이아웃과 Sites 셸 모두 이 경로에서는 WorkspaceProvider(Supabase 세션·Realtime·localStorage)를 띄우지 않는다.
 * 베타 신청·주소 확인·수신거부·운영자 화면도 작업공간 저장소와 무관하므로 같은 방식으로 띄운다.
 */
export const STANDALONE_ROUTE_PATHS = ["/guide", "/demo/r", "/apply", "/ops/applications"] as const;

/** 토큰이 붙는 단독 경로(/apply/confirm/:token, /u/:token). 토큰 한 마디만 허용한다. */
const STANDALONE_ROUTE_PATTERNS: readonly RegExp[] = [/^\/apply\/confirm\/[^/]+$/, /^\/u\/[^/]+$/];

/** 끝의 / 를 모두 떼어 낸 경로. 화면 판정과 Worker의 검색 차단 헤더 판정이 같은 기준을 쓴다. */
export function normalizeRoutePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** 검색 결과에 남기지 않을 경로: 고객 링크·체험 링크·베타 주소 확인·수신거부·운영자 화면. */
export function isNoindexRoutePath(pathname: string): boolean {
  const normalized = normalizeRoutePath(pathname);
  return /^\/r\/[^/]+$/.test(normalized)
    || /^\/demo(?:\/|$)/.test(normalized)
    || /^\/apply\/confirm\/[^/]+$/.test(normalized)
    || /^\/u\/[^/]+$/.test(normalized)
    || /^\/ops(?:\/|$)/.test(normalized);
}

export function isStandaloneRoutePath(pathname: string): boolean {
  const normalized = normalizeRoutePath(pathname);
  return (STANDALONE_ROUTE_PATHS as readonly string[]).includes(normalized)
    || STANDALONE_ROUTE_PATTERNS.some((pattern) => pattern.test(normalized));
}
