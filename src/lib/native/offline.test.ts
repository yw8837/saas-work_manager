import { beforeEach, expect, it } from "vitest";
import { createSeedState } from "@/lib/store";
import { createOfflineSnapshotStore } from "./offline";
import type { SecureSessionStore } from "./secure-storage";

const values = new Map<string, string>();
const store: SecureSessionStore = {
  async getItem(key) { return values.get(key) ?? null; },
  async setItem(key, value) { values.set(key, value); },
  async removeItem(key) { values.delete(key); },
};
const authKey = "sb-abcdefghijklmnopqrst-auth-token";
beforeEach(() => {
  values.clear();
  values.set(authKey, JSON.stringify({ user: { id: "owner-a" } }));
});
it("reads a confirmed snapshot without network and without embedding tokens or customer links", async () => {
  const offline = createOfflineSnapshotStore(store);
  await offline.save("owner-a", authKey, createSeedState(), "2026-10-21T00:00:00Z");
  const snapshot = await offline.load();
  expect(snapshot?.jobs.length).toBeGreaterThan(0);
  expect(snapshot?.confirmedAt).toBe("2026-10-21T00:00:00Z");
  expect(JSON.stringify(snapshot)).not.toContain("revisionPortalToken");
  expect(JSON.stringify(snapshot)).not.toContain("access_token");
});
it("never shows another owner's snapshot or one without a current stored session", async () => {
  const offline = createOfflineSnapshotStore(store);
  await offline.save("owner-a", authKey, createSeedState(), "2026-10-21T00:00:00Z");
  values.set(authKey, JSON.stringify({ user: { id: "owner-b" } }));
  expect(await offline.load()).toBeNull();
  values.delete(authKey);
  expect(await offline.load()).toBeNull();
});
it("fails closed under an unresolved reauthentication guard", async () => {
  const offline = createOfflineSnapshotStore(store);
  await offline.save("owner-a", authKey, createSeedState(), "2026-10-21T00:00:00Z");
  values.set("ilgam-native-auth-owner", "owner-b");
  expect(await offline.load()).toBeNull();
});
it("bounds the snapshot and clears it on explicit removal", async () => {
  const offline = createOfflineSnapshotStore(store);
  const state = createSeedState();
  state.jobs = Array.from({ length: 80 }, (_, id) => ({ ...state.jobs[0], id: `job_${id}` }));
  await offline.save("owner-a", authKey, state, "2026-10-21T00:00:00Z");
  expect((await offline.load())?.jobs).toHaveLength(30);
  expect((await offline.load())?.totalJobs).toBe(80);
  await offline.clear();
  expect(await offline.load()).toBeNull();
});
