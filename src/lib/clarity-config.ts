import { getPublicEnvironmentValue } from "./public-environment";

/**
 * Microsoft Clarity(방문 기록 도구)를 쓰는 화면과 프로젝트 ID 판정.
 * next.config.ts(CSP)·불러오기 코드(clarity.ts)·바닥글 안내가 같은 값을 보도록 한곳에 둔다.
 * 브라우저 전역을 건드리지 않으므로 빌드 설정에서도 불러 쓸 수 있다.
 */

/** Clarity를 쓰는 화면은 메인과 둘러보기 둘뿐이다. 작업 화면·고객 화면·설명서·예시·약관에서는 쓰지 않는다. */
export const CLARITY_PAGE_PATHS = ["/", "/try"] as const;

/** 프로젝트 ID는 영문 소문자·숫자 6~32자만 받는다(주소에 그대로 붙으므로 다른 글자는 받지 않는다). */
const PROJECT_ID_PATTERN = /^[a-z0-9]{6,32}$/;

export function parseClarityProjectId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return PROJECT_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function configuredClarityProjectId(): string | null {
  return parseClarityProjectId(getPublicEnvironmentValue("NEXT_PUBLIC_CLARITY_PROJECT_ID"));
}

export function isClarityPagePath(pathname: string): boolean {
  return (CLARITY_PAGE_PATHS as readonly string[]).includes(pathname);
}
