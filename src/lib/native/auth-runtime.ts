import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import type { PluginListenerHandle } from "@capacitor/core";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getPublicEnvironmentValue } from "@/lib/public-environment";
import { GOOGLE_REAUTH_OWNER_SESSION_KEY } from "@/lib/supabase/reauthentication-context";
import { assertNativeSessionOwner, createNativeAuthCoordinator, NATIVE_AUTH_CALLBACK, type NativeAuthProvider } from "./auth";
import { nativePlatform } from "./platform";
import { createSecureSessionStore } from "./secure-storage";

type Status = { pending: boolean; error: string | null };
let status: Status = { pending: false, error: null };
const subscribers = new Set<(value: Status) => void>();
let controller: ReturnType<typeof createNativeAuthCoordinator> | null = null;
let initialized: Promise<void> | null = null;
let listeners: PluginListenerHandle[] = [];
let expiry: ReturnType<typeof setTimeout> | undefined;
let cancelling = false;

export const nativeAuthStatus = (): Status => status;
export async function validateNativeSessionOwner(owner: string): Promise<void> {
  if (nativePlatform() !== "web") await assertNativeSessionOwner(createSecureSessionStore(), owner);
}
export function subscribeNativeAuth(listener: (value: Status) => void): () => void {
  subscribers.add(listener);
  listener(status);
  return () => { subscribers.delete(listener); };
}
function publish(next: Status) {
  status = next;
  if (!next.pending) { clearTimeout(expiry); expiry = undefined; }
  for (const listener of subscribers) listener(next);
}
function message(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "AUTH_ALREADY_PENDING") return "로그인 창이 열려 있어요. 취소한 뒤 다시 시작할 수 있어요.";
  if (code === "AUTH_CANCELLED") return "로그인을 취소했어요. 다시 시도할 수 있어요.";
  if (code === "AUTH_ACCOUNT_MISMATCH") return "기존 계정과 다른 계정으로 인증했어요. 기존 Google 계정으로 다시 로그인해주세요.";
  return "앱 로그인을 완료하지 못했어요. 다시 시도해주세요.";
}
function client() {
  const value = getSupabaseBrowserClient();
  if (!value) throw new Error("NATIVE_AUTH_UNAVAILABLE");
  return value;
}
function instance() {
  if (controller) return controller;
  const url = getPublicEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL");
  if (!url) throw new Error("NATIVE_AUTH_UNAVAILABLE");
  controller = createNativeAuthCoordinator({
    store: createSecureSessionStore(),
    now: Date.now,
    authorizeOrigin: new URL(url).origin,
    async begin(provider) {
      const { data, error } = await client().auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: NATIVE_AUTH_CALLBACK,
          skipBrowserRedirect: true,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error || !data.url) throw new Error("NATIVE_AUTH_BEGIN_FAILED");
      return data.url;
    },
    async exchange(code) {
      const { data, error } = await client().auth.exchangeCodeForSession(code);
      if (error || !data.session?.user.id) throw new Error("NATIVE_AUTH_EXCHANGE_FAILED");
      return data.session.user.id;
    },
    async open(url) { await Browser.open({ url }); },
    async close() { await Browser.close(); },
    async signOut() {
      const { error } = await client().auth.signOut({ scope: "local" });
      if (error) throw new Error("NATIVE_AUTH_SIGNOUT_FAILED");
    },
    prepareReauthentication(owner) {
      if (owner) window.sessionStorage.setItem(GOOGLE_REAUTH_OWNER_SESSION_KEY, owner);
      else window.sessionStorage.removeItem(GOOGLE_REAUTH_OWNER_SESSION_KEY);
    },
    navigate(path) { window.location.assign(path); },
  });
  return controller;
}
async function removeVerifier() {
  const url = getPublicEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL");
  if (!url) return;
  await createSecureSessionStore().removeItem(`sb-${new URL(url).hostname.split(".")[0]}-auth-token-code-verifier`);
}
async function handleCallback(url: string): Promise<"handled" | "ignored"> {
  try {
    const result = await instance().complete(url);
    if (result === "handled") publish({ pending: false, error: null });
    else if (!await instance().hasPending() && !instance().isHandling()) publish({ pending: false, error: null });
    return result;
  } catch (error) {
    await removeVerifier().catch(() => undefined);
    publish({ pending: false, error: message(error) });
    return "handled";
  }
}

export function initializeNativeAuth(): Promise<void> {
  if (nativePlatform() === "web") return Promise.resolve();
  if (initialized) return initialized;
  initialized = (async () => {
    try {
      instance();
      listeners.push(await App.addListener("appUrlOpen", async ({ url }) => { await handleCallback(url); }));
      listeners.push(await Browser.addListener("browserFinished", async () => {
        if (!cancelling && status.pending && !instance().isHandling()) await cancelNativeOAuth();
      }));
      publish({ pending: await instance().hasPending(), error: null });
      const launch = await App.getLaunchUrl();
      if (launch?.url) await handleCallback(launch.url);
    } catch (error) {
      await Promise.all(listeners.map((listener) => listener.remove()));
      listeners = [];
      initialized = null;
      publish({ pending: false, error: message(error) });
      throw new Error(message(error));
    }
  })();
  return initialized;
}

export async function startNativeOAuth(provider: NativeAuthProvider, redirectPath: string, owner: string | null = null): Promise<void> {
  // Apple requires provider configuration AND server token revocation support.
  // Do not offer a sign-in method whose deletion lifecycle is not ready.
  if (provider === "apple") throw new Error("Apple 로그인은 개발자 계정과 계정 삭제 연동 설정 후 제공해요.");
  await initializeNativeAuth();
  try {
    await instance().start(provider, redirectPath, owner);
    const pending = await instance().hasPending();
    publish({ pending, error: null });
    clearTimeout(expiry);
    if (pending) expiry = setTimeout(() => { void cancelNativeOAuth().catch(() => undefined); }, 10 * 60 * 1000);
  } catch (error) {
    publish({ pending: await instance().hasPending(), error: message(error) });
    throw new Error(message(error));
  }
}

export async function completeNativeOAuth(url: string): Promise<"handled" | "ignored"> {
  if (nativePlatform() === "web") return "ignored";
  await initializeNativeAuth();
  return handleCallback(url);
}

export async function cancelNativeOAuth(): Promise<void> {
  if (!controller || cancelling) return;
  cancelling = true;
  publish({ pending: false, error: null });
  try {
    await controller.cancel();
    await removeVerifier();
  } finally { cancelling = false; }
}

export async function disposeNativeAuth(): Promise<void> {
  if (initialized) await initialized.catch(() => undefined);
  await cancelNativeOAuth();
  await Promise.all(listeners.map((listener) => listener.remove()));
  listeners = [];
  initialized = null;
  clearTimeout(expiry);
}
