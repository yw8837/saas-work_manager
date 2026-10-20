import { registerPlugin } from "@capacitor/core";

export interface SecureSessionBridge {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

export const SecureSession = registerPlugin<SecureSessionBridge>("SecureSession");
