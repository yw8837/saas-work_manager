import { captureAcquisitionFromLocation, readPendingAcquisition, type Acquisition } from "./acquisition-link";
import { configuredClarityProjectId, isClarityPagePath } from "./clarity-config";

/**
 * Microsoft Clarity(방문 기록 도구)를 메인(/)·둘러보기(/try)에서만 불러온다.
 *
 * - 공식 설치 코드와 같은 일을 인라인 스크립트 없이 한다(CSP에 'unsafe-inline'을 더하지 않는다).
 *   Microsoft 공식 npm 패키지 @microsoft/clarity 1.0.2의 src/utils.js(injectScript)를 따랐다: 호출을 쌓아 두는
 *   `window.clarity` 함수를 만들고 `https://www.clarity.ms/tag/<프로젝트 ID>`를 async 스크립트로 붙인다.
 * - 프로젝트 ID가 없거나 형식이 이상하면, 브라우저의 추적 거부 신호(GPC·DNT)가 켜져 있으면 아무것도 하지 않는다.
 * - CSP는 두 화면으로 처음 연 문서에만 Clarity 주소를 연다(next.config.ts). 다른 화면으로 처음 열고 옮겨 온 문서에서는 불러오지 않는다.
 * - Clarity는 한 번 불러오면 화면 안 이동(pushState·뒤로 가기) 뒤의 새 화면도 기록한다(공개 소스 core/history.ts).
 *   그래서 두 화면 밖으로 옮기기 직전, 주소가 바뀌기 전에 멈추고 이 문서에서는 다시 시작하지 않는다.
 * - 유입 경로는 acquisition-link.ts가 이 탭에 보관한 source·medium·campaign만 맞춤 태그로 넘긴다(개인을 구분하는 값 없음).
 * - 쿠키는 저장하지 않는다: 본체가 뜨기 전 대기열 맨 앞에 쿠키 저장 거부(consentv2, 광고·분석 둘 다 denied)를 쌓는다.
 */

export const CLARITY_TAG_URL = "https://www.clarity.ms/tag/";
export const CLARITY_SCRIPT_ID = "clarity-script";
/** 광고 저장·분석 저장 둘 다 거부. 공식 문서 예시 'Informing Clarity of denied consent'와 같은 값. */
export const CLARITY_CONSENT_DENIED = Object.freeze({ ad_Storage: "denied", analytics_Storage: "denied" });

/** q: 본체가 오기 전 쌓아 둔 호출, v: 본체가 실행 중이면 붙는 버전, ilgamcheck: 우리가 만든 대기열 표시. */
type ClarityFunction = ((...args: unknown[]) => void) & { q?: unknown[][]; v?: string; ilgamcheck?: true };
type ClarityWindow = Window & {
  clarity?: ClarityFunction;
  /** 이 문서에서 Clarity를 불러왔는지(loaded), 두 화면을 벗어나 멈췄는지(stopped). */
  __ILGAMCHECK_CLARITY__?: "loaded" | "stopped";
  doNotTrack?: string | null;
};

/** 브라우저의 추적 거부 신호. Global Privacy Control 또는 Do Not Track이 켜져 있으면 true. */
export function trackingOptOutRequested(): boolean {
  const signals = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };
  if (signals.globalPrivacyControl === true) return true;
  const doNotTrack = signals.doNotTrack ?? (window as ClarityWindow).doNotTrack;
  return doNotTrack === "1" || doNotTrack === "yes";
}

/** 맞춤 태그로 넘길 유입 경로. 값이 있는 것만, 이름은 링크의 utm 이름 그대로. */
export function clarityAcquisitionTags(acquisition: Acquisition | null): Array<[string, string]> {
  if (!acquisition) return [];
  const tags: Array<[string, string]> = [["utm_source", acquisition.source]];
  if (acquisition.medium) tags.push(["utm_medium", acquisition.medium]);
  if (acquisition.campaign) tags.push(["utm_campaign", acquisition.campaign]);
  return tags;
}

/** 이 문서를 처음 받은 주소의 경로. 화면 안 이동으로는 바뀌지 않는다. 알 수 없으면 null(불러오지 않는다). */
function documentStartPath(): string | null {
  try {
    const entry = performance.getEntriesByType("navigation")[0];
    return entry?.name ? new URL(entry.name).pathname : null;
  } catch {
    return null;
  }
}

/** `v`가 붙은 빈 함수. 공개 소스 queue.ts는 `v`가 있으면 본체를 띄우지 않고, 불러오기 스크립트도 본체를 붙이지 않는다. */
function blockedClarity(): ClarityFunction {
  const blocked: ClarityFunction = () => undefined;
  blocked.v = "stopped-by-ilgamcheck";
  return blocked;
}

/**
 * Clarity를 멈추고 이 문서에서 다시 시작하지 못하게 한다. 깨끗이 멈췄으면 true.
 * - 본체가 오기 전(우리 대기열 그대로): `v`가 붙은 빈 함수로 바꿔 시작 자체를 못 하게 한다.
 * - 실행 중(`v` 있음): 공개 소스의 `clarity("stop")`(clarity-js src/clarity.ts의 stop을 queue.ts가 이름으로 부른다)으로
 *   지금 화면까지의 기록을 보내고 화면 관찰을 끊는다. 멈추면 Clarity가 `window.clarity`를 새 대기열로 바꾸므로 그걸로 확인한다.
 * - 화면 안 이동 직후 Clarity가 스스로 다시 시작하려고 기다리는 중(`v` 없는 Clarity 대기열): "stop"을 쌓아
 *   다시 시작하자마자 멈추게 한다. 이때는 대기열을 바꾸면 쌓은 "stop"이 실행되지 않으므로 그대로 둔다.
 */
function stopClarity(w: ClarityWindow): boolean {
  if (w.__ILGAMCHECK_CLARITY__ !== "loaded") return true;
  w.__ILGAMCHECK_CLARITY__ = "stopped";
  const current = w.clarity;
  if (!current || current.ilgamcheck) {
    w.clarity = blockedClarity();
    return true;
  }
  try {
    current("stop");
  } catch {
    return false;
  }
  if (!current.v) return true;
  if (w.clarity === current) return false;
  w.clarity = blockedClarity();
  return true;
}

/**
 * 두 화면 밖으로 옮기기 직전에 멈춘다. Clarity를 붙이기 전에 깔아야 Clarity의 history 감싸기보다 안쪽,
 * popstate 듣기보다 앞에 선다(Clarity가 주소 변화를 보고 새 화면 기록을 시작하기 전에 멈춘다).
 * 멈추기에 실패하면(stop 명령이 없어진 경우) 새 문서로 열어 기록을 끊는다.
 */
function installLeaveGuard(w: ClarityWindow): void {
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method];
    window.history[method] = function guarded(this: History, data: unknown, unused: string, url?: string | URL | null) {
      if (url !== undefined && url !== null) {
        const target = new URL(String(url), window.location.href);
        if (!isClarityPagePath(target.pathname) && !stopClarity(w)) {
          window.location.assign(target.href);
          return;
        }
      }
      return original.call(this, data, unused, url);
    };
  }
  window.addEventListener("popstate", () => {
    if (!isClarityPagePath(window.location.pathname) && !stopClarity(w)) window.location.reload();
  });
}

/** 메인·둘러보기 화면이 열릴 때 한 번 부른다. 조건이 하나라도 안 맞으면 아무것도 하지 않는다. */
export function startClarityOnPage(): void {
  if (typeof window === "undefined") return;
  const w = window as ClarityWindow;
  if (w.__ILGAMCHECK_CLARITY__) return;
  const projectId = configuredClarityProjectId();
  if (!projectId) return;
  if (!isClarityPagePath(window.location.pathname)) return;
  const startPath = documentStartPath();
  if (!startPath || !isClarityPagePath(startPath)) return;
  if (trackingOptOutRequested()) return;
  if (w.clarity || document.getElementById(CLARITY_SCRIPT_ID)) return;

  // 레이아웃의 AcquisitionCapture보다 먼저 불려도 같은 결과가 되게 직접 옮겨 둔다(여러 번 불러도 같다).
  captureAcquisitionFromLocation();
  const tags = clarityAcquisitionTags(readPendingAcquisition());

  installLeaveGuard(w);
  w.__ILGAMCHECK_CLARITY__ = "loaded";
  const queue: ClarityFunction = (...args: unknown[]) => {
    (queue.q ||= []).push(args);
  };
  queue.ilgamcheck = true;
  w.clarity = queue;
  // 쿠키를 저장하지 않는다(사용자 결정 2026-11-13, 방침 '맞춤 광고에 제공하지 않습니다' 유지). 공식 Consent API v2의 '거부' 호출.
  // 거부 상태에서 Clarity는 쿠키 없이(화면을 열 때마다 새 ID) 기록을 이어 간다(learn.microsoft.com clarity-consent-api-v2).
  // 맞춤 태그보다 먼저 쌓는다: 공개 소스상 거부로 바뀌면 Clarity가 한 번 멈췄다 다시 시작하므로 그 뒤에 태그가 들어가야 남는다.
  queue("consentv2", CLARITY_CONSENT_DENIED);
  for (const [key, value] of tags) queue("set", key, value);

  const script = document.createElement("script");
  script.async = true;
  script.src = `${CLARITY_TAG_URL}${projectId}`;
  script.id = CLARITY_SCRIPT_ID;
  document.head.appendChild(script);
}
