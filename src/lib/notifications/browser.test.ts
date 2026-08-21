import { afterEach, describe, expect, it, vi } from "vitest";

import {
  requestBrowserNotificationPermission,
  sendTestNotification
} from "./browser";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser notification permission boundary", () => {
  it("does not ask for permission from the test helper", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    vi.stubGlobal("navigator", { serviceWorker: {}, userAgent: "", platform: "", maxTouchPoints: 0 });

    await expect(sendTestNotification()).resolves.toBe("permission-required");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("requests permission only through the explicit helper", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    vi.stubGlobal("navigator", { serviceWorker: {}, userAgent: "", platform: "", maxTouchPoints: 0 });

    await expect(requestBrowserNotificationPermission()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledOnce();
  });
});
