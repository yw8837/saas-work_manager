export type BrowserNotificationState = NotificationPermission | "unsupported";

export type NotificationCapability = {
  supported: boolean;
  permission: BrowserNotificationState;
  installedDisplayMode: boolean;
  requiresIosInstall: boolean;
};

function hasWindow() {
  return typeof window !== "undefined";
}

export function getNotificationState(): BrowserNotificationState {
  if (!hasWindow() || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  return Notification.permission;
}

export function isStandaloneDisplayMode(): boolean {
  if (!hasWindow()) return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

export function isIosLike(): boolean {
  if (!hasWindow()) return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function getNotificationCapability(): NotificationCapability {
  const permission = getNotificationState();
  const installedDisplayMode = isStandaloneDisplayMode();
  return {
    supported: permission !== "unsupported",
    permission,
    installedDisplayMode,
    requiresIosInstall: isIosLike() && !installedDisplayMode
  };
}

/**
 * Call from a click/tap handler only. The app must never call this on page load.
 */
export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationState> {
  if (getNotificationState() === "unsupported") return "unsupported";
  return Notification.requestPermission();
}

export async function registerIlgamcheckServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!hasWindow() || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/**
 * User-triggered local test. This proves browser permission/rendering only;
 * it does not prove hosted Web Push delivery.
 */
export async function sendTestNotification(): Promise<
  "shown" | "permission-required" | "denied" | "unsupported" | "worker-unavailable"
> {
  const state = getNotificationState();
  if (state === "unsupported") return "unsupported";
  if (state === "default") return "permission-required";
  if (state === "denied") return "denied";

  const registration = await registerIlgamcheckServiceWorker();
  if (!registration) return "worker-unavailable";
  const worker = registration.active ?? registration.waiting ?? registration.installing;

  if (worker) {
    worker.postMessage({ type: "ILGAMCHECK_TEST_NOTIFICATION" });
    return "shown";
  }

  await registration.showNotification("일감체크 테스트", {
    body: "알림이 정상적으로 보여요.",
    icon: "/icons/app-icon.svg",
    badge: "/icons/app-icon.svg",
    tag: "ilgamcheck-test",
    data: { url: "/settings" }
  });
  return "shown";
}

/**
 * Best-effort reminder while this tab stays open. It is deliberately named
 * in-page: reliable background delivery requires hosted Web Push.
 */
export function scheduleInPageReminder(
  at: Date,
  onDue: () => void,
  maxDelayMs = 2_147_000_000
): () => void {
  const delay = Math.min(Math.max(0, at.getTime() - Date.now()), maxDelayMs);
  const timer = window.setTimeout(onDue, delay);
  return () => window.clearTimeout(timer);
}
