"use client";

import { useMemo, useState } from "react";

import { BetaPreviewNote, BetaPublicShell, isBetaPreviewMode } from "@/components/beta-public-shell";
import { BETA_SENDER } from "@/lib/beta/apply-copy";
import { koreanDate, isWellFormedBetaToken } from "@/lib/beta/rules";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { unsubscribeBetaAds, type BetaUnsubscribeResult } from "@/lib/supabase/beta";

type Outcome = BetaUnsubscribeResult | { status: "error"; eventKind: null; eventAt: null };

function FallbackChannel() {
  return (
    <p data-testid="beta-unsubscribe-fallback">
      대신 {BETA_SENDER.email} 로 &lsquo;수신거부&rsquo;라고 회신해 주시면 처리해 드려요.
      <br />
      <span lang="en">Alternatively, reply to {BETA_SENDER.email} with &ldquo;unsubscribe&rdquo;.</span>
    </p>
  );
}

/**
 * /u/[token] 광고성 정보 수신거부(로그인 없음, 한글·영문).
 * 버튼을 눌러야 처리한다. 화면과 주소에 수신자 이메일을 드러내지 않는다.
 */
export function BetaUnsubscribeView({ token }: { token: string }) {
  const preview = useMemo(() => isBetaPreviewMode(), []);
  const wellFormed = isWellFormedBetaToken(token);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(
    wellFormed ? null : { status: "invalid", eventKind: null, eventAt: null },
  );

  async function unsubscribe() {
    if (preview) {
      setOutcome({ status: "withdrawn", eventKind: "withdraw", eventAt: new Date().toISOString() });
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) {
      setOutcome({ status: "error", eventKind: null, eventAt: null });
      return;
    }
    setPending(true);
    try {
      setOutcome(await unsubscribeBetaAds(client, token));
    } catch {
      setOutcome({ status: "error", eventKind: null, eventAt: null });
    } finally {
      setPending(false);
    }
  }

  const previewNote = preview
    ? <BetaPreviewNote>미리보기: 실제로 처리되지 않음. 서버에 연결되지 않은 화면이라 수신거부가 기록되지 않아요.</BetaPreviewNote>
    : null;

  const processed = outcome && (outcome.status === "withdrawn" || outcome.status === "refused" || outcome.status === "already");

  return (
    <BetaPublicShell preview={previewNote}>
      {!outcome && (
        <div className="betaPublicIntro">
          <h1>광고성 이메일 수신거부</h1>
          <p>아래 버튼을 누르면 {BETA_SENDER.name}의 일감체크 광고성 이메일을 더 받지 않아요. 로그인이나 다른 정보는 필요 없어요.</p>
          <p lang="en">Press the button below to stop receiving promotional e-mail from {BETA_SENDER.name} (Ilgamcheck). No login or other information is required.</p>
          <button className="primaryButton betaSubmit" type="button" onClick={unsubscribe} disabled={pending}>
            {pending ? "처리하는 중 / Processing" : "수신거부 / Unsubscribe"}
          </button>
        </div>
      )}

      {processed && outcome.eventAt && (
        <div className="betaPublicIntro" role="status" data-testid="beta-unsubscribe-result" data-status={outcome.status}>
          <h1>{outcome.status === "already" ? "이미 수신거부가 처리돼 있어요" : "수신거부가 처리됐어요"}</h1>
          <p lang="en">{outcome.status === "already" ? "You have already unsubscribed." : "You have been unsubscribed."}</p>
          <section className="betaNotice" aria-label="광고성 정보 수신거부 처리 결과">
            <h2>처리 결과 안내</h2>
            <dl>
              <div><dt>전송자</dt><dd>{BETA_SENDER.name}</dd></div>
              <div><dt>의사표시</dt><dd>광고성 정보(이메일) 수신 {outcome.eventKind === "refuse" ? "거부" : "철회"}</dd></div>
              <div><dt>일자</dt><dd>{koreanDate(outcome.eventAt)}</dd></div>
              <div><dt>처리 결과</dt><dd>{outcome.eventKind === "refuse" ? "거부" : "철회"}가 처리되어 앞으로 광고성 이메일을 보내지 않습니다.</dd></div>
            </dl>
            <p lang="en">Result: processed on {koreanDate(outcome.eventAt)}. We will not send you promotional e-mail.</p>
            <p>신청 결과·일정 같은 운영 안내는 광고가 아니라서 신청하신 목적에 따라 따로 보내 드릴 수 있어요. 다시 받으시려면 신청 페이지에서 광고 수신에 새로 체크해 주세요.</p>
          </section>
        </div>
      )}

      {outcome && !processed && (
        <div className="betaPublicIntro" role="status" data-testid="beta-unsubscribe-result" data-status={outcome.status}>
          <h1>{outcome.status === "invalid" ? "확인할 수 없는 링크예요" : "지금은 처리하지 못했어요"}</h1>
          <p>
            {outcome.status === "invalid"
              ? "링크가 잘렸거나 바뀐 것 같아요. 수신거부는 처리되지 않았어요."
              : "수신거부는 처리되지 않았어요. 잠시 뒤 다시 시도해 주세요."}
          </p>
          <p lang="en">
            {outcome.status === "invalid"
              ? "This link could not be verified. You have NOT been unsubscribed."
              : "Your request was NOT processed. Please try again later."}
          </p>
          <FallbackChannel />
          {outcome.status !== "invalid" && (
            <button className="secondaryButton" type="button" onClick={() => setOutcome(null)}>다시 시도 / Try again</button>
          )}
        </div>
      )}
    </BetaPublicShell>
  );
}
