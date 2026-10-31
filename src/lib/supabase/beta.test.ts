import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  BetaNotOperatorError,
  listBetaApplications,
  submitBetaApplication,
  unsubscribeBetaAds,
} from "./beta";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261101090000_beta_application_consent.sql"),
  "utf8",
);

function clientWith(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => response);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("베타 신청 migration 보안 계약", () => {
  it("공개 함수 3개는 security definer·빈 search_path이고 anon·authenticated에만 연다", () => {
    for (const fn of ["submit_beta_application", "confirm_beta_email", "unsubscribe_beta_ads"]) {
      const body = sql.slice(sql.indexOf(`create function public.${fn}(`));
      expect(body.slice(0, 1200)).toMatch(/security definer\s+set search_path = ''/);
    }
    expect(sql).toMatch(/grant execute on function\s+public\.submit_beta_application[\s\S]+?to anon, authenticated;/);
  });

  it("운영자 함수는 anon에서 빼고 authenticated에만 열며, 함수 안에서 운영자 표를 다시 확인한다", () => {
    expect(sql).toMatch(/public\.beta_ops_purge_expired\(\),\s+public\.beta_ops_prune_call_counters\(\)\s+from public, anon;/);
    expect(sql.match(/perform ilgam_private\.beta_require_operator\(\);/g)).toHaveLength(9);
  });

  it("표는 anon·authenticated 직접 접근을 막고, 저장소에 운영자 계정·실제 주소를 넣지 않는다", () => {
    expect(sql).toMatch(/revoke all on table[\s\S]+public\.beta_applications[\s\S]+from public, anon, authenticated;/);
    expect(sql).not.toMatch(/insert into public\.beta_operator_accounts/);
    expect(sql).not.toMatch(/@(?!example\.invalid)[a-z0-9-]+\.[a-z]{2,}/i);
  });

  it("신청 함수는 토큰을 돌려주지 않는다(남의 주소로 신청한 사람이 스스로 확인하지 못하게)", () => {
    const signature = sql.slice(sql.indexOf("create function public.submit_beta_application("), sql.indexOf("language plpgsql", sql.indexOf("create function public.submit_beta_application(")));
    expect(signature).not.toMatch(/token/);
  });
});

describe("베타 RPC 감싸기", () => {
  it("신청 결과를 화면 모양으로 바꾼다", async () => {
    const { client } = clientWith({
      data: [{ status: "received", ad_event_kind: "consent", ad_event_at: "2026-11-01T00:00:00Z", ad_notice_due_at: "2026-11-15T00:00:00Z" }],
      error: null,
    });
    await expect(submitBetaApplication(client, {
      email: "test01@example.invalid", workType: "web", sellsPackages: true, concurrentJobs: "4+", orderChannels: [],
      participation: "both", privacyConsent: true, adConsent: true, copyVersion: "beta-apply-v1-2026-11-01",
    })).resolves.toEqual({ status: "received", adEvent: { kind: "consent", at: "2026-11-01T00:00:00Z", dueAt: "2026-11-15T00:00:00Z" } });
  });

  it("필수 동의 거부 오류는 사람이 읽는 문장으로 바꾼다", async () => {
    const { client } = clientWith({ data: null, error: { message: "privacy_consent_required" } });
    await expect(submitBetaApplication(client, {
      email: "test01@example.invalid", workType: "web", sellsPackages: true, concurrentJobs: "4+", orderChannels: [],
      participation: "both", privacyConsent: false, adConsent: false, copyVersion: "beta-apply-v1-2026-11-01",
    })).rejects.toThrow("개인정보 수집·이용에 동의해야 신청할 수 있어요.");
  });

  it("수신거부 결과를 그대로 옮긴다", async () => {
    const { client, rpc } = clientWith({ data: [{ status: "already", event_kind: "refuse", event_at: "2026-11-01T00:00:00Z", notice_state: "emailed" }], error: null });
    await expect(unsubscribeBetaAds(client, "t".repeat(43))).resolves.toEqual({ status: "already", eventKind: "refuse", eventAt: "2026-11-01T00:00:00Z", noticeState: "emailed" });
    expect(rpc).toHaveBeenCalledWith("unsubscribe_beta_ads", { p_token: "t".repeat(43) });
  });

  it("운영자가 아니면 BetaNotOperatorError", async () => {
    const { client } = clientWith({ data: null, error: { code: "42501", message: "not_operator" } });
    await expect(listBetaApplications(client)).rejects.toBeInstanceOf(BetaNotOperatorError);
  });
});
