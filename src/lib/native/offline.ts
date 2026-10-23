import { getRevisionSummary } from "@/lib/domain";
import type { AppState } from "@/lib/store";
import { getPublicEnvironmentValue } from "@/lib/public-environment";
import { assertNativeSessionOwner } from "./auth";
import { nativePlatform } from "./platform";
import { createSecureSessionStore, type SecureSessionStore } from "./secure-storage";

const snapshotKey = "ilgam-native-offline-workspace";
const validAuthKey = /^sb-[a-z0-9-]+-auth-token$/;
type OfflineJob = {
  id: string; clientLabel: string; title: string; dueDate: string;
  doneTasks: number; totalTasks: number; remainingRevisions: number; tasks: string[];
};
export type OfflineSnapshot = {
  version: 1; owner: string; authKey: string; confirmedAt: string; totalJobs: number; jobs: OfflineJob[];
};
function isSnapshot(value: unknown): value is OfflineSnapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as OfflineSnapshot;
  return row.version === 1 && typeof row.owner === "string" && row.owner.length <= 128
    && typeof row.authKey === "string" && validAuthKey.test(row.authKey)
    && typeof row.confirmedAt === "string" && Number.isFinite(Date.parse(row.confirmedAt))
    && Number.isSafeInteger(row.totalJobs) && row.totalJobs >= 0
    && Array.isArray(row.jobs) && row.jobs.length <= 30
    && row.jobs.every((job) => job && typeof job === "object"
      && ["id", "clientLabel", "title", "dueDate"].every((key) => typeof job[key as keyof OfflineJob] === "string")
      && [job.doneTasks, job.totalTasks, job.remainingRevisions].every((count) => Number.isSafeInteger(count) && count >= 0)
      && Array.isArray(job.tasks) && job.tasks.length <= 5 && job.tasks.every((task) => typeof task === "string"));
}
export function createOfflineSnapshotStore(store: SecureSessionStore) {
  async function matchesStoredSession(owner: string, authKey: string) {
    const raw = await store.getItem(authKey);
    if (!raw) return false;
    const session = JSON.parse(raw);
    if (session?.user?.id !== owner) return false;
    await assertNativeSessionOwner(store, owner);
    return true;
  }
  return {
    async save(owner: string, authKey: string, state: AppState, confirmedAt: string) {
      if (!validAuthKey.test(authKey) || !Number.isFinite(Date.parse(confirmedAt))) return;
      if (!await matchesStoredSession(owner, authKey)) return;
      const active = state.jobs.filter((job) => job.status === "active").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const snapshot: OfflineSnapshot = {
        version: 1, owner, authKey, confirmedAt, totalJobs: active.length,
        jobs: active.slice(0, 30).map((job) => ({
          id: job.id.slice(0, 120), clientLabel: job.clientLabel.slice(0, 100), title: job.title.slice(0, 120),
          dueDate: job.dueDate, doneTasks: job.tasks.filter((task) => task.status === "done").length,
          totalTasks: job.tasks.length, remainingRevisions: getRevisionSummary(job).remaining,
          tasks: job.tasks.filter((task) => task.status !== "done").slice(0, 5).map((task) => task.title.slice(0, 100)),
        })),
      };
      await store.setItem(snapshotKey, JSON.stringify(snapshot));
    },
    async load(): Promise<OfflineSnapshot | null> {
      try {
        const raw = await store.getItem(snapshotKey);
        if (!raw || new TextEncoder().encode(raw).length > 131072) return null;
        const snapshot: unknown = JSON.parse(raw);
        if (!isSnapshot(snapshot) || !await matchesStoredSession(snapshot.owner, snapshot.authKey)) return null;
        return snapshot;
      } catch { return null; }
    },
    async clear() { await store.removeItem(snapshotKey); },
  };
}
export async function saveNativeOfflineSnapshot(owner: string, state: AppState, confirmedAt: string) {
  if (nativePlatform() === "web") return;
  const url = getPublicEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL");
  if (!url) return;
  const authKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  await createOfflineSnapshotStore(createSecureSessionStore()).save(owner, authKey, state, confirmedAt);
}
export async function loadNativeOfflineSnapshot() {
  return nativePlatform() === "web" ? null : createOfflineSnapshotStore(createSecureSessionStore()).load();
}
export async function clearNativeOfflineSnapshot() {
  if (nativePlatform() !== "web") await createOfflineSnapshotStore(createSecureSessionStore()).clear();
}
