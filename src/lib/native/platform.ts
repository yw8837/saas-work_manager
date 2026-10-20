import { Capacitor } from "@capacitor/core";
import { deploymentOrigin } from "@/lib/deployment-origin";

export type NativePlatform = "web" | "android" | "ios";
export type NativeApiPath = "/api/public-config" | "/api/account/delete";

export function nativePlatform(): NativePlatform {
  if (!Capacitor.isNativePlatform()) return "web";
  const value = Capacitor.getPlatform();
  return value === "android" || value === "ios" ? value : "web";
}

export function nativeApiUrl(path: NativeApiPath, platform = nativePlatform()): string {
  if (path !== "/api/public-config" && path !== "/api/account/delete") {
    throw new Error("NATIVE_API_PATH_INVALID");
  }
  return platform === "web" ? path : `${deploymentOrigin()}${path}`;
}
