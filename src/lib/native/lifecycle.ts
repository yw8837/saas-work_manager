import { App } from "@capacitor/app";
import { nativePlatform } from "./platform";

/** Callers report refresh failures; this listener must survive a temporary disconnect. */
export async function subscribeNativeResume(onResume: () => Promise<void>): Promise<() => void> {
  let stopped = false;
  let running = false;
  let queued = false;
  const refresh = async () => {
    if (stopped) return;
    if (running) { queued = true; return; }
    running = true;
    try {
      do {
        queued = false;
        await onResume().catch(() => undefined);
      } while (queued && !stopped);
    } finally {
      running = false;
    }
  };
  const onOnline = () => { void refresh(); };
  const listener = nativePlatform() === "web" ? null : await App.addListener(
    "appStateChange",
    ({ isActive }) => { if (isActive) void refresh(); },
  );
  window.addEventListener("online", onOnline);
  return () => {
    if (stopped) return;
    stopped = true;
    queued = false;
    window.removeEventListener("online", onOnline);
    void listener?.remove().catch(() => undefined);
  };
}
