import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadHostedWorkspace } from "@/lib/supabase/workspace";
import { createSecureSessionStore } from "./secure-storage";
import { nativePlatform } from "./platform";
import { parseRevisionNotification } from "./push-contract";

interface NativeMessaging {
  getToken(): Promise<{ token: string }>;
  deleteToken(): Promise<void>;
  addListener(name: "tokenRefreshed", callback: (data: { token: string }) => void): Promise<PluginListenerHandle>;
}
const messaging = registerPlugin<NativeMessaging>("NativeMessaging");
const installationKey = "ilgam-native-push-installation";
const optedOwnerKey = "ilgam-native-push-owner";
const store = createSecureSessionStore();
type PushStatus = "disabled" | "enabling" | "enabled" | "denied" | "unavailable";
let status: PushStatus = "disabled";
const subscribers = new Set<() => void>();
export const nativePushStatus = () => status;
export function subscribeNativePush(callback: () => void) { subscribers.add(callback); return () => { subscribers.delete(callback); }; }
function publish(next: PushStatus) { status=next; subscribers.forEach((callback) => callback()); }

let owner: string | null = null;
let generation=0;
let listeners: PluginListenerHandle[] = [];
let registrationChain: Promise<void> = Promise.resolve();
let finishEnable: ((result: "enabled" | "unavailable") => void) | null = null;
let enabling: Promise<"enabled" | "denied" | "unavailable"> | null = null;
let wanted=false;

async function installationId() {
  const saved = await store.getItem(installationKey);
  if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
  const created = crypto.randomUUID();
  await store.setItem(installationKey,created);
  return created;
}
async function currentClient(expectedOwner: string) {
  const client=getSupabaseBrowserClient();
  const session=await client?.auth.getSession();
  return session?.data.session?.user.id===expectedOwner ? client : null;
}

async function acceptToken(token: string, expectedOwner: string, epoch: number) {
  if (!wanted || generation!==epoch || owner!==expectedOwner) return;
  if (typeof token!=="string" || token.length<32 || token.length>4096 || /\s/.test(token)) throw new Error("invalid token");
  const client=await currentClient(expectedOwner);
  const id=await installationId();
  if (!client || generation!==epoch || !wanted) return;
  const { error }=await client.rpc("register_native_push_device",{
    p_installation_id:id,p_platform:nativePlatform(),p_token:token,
  });
  if (error) throw new Error("device registration failed");
  if (generation!==epoch || !wanted) return;
  await store.setItem(optedOwnerKey,expectedOwner);
  publish("enabled");
  finishEnable?.("enabled");
}
function queueToken(token: string, expectedOwner: string, epoch: number) {
  registrationChain=registrationChain.then(() => acceptToken(token,expectedOwner,epoch)).catch(() => {
    if (generation!==epoch) return;
    publish("unavailable"); finishEnable?.("unavailable");
  });
  return registrationChain;
}

export async function openNativeRevision(data: unknown): Promise<void> {
  const parsed=parseRevisionNotification(data), expected=owner, epoch=generation;
  if (!parsed || !expected) return;
  const client=await currentClient(expected);
  if (!client) return;
  // Re-read under the active JWT/RLS. The notification never authorizes a job
  // and never increments a revision count.
  const fresh=await loadHostedWorkspace(client,expected);
  if (generation!==epoch || owner!==expected) return;
  const job=fresh?.state.jobs.find((item) => item.id===parsed.jobKey);
  if (!job?.revisions.some((request) => request.id===parsed.requestId)) return;
  globalThis.location.assign(`/jobs/${encodeURIComponent(job.id)}#revisions`);
}

export async function disposeNativePush(): Promise<void> {
  generation++; wanted=false;
  finishEnable?.("unavailable"); finishEnable=null;
  enabling=null;
  const old=listeners; listeners=[];
  owner=null; publish("disabled");
  await Promise.all(old.map((handle) => handle.remove().catch(() => undefined)));
  await registrationChain;
}
export async function initializeNativePush(nextOwner: string | null): Promise<void> {
  const epoch=generation+1;
  await disposeNativePush();
  if (generation!==epoch || nativePlatform()==="web") return;
  owner=nextOwner;
  if (!nextOwner) {
    await PushNotifications.unregister().catch(() => undefined);
    if (nativePlatform()==="ios") await messaging.deleteToken().catch(() => undefined);
    return;
  }
  const add=async (handle: Promise<PluginListenerHandle>) => {
    const result=await handle;
    if (generation!==epoch) await result.remove();
    else listeners.push(result);
  };
  try {
    await add(PushNotifications.addListener("registration", ({ value }) => {
      if (nativePlatform()==="ios") {
        // Capacitor's iOS registration value is an APNs token, NOT an FCM token.
        void messaging.getToken().then(({ token }) => queueToken(token,nextOwner,epoch)).catch(() => {
          if (generation===epoch) { publish("unavailable"); finishEnable?.("unavailable"); }
        });
      } else void queueToken(value,nextOwner,epoch);
    }));
    await add(PushNotifications.addListener("registrationError", () => {
      if (generation===epoch) { publish("unavailable"); finishEnable?.("unavailable"); }
    }));
    await add(PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      if (generation===epoch) return openNativeRevision(notification.data).catch(() => undefined);
    }));
    if (nativePlatform()==="ios") {
      await add(messaging.addListener("tokenRefreshed", ({ token }) => { void queueToken(token,nextOwner,epoch); }));
    }
    const opted=await store.getItem(optedOwnerKey);
    if (generation!==epoch) return;
    if (opted===nextOwner && (await PushNotifications.checkPermissions()).receive==="granted") {
      await enableNativePush();
    } else if (opted && opted!==nextOwner) {
      await PushNotifications.unregister();
      if (nativePlatform()==="ios") await messaging.deleteToken();
      await store.removeItem(optedOwnerKey);
    }
  } catch {
    if (generation===epoch) publish("unavailable");
  }
}

export function enableNativePush(): Promise<"enabled" | "denied" | "unavailable"> {
  if (enabling) return enabling;
  const epoch=generation;
  const pending=(async () => {
    if (nativePlatform()==="web" || !owner) return "unavailable" as const;
    publish("enabling");
    try {
      let permission=await PushNotifications.checkPermissions();
      if (permission.receive==="prompt" || permission.receive==="prompt-with-rationale") {
        permission=await PushNotifications.requestPermissions();
      }
      if (epoch!==generation) return "unavailable" as const;
      if (permission.receive!=="granted") { publish("denied"); return "denied" as const; }
      wanted=true;
      if (nativePlatform()==="android") await PushNotifications.createChannel({
        id:"revisions",name:"고객 수정 요청",importance:4,visibility:0,
      });
      if (epoch!==generation || !wanted) return "unavailable" as const;
      return await new Promise<"enabled" | "unavailable">((resolve) => {
        const finish=(result: "enabled" | "unavailable") => {
          clearTimeout(timer);
          if (finishEnable===finish) finishEnable=null;
          resolve(result);
        };
        const timer=setTimeout(() => { if(epoch===generation) publish("unavailable"); finish("unavailable"); },20_000);
        finishEnable=finish;
        void PushNotifications.register().catch(() => {
          if(epoch===generation) publish("unavailable");
          finish("unavailable");
        });
      });
    } catch { if (epoch===generation) publish("unavailable"); return "unavailable" as const; }
  })().finally(() => { if (enabling===pending) enabling=null; });
  enabling=pending;
  return enabling;
}

/** Must run while the owner's JWT is still valid, before local sign out. */
export async function disableNativePush(): Promise<void> {
  if (nativePlatform()==="web") return;
  wanted=false; finishEnable?.("unavailable");
  await registrationChain;
  const id=await store.getItem(installationKey);
  if (id && owner) {
    const client=await currentClient(owner);
    if (!client) throw new Error("알림 해제를 위해 로그인 상태를 확인해주세요.");
    const { error }=await client.rpc("revoke_native_push_device",{ p_installation_id:id });
    if (error) throw new Error("기기 알림을 해제하지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.");
  }
  await PushNotifications.unregister();
  if (nativePlatform()==="ios") await messaging.deleteToken();
  // iOS rejects tray access before APNs registers in this process. Server
  // revocation and unregister above already prevent new owner notifications.
  await PushNotifications.removeAllDeliveredNotifications().catch(() => undefined);
  await store.removeItem(optedOwnerKey);
  publish("disabled");
}
