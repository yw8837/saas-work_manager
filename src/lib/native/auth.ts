import type { SecureSessionStore } from "./secure-storage";

export const NATIVE_AUTH_CALLBACK = "com.yeolmaestudio.ilgamcheck://auth/callback";
const PENDING_KEY = "ilgam-native-auth-pending";
const REAUTH_GUARD_KEY = "ilgam-native-auth-owner";
const MAX_AGE_MS = 10 * 60 * 1000;
export type NativeAuthCallback = { code: string } | { error: string };
export type NativeAuthProvider = "google" | "apple";

/** The SDK saves a session before exchangeCodeForSession resolves. Keep this
 * guard in OS storage, independent of consumed callbacks and sessionStorage. */
export async function assertNativeSessionOwner(store: SecureSessionStore, owner: string): Promise<void> {
  const expected = await store.getItem(REAUTH_GUARD_KEY);
  if (expected !== null && expected !== owner) throw new Error("AUTH_ACCOUNT_MISMATCH");
}

export function parseNativeAuthCallback(raw: string): NativeAuthCallback | null {
  if (raw.length > 4096 || !raw.startsWith(`${NATIVE_AUTH_CALLBACK}?`)) return null;
  try {
    const url = new URL(raw);
    if (`${url.protocol}//${url.host}${url.pathname}` !== NATIVE_AUTH_CALLBACK
      || url.username || url.password || url.port || url.hash) return null;
    const code = url.searchParams.getAll("code");
    const errors = url.searchParams.getAll("error");
    if (code.length === 1 && errors.length === 0
      && [...url.searchParams.keys()].every((key) => key === "code")
      && /^[A-Za-z0-9._~-]{1,2048}$/.test(code[0])) return { code: code[0] };
    if (code.length === 0 && errors.length === 1
      && [...url.searchParams.keys()].every((key) => ["error", "error_code", "error_description"].includes(key))) {
      return { error: errors[0] === "access_denied" ? "AUTH_CANCELLED" : "AUTH_FAILED" };
    }
    return null;
  } catch { return null; }
}

type PendingLogin = { version: 1; createdAt: number; path: "/today" | "/settings"; owner: string | null };
type Dependencies = {
  store: SecureSessionStore;
  now: () => number;
  authorizeOrigin: string;
  begin: (provider: NativeAuthProvider) => Promise<string>;
  exchange: (code: string) => Promise<string>;
  open: (url: string) => Promise<void>;
  close: () => Promise<void>;
  signOut: () => Promise<void>;
  prepareReauthentication: (owner: string | null) => void;
  navigate: (path: string) => void;
};

export function createNativeAuthCoordinator(deps: Dependencies) {
  let starting = false;
  let handling = false;
  let generation = 0;

  async function pending(): Promise<PendingLogin | null> {
    const raw = await deps.store.getItem(PENDING_KEY);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as PendingLogin;
      if (value.version === 1 && Number.isSafeInteger(value.createdAt)
        && value.createdAt <= deps.now() && deps.now() - value.createdAt <= MAX_AGE_MS
        && ["/today", "/settings"].includes(value.path)
        && (value.owner === null || (typeof value.owner === "string" && value.owner.length > 0 && value.owner.length <= 128))
        && (value.path !== "/settings" || value.owner !== null)) return value;
    } catch { /* Invalid local state cannot authorize a callback. */ }
    await deps.store.removeItem(PENDING_KEY);
    return null;
  }

  async function clear() {
    await deps.store.removeItem(PENDING_KEY);
    deps.prepareReauthentication(null);
  }

  return {
    async start(provider: NativeAuthProvider, path: string, owner: string | null = null): Promise<void> {
      if (path !== "/today" && path !== "/settings") throw new Error("AUTH_REDIRECT_INVALID");
      if (path === "/settings" && !owner) throw new Error("AUTH_REAUTH_OWNER_REQUIRED");
      if (starting || handling) throw new Error("AUTH_ALREADY_PENDING");
      starting = true;
      const attempt = generation;
      let written = false;
      try {
        if (await pending()) throw new Error("AUTH_ALREADY_PENDING");
        // A previous process may have died during an exchange. Explicit retry
        // first removes that uncertain session; a failed sign-out keeps guard.
        if (await deps.store.getItem(REAUTH_GUARD_KEY)) {
          await deps.signOut();
          await deps.store.removeItem(REAUTH_GUARD_KEY);
        }
        const request: PendingLogin = { version: 1, createdAt: deps.now(), path, owner };
        await deps.store.setItem(PENDING_KEY, JSON.stringify(request));
        written = true;
        const rawUrl = await deps.begin(provider);
        const url = new URL(rawUrl);
        if (url.origin !== deps.authorizeOrigin || url.protocol !== "https:" || url.pathname !== "/auth/v1/authorize"
          || url.username || url.password || url.hash) throw new Error("AUTH_AUTHORIZE_URL_INVALID");
        if (generation !== attempt) throw new Error("AUTH_CANCELLED");
        deps.prepareReauthentication(owner);
        await deps.open(url.toString());
      } catch (error) {
        if (written) await clear();
        throw error;
      } finally { starting = false; }
    },

    async complete(rawUrl: string): Promise<"handled" | "ignored"> {
      const callback = parseNativeAuthCallback(rawUrl);
      if (!callback || handling) return "ignored";
      handling = true;
      const attempt = generation;
      try {
        const request = await pending();
        if (!request) return "ignored";
        if (request.owner && !("error" in callback)) {
          await deps.store.setItem(REAUTH_GUARD_KEY, request.owner);
        }
        // Consume the one-time callback but retain the durable owner guard.
        await deps.store.removeItem(PENDING_KEY);
        if ("error" in callback) {
          deps.prepareReauthentication(null);
          await deps.close().catch(() => undefined);
          throw new Error(callback.error);
        }
        deps.prepareReauthentication(request.owner);
        const owner = await deps.exchange(callback.code);
        if (attempt !== generation || (request.owner !== null && request.owner !== owner)) {
          await deps.signOut();
          await deps.store.removeItem(REAUTH_GUARD_KEY);
          throw new Error(attempt !== generation ? "AUTH_CANCELLED" : "AUTH_ACCOUNT_MISMATCH");
        }
        await deps.store.removeItem(REAUTH_GUARD_KEY);
        await deps.close().catch(() => undefined);
        deps.navigate(request.path);
        return "handled";
      } finally {
        handling = false;
      }
    },

    async cancel(): Promise<void> {
      generation++;
      await clear();
      // An in-flight SDK exchange can still write its session after cancellation.
      if (!handling) {
        if (await deps.store.getItem(REAUTH_GUARD_KEY)) await deps.signOut();
        await deps.store.removeItem(REAUTH_GUARD_KEY);
      }
      await deps.close().catch(() => undefined);
    },
    isHandling: () => handling,
    hasPending: async () => (await pending()) !== null,
  };
}
