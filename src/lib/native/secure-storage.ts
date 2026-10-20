import { SecureSession, type SecureSessionBridge } from "./bridge";

export interface SecureSessionStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function validateKey(key: string) {
  if (!/^(sb-|ilgam-native-)[A-Za-z0-9._-]{1,200}$/.test(key)) {
    throw new Error("SECURE_SESSION_KEY_INVALID");
  }
}

/** No plaintext or memory fallback: unavailable storage must surface as an error. */
export function createSecureSessionStore(bridge: SecureSessionBridge = SecureSession): SecureSessionStore {
  return {
    async getItem(key) {
      validateKey(key);
      const { value } = await bridge.get({ key });
      if (value !== null && typeof value !== "string") throw new Error("SECURE_SESSION_INVALID");
      return value;
    },
    async setItem(key, value) {
      validateKey(key);
      if (new TextEncoder().encode(value).length > 131072) throw new Error("SECURE_SESSION_VALUE_TOO_LARGE");
      await bridge.set({ key, value });
    },
    async removeItem(key) {
      validateKey(key);
      await bridge.remove({ key });
    },
  };
}
