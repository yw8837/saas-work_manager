"use client";

import { useMemo, useState } from "react";

import { BetaPreviewNote, BetaPublicShell, isBetaPreviewMode } from "@/components/beta-public-shell";
import { BETA_SENDER } from "@/lib/beta/apply-copy";
import { isWellFormedBetaToken } from "@/lib/beta/rules";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { confirmBetaEmail, type BetaConfirmResult } from "@/lib/supabase/beta";

type Outcome = BetaConfirmResult | { status: "error"; adActive: false };

const MESSAGES: Record<Outcome["status"], { title: string; body: (adActive: boolean) => string }> = {
  confirmed: {
    title: "주소를 확인했어요",
    body: (adActive) => adActive
      ? "광고성 정보(이메일) 수신 동의가 유효해졌어요. 언제든 메일의 수신거부 링크로 철회할 수 있어요."
      : "광고성 정보 수신 동의가 철회돼 있거나 없어서 광고성 메일은 보내지 않아요.",
  },
  already_confirmed: {
    title: "이미 확인된 주소예요",
    body: (adActive) => adActive
      ? "광고성 정보(이메일) 수신 동의는 유효한 상태예요."
      : "광고성 정보 수신 동의가 철회돼 있거나 없어서 광고성 메일은 보내지 않아요.",
  },
  expired: {
    title: "확인 기간이 지난 링크예요",
    body: () => "이 링크로는 처리하지 않았어요. 광고성 정보 수신 동의는 유효하지 않은 상태로 남아요. 다시 받으시려면 신청 페이지에서 새로 신청해 주세요.",
  },
  invalid: {
    title: "확인할 수 없는 링크예요",
    body: () => "링크가 잘렸거나 이미 지워진 신청이에요. 처리하지 않았어요.",
  },
  rate_limited: {
    title: "지금은 처리하지 못했어요",
    body: () => "요청이 몰려 처리하지 않았어요. 잠시 뒤 다시 눌러 주세요.",
  },
  error: {
    title: "지금은 처리하지 못했어요",
    body: () => "연결에 문제가 있어 처리하지 않았어요. 잠시 뒤 다시 눌러 주세요.",
  },
};

/**
 * /apply/confirm/[token] 주소 확인. 링크를 여는 것(GET)만으로는 처리하지 않고 버튼을 눌러야 처리한다
 * (메일 보안 스캐너가 링크를 미리 열어도 확인되지 않게).
 */
export function BetaConfirmView({ token }: { token: string }) {
  const preview = useMemo(() => isBetaPreviewMode(), []);
  const wellFormed = isWellFormedBetaToken(token);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(wellFormed ? null : { status: "invalid", adActive: false });

  async function confirm() {
    if (preview) {
      setOutcome({ status: "confirmed", adActive: true });
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) {
      setOutcome({ status: "error", adActive: false });
      return;
    }
    setPending(true);
    try {
      setOutcome(await confirmBetaEmail(client, token));
    } catch {
      setOutcome({ status: "error", adActive: false });
    } finally {
      setPending(false);
    }
  }

  const previewNote = preview
    ? <BetaPreviewNote>미리보기: 실제로 처리되지 않음. 서버에 연결되지 않은 화면이라 어떤 기록도 바뀌지 않아요.</BetaPreviewNote>
    : null;

  return (
    <BetaPublicShell preview={previewNote}>
      {outcome ? (
        <div className="betaPublicIntro" role="status" data-testid="beta-confirm-result" data-status={outcome.status}>
          <h1>{MESSAGES[outcome.status].title}</h1>
          <p>{MESSAGES[outcome.status].body(outcome.adActive)}</p>
          {(outcome.status === "invalid" || outcome.status === "expired" || outcome.status === "error" || outcome.status === "rate_limited") && (
            <p>도움이 필요하면 {BETA_SENDER.email} 로 회신해 주세요.</p>
          )}
          {/* 일시 오류(연결 문제·호출 제한)는 새로고침 없이 다시 누를 수 있어야 한다. */}
          {(outcome.status === "error" || outcome.status === "rate_limited") && (
            <button className="primaryButton betaSubmit" type="button" onClick={confirm} disabled={pending}>
              {pending ? "확인하는 중" : "다시 확인하기"}
            </button>
          )}
        </div>
      ) : (
        <div className="betaPublicIntro">
          <h1>이메일 주소 확인</h1>
          <p>
            일감체크 신청 때 광고성 정보(이메일) 수신에 동의하셨다면, 아래 버튼을 눌러야 그 동의가 유효해져요.
            누르지 않으면 광고성 메일을 보내지 않아요.
          </p>
          <button className="primaryButton betaSubmit" type="button" onClick={confirm} disabled={pending}>
            {pending ? "확인하는 중" : "주소 확인하기"}
          </button>
        </div>
      )}
      <section className="betaNextStep" aria-label="본인이 신청하지 않았다면">
        <strong>본인이 신청하지 않으셨다면</strong>
        <p>
          확인 버튼을 누르지 마세요. 받으신 메일의 수신거부 링크로 바로 거부하시거나, {BETA_SENDER.email} 로 회신해
          신청 정보 삭제를 요청해 주세요. 이름·전화번호 같은 다른 정보는 묻지 않아요.
        </p>
      </section>
    </BetaPublicShell>
  );
}
