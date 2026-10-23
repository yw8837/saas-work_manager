import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(resolve("supabase/migrations/20261023112855_native_push_scheduler.sql"), "utf8");
describe("native push scheduler boundary", () => {
  it("keeps secrets in Vault and the dispatch function outside the public API", () => {
    expect(sql).toContain("create function ilgam_private.dispatch_native_push()");
    expect(sql).toContain("security invoker set search_path=''");
    expect(sql).toContain("from public,anon,authenticated,service_role");
    expect(sql).toContain("vault.decrypted_secrets");
    expect(sql).not.toMatch(/sbp_|BEGIN PRIVATE KEY|eyJ[A-Za-z0-9]{30}/);
    expect(sql).not.toContain("security definer");
  });
  it("bounds frequency and network timeout and skips the network on an empty queue", () => {
    expect(sql).toContain("'ilgam-native-revision-push','* * * * *'");
    expect(sql).toContain("if not exists");
    expect(sql).toContain("timeout_milliseconds:=10000");
    expect(sql).toContain("a.attempts<5");
    expect(sql).toContain("a.lease_until<clock_timestamp()");
    expect(sql).toContain("a.next_attempt_at<=clock_timestamp()");
  });
});
describe('signed dispatch does not leak a reusable key into managed HTTP queues',()=>{
  const signed=readFileSync(resolve('supabase/migrations/20261023113840_native_push_signed_dispatch.sql'),'utf8');
  it('queues only expiring signatures and disables scheduling until Edge verification',()=>{
    expect(signed).not.toContain("'x-native-push-secret'");
    expect(signed).toContain('extensions.hmac(v_message,v_secret');
    expect(signed).toContain("'x-native-push-signature',v_signature");
    expect(signed).toContain('on conflict do nothing');
    expect(signed).toContain('active:=false');
  });
});
