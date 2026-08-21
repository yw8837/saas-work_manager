export {
  getNotificationCapability,
  getNotificationState,
  isIosLike,
  isStandaloneDisplayMode,
  registerIlgamcheckServiceWorker,
  requestBrowserNotificationPermission,
  scheduleInPageReminder,
  sendTestNotification
} from "./browser";

export type { BrowserNotificationState, NotificationCapability } from "./browser";
export { deriveInAppAlerts } from "./queue";
