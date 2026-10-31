"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BetaPreviewNote, isBetaPreviewMode } from "@/components/beta-public-shell";
import { Brand } from "@/components/brand";
import {
  CONCURRENT_JOB_OPTIONS,
  ORDER_CHANNEL_OPTIONS,
  PARTICIPATION_OPTIONS,
  WORK_TYPE_OPTIONS,
  optionLabel,
} from "@/lib/beta/apply-copy";
import {
  buildApplicationDrafts,
  buildDeletionDraft,
  buildNoticeDraft,
  findDraftProblems,
  type DraftApplication,
  type DraftOptions,
  type MailDraft,
} from "@/lib/beta/mail-drafts";
import { hostedBetaOpsBackend, previewBetaOpsBackend, type BetaOpsBackend } from "@/lib/beta/ops-backend";
import { AD_STATUS_LABELS, NOTICE_KIND_LABELS, koreanDate } from "@/lib/beta/rules";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { BetaNotOperatorError, type BetaOpsApplication, type BetaOpsNotice } from "@/lib/supabase/beta";

type Gate = "loading" | "login_required" | "not_operator" | "ready" | "error";

const OUTCOME_LABELS: Record<NonNullable<BetaOpsApplication["outcome"]>, string> = {
  not_matched: "기준 미충족",
  not_selected: "미선정",
  interview: "인터뷰 진행",
  beta: "베타 참가",
};

const SOURCE_LABELS: Record<BetaOpsNotice["source"], string> = {
  apply_form: "신청 화면",
  unsubscribe_link: "수신거부 링크",
  deletion_request: "삭제 요청",
};

function toDraftApplication(application: BetaOpsApplication): DraftApplication {
  return {
    id: application.id,
    email: application.email,
    participation: application.participation,
    eligible: application.eligible,
    adChecked: application.adChecked,
    createdAt: application.createdAt,
    emailConfirmedAt: application.emailConfirmedAt,
    confirmExpiresAt: application.confirmExpiresAt,
    outcome: application.outcome,
    confirmToken: application.confirmToken,
    unsubscribeToken: application.unsubscribeToken,
  };
}

function outcomeChoices(application: BetaOpsApplication): Array<NonNullable<BetaOpsApplication["outcome"]>> {
  if (!application.eligible) return ["not_matched"];
  if (application.participation === "interview") return ["interview", "not_selected"];
  if (application.participation === "beta") return ["beta", "not_selected"];
  return ["interview", "beta", "not_selected"];
}

async function copyText(text: string): Promise<boolean> {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function DraftCard({ draft, recordEmail }: { draft: MailDraft; recordEmail: string }) {
  const problems = findDraftProblems(draft, recordEmail);
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(kind: "제목" | "본문", text: string) {
    setCopied(await copyText(text) ? `${kind}을 복사했어요.` : "복사하지 못했어요. 아래 글을 직접 선택해 주세요.");
  }
  return (
    <div className="betaDraft" data-testid="beta-draft" data-purpose={draft.purpose} data-ready={problems.length === 0}>
      <div className="betaDraftHead">
        <strong>{draft.label}</strong>
        <span>받는 사람 {draft.to} · 보내는 사람 {draft.from}</span>
      </div>
      {problems.length > 0 && (
        <p className="betaDraftProblems" role="alert">보내기 전에 고칠 것: {problems.join(", ")}</p>
      )}
      <p className="betaDraftSubject">제목: {draft.subject}</p>
      <pre className="betaDraftBody">{draft.body}</pre>
      <div className="betaActions">
        <button className="compactButton" type="button" disabled={problems.length > 0} onClick={() => copy("제목", draft.subject)}>제목 복사</button>
        <button className="compactButton" type="button" disabled={problems.length > 0} onClick={() => copy("본문", draft.body)}>본문 복사</button>
        {copied && <span role="status">{copied}</span>}
      </div>
    </div>
  );
}

function ConfirmButton({ label, confirmLabel, onConfirm, disabled }: { label: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return <button className="compactButton" type="button" disabled={disabled} onClick={() => setArmed(true)}>{label}</button>;
  }
  return (
    <span className="betaConfirmPair">
      <button className="dangerButton" type="button" onClick={() => { setArmed(false); onConfirm(); }}>{confirmLabel}</button>
      <button className="compactButton" type="button" onClick={() => setArmed(false)}>취소</button>
    </span>
  );
}

function MilestoneControls({ application, onRecord }: {
  application: BetaOpsApplication;
  onRecord: (kind: "result_sent" | "interview_done" | "beta_ended", outcome: BetaOpsApplication["outcome"]) => void;
}) {
  const choices = outcomeChoices(application);
  const [outcome, setOutcome] = useState(choices[0]);
  if (!application.resultSentAt) {
    return (
      <div className="betaActions">
        <label className="betaInlineSelect">
          <span>결과</span>
          <select value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}>
            {choices.map((choice) => <option key={choice} value={choice}>{OUTCOME_LABELS[choice]}</option>)}
          </select>
        </label>
        <ConfirmButton label="결과 안내 보냄 표시" confirmLabel="보낸 것 맞아요" onConfirm={() => onRecord("result_sent", outcome)} />
      </div>
    );
  }
  return (
    <div className="betaActions">
      {application.outcome === "interview" && !application.interviewDoneAt && (
        <ConfirmButton label="인터뷰 끝남 표시" confirmLabel="끝난 것 맞아요" onConfirm={() => onRecord("interview_done", null)} />
      )}
      {application.outcome === "beta" && !application.betaEndedAt && (
        <ConfirmButton label="베타 끝남 표시" confirmLabel="끝난 것 맞아요" onConfirm={() => onRecord("beta_ended", null)} />
      )}
    </div>
  );
}

type DeletionResult = { email: string; drafts: MailDraft[]; withdrawEventId: string | null };

/** /ops/applications 운영자 화면(로그인 + beta_operator_accounts에 등록된 계정만). 메일은 보내지 않고 초안만 만든다. */
export function BetaOpsApplications() {
  const preview = useMemo(() => isBetaPreviewMode(), []);
  const [backend, setBackend] = useState<BetaOpsBackend | null>(null);
  const [gate, setGate] = useState<Gate>("loading");
  const [applications, setApplications] = useState<BetaOpsApplication[]>([]);
  const [notices, setNotices] = useState<BetaOpsNotice[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [interviewScheduleUrl, setInterviewScheduleUrl] = useState("");
  const [betaAccessUrl, setBetaAccessUrl] = useState("");
  const [deletion, setDeletion] = useState<DeletionResult | null>(null);
  // 기한 판정 기준 시각. 렌더 중에 시계를 읽지 않도록 목록을 불러올 때 함께 정한다.
  const [loadedAt, setLoadedAt] = useState(0);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const refresh = useCallback(async (target: BetaOpsBackend) => {
    try {
      const [nextApplications, nextNotices] = await Promise.all([target.listApplications(), target.listNotices()]);
      setApplications(nextApplications);
      setNotices(nextNotices);
      setLoadedAt(Date.now());
      setGate("ready");
      return nextApplications;
    } catch (error) {
      setGate(error instanceof BetaNotOperatorError ? "not_operator" : "error");
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (preview) {
        const target = previewBetaOpsBackend();
        if (cancelled) return;
        setBackend(target);
        await refresh(target);
        return;
      }
      const client = getSupabaseBrowserClient();
      if (!client) { if (!cancelled) setGate("error"); return; }
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      if (!data.session) { setGate("login_required"); return; }
      const target = hostedBetaOpsBackend(client);
      setBackend(target);
      await refresh(target);
    }
    void start();
    return () => { cancelled = true; };
  }, [preview, refresh]);

  const now = loadedAt;
  const draftOptions: DraftOptions = { origin, interviewScheduleUrl, betaAccessUrl, now: new Date(now) };
  const byId = new Map(applications.map((application) => [application.id, application]));
  const expired = applications.filter((application) => application.purgeAfter && new Date(application.purgeAfter).getTime() <= now);
  const adTargets = [...new Set(applications.filter((application) => application.adTarget).map((application) => application.email))];
  const openNotices = notices.filter((notice) => !notice.noticeEmailedAt);

  async function run(action: () => Promise<unknown>, done: string) {
    if (!backend) return;
    try {
      await action();
      setMessage(done);
    } catch (error) {
      setMessage(error instanceof BetaNotOperatorError ? error.message : "처리하지 못했어요. 새로고침 뒤 다시 시도해 주세요.");
    }
    await refresh(backend);
  }

  async function copyAdTargets() {
    if (!backend) return;
    // 복사 직전에 다시 불러와 방금 수신거부한 사람을 다시 뺀다.
    const latest = await refresh(backend);
    if (!latest) return;
    const emails = [...new Set(latest.filter((application) => application.adTarget).map((application) => application.email))];
    setMessage(emails.length === 0
      ? "광고 발송 대상이 없어요."
      : await copyText(emails.join(", ")) ? `최신 목록으로 ${emails.length}명을 복사했어요.` : "복사하지 못했어요.");
  }

  async function deleteApplication(application: BetaOpsApplication) {
    if (!backend) return;
    try {
      const result = await backend.deleteApplication(application.id);
      const drafts = [buildDeletionDraft(application.email, new Date().toISOString())];
      if (result.withdrawEventId && result.withdrawAt) {
        drafts.push(buildNoticeDraft(
          { eventId: result.withdrawEventId, kind: "withdraw", occurredAt: result.withdrawAt, confirmedAt: null },
          { email: application.email, unsubscribeToken: null },
          draftOptions,
        ));
      }
      setDeletion({ email: application.email, drafts, withdrawEventId: result.withdrawEventId });
      setMessage(`신청 ${result.deletedCount}건을 지웠어요. 아래 결과 안내를 보내 주세요.`);
    } catch (error) {
      setMessage(error instanceof BetaNotOperatorError ? error.message : "삭제하지 못했어요.");
    }
    await refresh(backend);
  }

  const header = (
    <header className="betaOpsHeader">
      <Brand />
      <h1>베타 신청 운영</h1>
    </header>
  );

  if (gate !== "ready") {
    const text = gate === "loading" ? "불러오는 중이에요."
      : gate === "login_required" ? "로그인이 필요해요."
        : gate === "not_operator" ? "운영자 계정이 아닙니다."
          : "운영 기록을 불러오지 못했어요.";
    return (
      <main className="betaOpsPage">
        {header}
        <p role="status" data-testid="beta-ops-gate">{text}</p>
        {gate === "login_required" && <p><Link href="/today">로그인하러 가기</Link></p>}
      </main>
    );
  }

  return (
    <main className="betaOpsPage">
      {header}
      {preview && (
        <BetaPreviewNote>미리보기: 가상 신청 예시(example.invalid)예요. 서버에 연결되지 않아 실제 신청은 보이지 않고, 누른 결과도 저장되지 않아요.</BetaPreviewNote>
      )}
      <p className="betaPublicMuted">이 화면은 메일을 보내지 않아요. 초안을 복사해 Gmail로 직접 보내고, 보낸 뒤 표시를 남겨 주세요.</p>
      {message && <p className="betaOpsMessage" role="status">{message}</p>}

      <section className="betaOpsSection" aria-labelledby="beta-ops-inputs">
        <h2 id="beta-ops-inputs">초안에 넣을 링크</h2>
        <div className="betaOpsInputs">
          <label className="betaField">
            <span>인터뷰 일정 링크(구글 폼)</span>
            <input type="url" inputMode="url" placeholder="https://" value={interviewScheduleUrl} onChange={(event) => setInterviewScheduleUrl(event.target.value)} />
          </label>
          <label className="betaField">
            <span>베타 접속(초대) 링크</span>
            <input type="url" inputMode="url" placeholder="https://" value={betaAccessUrl} onChange={(event) => setBetaAccessUrl(event.target.value)} />
          </label>
        </div>
      </section>

      <section className="betaOpsSection" aria-labelledby="beta-ops-ad">
        <h2 id="beta-ops-ad">광고 발송 대상 {adTargets.length}명</h2>
        <p className="betaPublicMuted">주소 확인까지 끝난 동의자 중 적격이고 발송금지가 아닌 사람만이에요. 미충족·미선정자는 넣지 않아요(결정 전 기본 동작).</p>
        <div className="betaActions">
          <button className="compactButton" type="button" onClick={copyAdTargets}>최신 목록으로 다시 불러와 복사</button>
        </div>
      </section>

      <section className="betaOpsSection" aria-labelledby="beta-ops-notices">
        <h2 id="beta-ops-notices">처리결과 통지 {openNotices.length}건 남음</h2>
        {notices.length === 0 && <p className="betaPublicMuted">아직 기록이 없어요.</p>}
        <ul className="betaOpsList">
          {notices.map((notice) => {
            const application = notice.applicationId ? byId.get(notice.applicationId) : undefined;
            const overdue = !notice.noticeEmailedAt && new Date(notice.noticeDueAt).getTime() < now;
            return (
              <li key={notice.eventId} className="betaOpsItem" data-testid="beta-notice" data-overdue={overdue}>
                <div className="betaOpsFacts">
                  <strong>{NOTICE_KIND_LABELS[notice.kind]}</strong>
                  <span>{SOURCE_LABELS[notice.source]}</span>
                  <span>의사표시 {koreanDate(notice.occurredAt)}</span>
                  <span>화면 표시 {notice.noticeShownAt ? koreanDate(notice.noticeShownAt) : "없음"}</span>
                  <span className={overdue ? "betaOverdue" : undefined}>마감 {koreanDate(notice.noticeDueAt)}</span>
                  <span>{notice.noticeEmailedAt ? `통지 보냄 ${koreanDate(notice.noticeEmailedAt)}` : "통지 안 보냄"}</span>
                </div>
                {application ? (
                  <details>
                    <summary>통지 초안 보기</summary>
                    <DraftCard
                      draft={buildNoticeDraft(notice, { email: application.email, unsubscribeToken: application.unsubscribeToken }, draftOptions)}
                      recordEmail={application.email}
                    />
                  </details>
                ) : (
                  <p className="betaPublicMuted">신청 정보가 지워져 주소가 없어요. 삭제 처리 때 만든 초안으로 보내 주세요.</p>
                )}
                {!notice.noticeEmailedAt && (
                  <ConfirmButton label="통지 보냄 표시" confirmLabel="보낸 것 맞아요" onConfirm={() => run(() => backend!.markNoticeEmailed(notice.eventId), "통지 보낸 시각을 남겼어요.")} />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {deletion && (
        <section className="betaOpsSection" aria-labelledby="beta-ops-deletion" data-testid="beta-deletion-result">
          <h2 id="beta-ops-deletion">삭제 처리 결과 안내</h2>
          <p className="betaPublicMuted">인터뷰 메모가 따로 있으면 그것도 지운 뒤 보내 주세요. 이 화면을 벗어나면 주소가 남지 않아요.</p>
          {deletion.drafts.map((draft) => <DraftCard key={draft.id} draft={draft} recordEmail={deletion.email} />)}
          <button className="compactButton" type="button" onClick={() => setDeletion(null)}>닫기</button>
        </section>
      )}

      <section className="betaOpsSection" aria-labelledby="beta-ops-applications">
        <h2 id="beta-ops-applications">신청 {applications.length}건</h2>
        <div className="betaActions">
          <ConfirmButton
            label={`보유기간 지난 신청 정리 (${expired.length}건)`}
            confirmLabel={`${expired.length}건 지우기`}
            disabled={expired.length === 0}
            onConfirm={() => run(() => backend!.purgeExpired(), "보유기간이 지난 신청을 정리했어요.")}
          />
        </div>
        <ul className="betaOpsList">
          {applications.map((application) => (
            <li key={application.id} className="betaOpsItem" data-testid="beta-application">
              <div className="betaOpsFacts">
                <strong>{application.email}</strong>
                <span className={application.eligible ? "betaBadge" : "betaBadge betaBadgeMuted"}>{application.eligible ? "적격" : "기준 미충족"}</span>
                <span>참여 희망 {optionLabel(PARTICIPATION_OPTIONS, application.participation)}</span>
                <span data-testid="beta-ad-status">광고 {AD_STATUS_LABELS[application.adStatus]}{application.suppressed ? " · 발송금지" : ""}</span>
                <span>신청 {koreanDate(application.createdAt)}</span>
              </div>
              <div className="betaOpsFacts betaPublicMuted">
                <span>하는 일 {optionLabel(WORK_TYPE_OPTIONS, application.workType)}</span>
                <span>패키지 {application.sellsPackages ? "예" : "아니오"}</span>
                <span>동시 {optionLabel(CONCURRENT_JOB_OPTIONS, application.concurrentJobs)}</span>
                <span>주문 {application.orderChannels.length ? application.orderChannels.map((channel) => optionLabel(ORDER_CHANNEL_OPTIONS, channel)).join("·") : "적지 않음"}</span>
                <span>결과 {application.outcome ? `${OUTCOME_LABELS[application.outcome]} (안내 ${koreanDate(application.resultSentAt!)})` : "안내 전"}</span>
                <span>정리 예정 {application.purgeAfter ? koreanDate(application.purgeAfter) : "미정"}</span>
              </div>
              <details>
                <summary>운영 연락 초안 보기</summary>
                {buildApplicationDrafts(toDraftApplication(application), draftOptions).map((draft) => (
                  <DraftCard key={draft.id} draft={draft} recordEmail={application.email} />
                ))}
              </details>
              <MilestoneControls
                key={`${application.id}:${application.resultSentAt ?? ""}`}
                application={application}
                onRecord={(kind, outcome) => run(() => backend!.recordMilestone(application.id, kind, outcome), "기록했어요.")}
              />
              <div className="betaActions">
                <ConfirmButton label="삭제 요청 처리" confirmLabel="같은 주소의 신청을 모두 지우기" onConfirm={() => deleteApplication(application)} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
