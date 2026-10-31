"use client";

import { useMemo, useState, type FormEvent } from "react";

import { BetaPreviewNote, BetaPublicShell, isBetaPreviewMode } from "@/components/beta-public-shell";
import {
  AD_CONSENT_COPY,
  BETA_APPLY_COPY_VERSION,
  BETA_SENDER,
  CONCURRENT_JOB_OPTIONS,
  ORDER_CHANNEL_OPTIONS,
  PARTICIPATION_OPTIONS,
  PRIVACY_CONSENT_COPY,
  WORK_TYPE_OPTIONS,
  type BetaConcurrentJobs,
  type BetaOrderChannel,
  type BetaParticipation,
  type BetaWorkType,
} from "@/lib/beta/apply-copy";
import { isValidBetaEmail, koreanDate, noticeDueAt } from "@/lib/beta/rules";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { submitBetaApplication } from "@/lib/supabase/beta";

type Completed = {
  preview: boolean;
  adEvent: { at: string; dueAt: string } | null;
};

/** /apply 베타·인터뷰 신청(로그인 없음). 로컬 모드에서는 저장하지 않는 미리보기다. */
export function BetaApplyForm() {
  const preview = useMemo(() => isBetaPreviewMode(), []);
  const [email, setEmail] = useState("");
  const [workType, setWorkType] = useState<BetaWorkType | "">("");
  const [sellsPackages, setSellsPackages] = useState<"yes" | "no" | "">("");
  const [concurrentJobs, setConcurrentJobs] = useState<BetaConcurrentJobs | "">("");
  const [channels, setChannels] = useState<BetaOrderChannel[]>([]);
  const [participation, setParticipation] = useState<BetaParticipation | "">("");
  // 동의는 기본값이 모두 체크 안 됨이다.
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [adConsent, setAdConsent] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState<Completed | null>(null);

  function toggleChannel(value: BetaOrderChannel) {
    setChannels((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: string[] = [];
    if (!isValidBetaEmail(email)) problems.push("이메일 주소를 확인해 주세요.");
    if (!workType) problems.push("하는 일을 골라 주세요.");
    if (!sellsPackages) problems.push("패키지 상품 판매 여부를 골라 주세요.");
    if (!concurrentJobs) problems.push("지금 동시에 진행 중인 외주 건수를 골라 주세요.");
    if (!participation) problems.push("참여 희망을 골라 주세요.");
    if (!privacyConsent) problems.push("[필수] 개인정보 수집·이용에 동의해야 신청할 수 있어요.");
    setErrors(problems);
    if (problems.length || !workType || !sellsPackages || !concurrentJobs || !participation) return;

    if (preview) {
      // 서버가 없는 미리보기: 저장·전송하지 않고 완료 화면만 보여 준다.
      const now = new Date();
      setCompleted({
        preview: true,
        adEvent: adConsent ? { at: now.toISOString(), dueAt: noticeDueAt(now).toISOString() } : null,
      });
      return;
    }

    const client = getSupabaseBrowserClient();
    if (!client) {
      setErrors(["신청 서버가 연결되지 않았어요. 잠시 뒤 다시 시도하거나 메일로 알려 주세요."]);
      return;
    }
    setPending(true);
    try {
      const receipt = await submitBetaApplication(client, {
        email,
        workType,
        sellsPackages: sellsPackages === "yes",
        concurrentJobs,
        orderChannels: channels,
        participation,
        privacyConsent,
        adConsent,
        copyVersion: BETA_APPLY_COPY_VERSION,
      });
      if (receipt.status === "rate_limited") {
        setErrors(["짧은 시간에 신청이 많이 들어왔어요. 잠시 뒤 다시 시도해 주세요."]);
        return;
      }
      setCompleted({ preview: false, adEvent: receipt.adEvent ? { at: receipt.adEvent.at, dueAt: receipt.adEvent.dueAt } : null });
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "신청을 저장하지 못했어요."]);
    } finally {
      setPending(false);
    }
  }

  const previewNote = preview
    ? <BetaPreviewNote>미리보기: 실제로 저장되지 않음. 이 화면은 서버에 연결되지 않아 신청 내용을 어디에도 보내거나 남기지 않아요.</BetaPreviewNote>
    : null;

  if (completed) {
    return (
      <BetaPublicShell preview={previewNote}>
        <div className="betaPublicIntro" role="status">
          <h1>신청을 받았어요</h1>
          <p>
            {completed.preview
              ? "미리보기라서 실제로 접수되지는 않았어요."
              : "결과는 신청하신 이메일로 알려 드려요. 신청 내용을 바꾸거나 지우려면 메일로 알려 주세요."}
          </p>
        </div>
        {completed.adEvent ? (
          <section className="betaNotice" aria-label="광고성 정보 수신 동의 처리 결과" data-testid="beta-ad-notice">
            <h2>광고성 정보 수신 동의 처리 결과</h2>
            <dl>
              <div><dt>전송자</dt><dd>{BETA_SENDER.name}</dd></div>
              <div><dt>의사표시</dt><dd>광고성 정보(이메일) 수신 동의</dd></div>
              <div><dt>일자</dt><dd>{koreanDate(completed.adEvent.at)}</dd></div>
              <div><dt>처리 결과</dt><dd>동의가 접수되었습니다. 주소 확인 뒤 유효합니다. 운영자가 보내는 메일의 확인 버튼을 누르시기 전까지는 광고성 메일을 보내지 않습니다.</dd></div>
            </dl>
            <p>
              같은 내용을 {koreanDate(completed.adEvent.dueAt)}까지 이메일로도 알려 드려요.
              언제든 메일의 수신거부 링크나 {BETA_SENDER.email} 회신으로 철회할 수 있어요.
            </p>
          </section>
        ) : (
          <p className="betaPublicMuted" data-testid="beta-ad-none">
            광고성 정보 수신 동의에는 체크하지 않으셨어요. 이번 신청으로 새로 동의한 내용은 없어요.
          </p>
        )}
      </BetaPublicShell>
    );
  }

  return (
    <BetaPublicShell preview={previewNote}>
      <div className="betaPublicIntro">
        <h1>일감체크 인터뷰·베타 신청</h1>
        <p>패키지 외주를 하는 1인 제작자를 찾고 있어요. 이름·전화번호·업체명은 받지 않아요.</p>
      </div>
      <form className="betaApplyForm" onSubmit={submit} noValidate>
        <label className="betaField">
          <span>이메일 <em>필수</em></span>
          <input type="email" name="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>

        <fieldset className="betaField">
          <legend>하는 일 <em>필수</em></legend>
          <div className="betaChoiceRow">
            {WORK_TYPE_OPTIONS.map((option) => (
              <label key={option.value} className="betaChoice">
                <input type="radio" name="workType" value={option.value} checked={workType === option.value} onChange={() => setWorkType(option.value)} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="betaField">
          <legend>패키지(정해진 가격·범위) 상품으로 판매하나요? <em>필수</em></legend>
          <div className="betaChoiceRow">
            <label className="betaChoice"><input type="radio" name="sellsPackages" value="yes" checked={sellsPackages === "yes"} onChange={() => setSellsPackages("yes")} /><span>예</span></label>
            <label className="betaChoice"><input type="radio" name="sellsPackages" value="no" checked={sellsPackages === "no"} onChange={() => setSellsPackages("no")} /><span>아니오</span></label>
          </div>
        </fieldset>

        <fieldset className="betaField">
          <legend>지금 동시에 진행 중인 외주 건수 <em>필수</em></legend>
          <div className="betaChoiceRow">
            {CONCURRENT_JOB_OPTIONS.map((option) => (
              <label key={option.value} className="betaChoice">
                <input type="radio" name="concurrentJobs" value={option.value} checked={concurrentJobs === option.value} onChange={() => setConcurrentJobs(option.value)} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="betaField">
          <legend>주문 받는 곳 <small>선택, 여러 개 고를 수 있어요</small></legend>
          <div className="betaChoiceRow">
            {ORDER_CHANNEL_OPTIONS.map((option) => (
              <label key={option.value} className="betaChoice">
                <input type="checkbox" name="orderChannels" value={option.value} checked={channels.includes(option.value)} onChange={() => toggleChannel(option.value)} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="betaField">
          <legend>참여 희망 <em>필수</em></legend>
          <div className="betaChoiceRow">
            {PARTICIPATION_OPTIONS.map((option) => (
              <label key={option.value} className="betaChoice">
                <input type="radio" name="participation" value={option.value} checked={participation === option.value} onChange={() => setParticipation(option.value)} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <section className="betaConsent" aria-labelledby="beta-privacy-title">
          <h2 id="beta-privacy-title">{PRIVACY_CONSENT_COPY.title}</h2>
          <dl>
            <div><dt>목적</dt><dd>{PRIVACY_CONSENT_COPY.purpose}</dd></div>
            <div><dt>필수 항목</dt><dd>{PRIVACY_CONSENT_COPY.requiredItems}</dd></div>
            <div><dt>선택 항목</dt><dd>{PRIVACY_CONSENT_COPY.optionalItems}</dd></div>
          </dl>
          <table className="betaRetentionTable">
            <caption>보유기간(사람마다 다릅니다)</caption>
            <thead><tr><th scope="col">대상</th><th scope="col">보유기간</th></tr></thead>
            <tbody>
              {PRIVACY_CONSENT_COPY.retention.map((row) => (
                <tr key={row.target}><td>{row.target}</td><td>{row.period}</td></tr>
              ))}
            </tbody>
          </table>
          <p>{PRIVACY_CONSENT_COPY.refusal}</p>
          <label className="betaConsentCheck">
            <input type="checkbox" name="privacyConsent" checked={privacyConsent} onChange={(event) => setPrivacyConsent(event.target.checked)} />
            <span>개인정보 수집·이용에 동의합니다(필수)</span>
          </label>
        </section>

        <section className="betaConsent" aria-labelledby="beta-ad-title">
          <h2 id="beta-ad-title">{AD_CONSENT_COPY.title}</h2>
          <p>{AD_CONSENT_COPY.content}</p>
          <dl>
            <div><dt>목적</dt><dd>{AD_CONSENT_COPY.purpose}</dd></div>
            <div><dt>항목</dt><dd>{AD_CONSENT_COPY.items}</dd></div>
            <div><dt>보유기간</dt><dd>{AD_CONSENT_COPY.retention}</dd></div>
          </dl>
          <p>{AD_CONSENT_COPY.noDisadvantage} {AD_CONSENT_COPY.withdraw}</p>
          <label className="betaConsentCheck">
            <input type="checkbox" name="adConsent" checked={adConsent} onChange={(event) => setAdConsent(event.target.checked)} />
            <span>광고성 정보(이메일) 수신에 동의합니다(선택)</span>
          </label>
        </section>

        {errors.length > 0 && (
          <div className="betaErrors" role="alert">
            <ul>{errors.map((message) => <li key={message}>{message}</li>)}</ul>
          </div>
        )}

        <button className="primaryButton betaSubmit" type="submit" disabled={pending}>
          {pending ? "보내는 중" : "신청하기"}
        </button>
        <p className="betaPublicMuted">문구 판본 {BETA_APPLY_COPY_VERSION}</p>
      </form>
    </BetaPublicShell>
  );
}
