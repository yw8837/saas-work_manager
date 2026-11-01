"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import {
  BetaNoticesPendingError,
  BetaNotOperatorError,
  type BetaOpsApplication,
  type BetaOpsDeletion,
  type BetaOpsNotice,
  type BetaPurgeResult,
} from "@/lib/supabase/beta";

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

/** 결과를 아직 기록하지 않았으면 운영자가 고른(보낼 예정인) 결과로 초안을 만든다. */
function toDraftApplication(application: BetaOpsApplication, plannedOutcome: BetaOpsApplication["outcome"]): DraftApplication {
  return {
    id: application.id,
    email: application.email,
    participation: application.participation,
    eligible: application.eligible,
    adChecked: application.adChecked,
    createdAt: application.createdAt,
    emailConfirmedAt: application.emailConfirmedAt,
    confirmExpiresAt: application.confirmExpiresAt,
    outcome: application.outcome ?? plannedOutcome,
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

type PlannedOutcome = NonNullable<BetaOpsApplication["outcome"]> | "";

function MilestoneControls({ application, planned, onPlan, onRecord }: {
  application: BetaOpsApplication;
  planned: PlannedOutcome;
  onPlan: (outcome: PlannedOutcome) => void;
  onRecord: (kind: "result_sent" | "interview_done" | "beta_ended", outcome: BetaOpsApplication["outcome"]) => void;
}) {
  const choices = outcomeChoices(application);
  if (!application.resultSentAt) {
    // 결과는 먼저 골라 초안을 확인하고, Gmail로 실제로 보낸 뒤에만 "보냄"을 기록한다.
    const selected = planned || (choices.length === 1 ? choices[0] : "");
    return (
      <div className="betaActions">
        <label className="betaInlineSelect">
          <span>결과</span>
          <select value={selected} onChange={(event) => onPlan(event.target.value as PlannedOutcome)}>
            {choices.length > 1 && <option value="">고르기 전(참여 가능 초안)</option>}
            {choices.map((choice) => <option key={choice} value={choice}>{OUTCOME_LABELS[choice]}</option>)}
          </select>
        </label>
        <ConfirmButton
          label="결과 안내 보냄 표시"
          confirmLabel="이 결과로 보낸 것 맞아요"
          disabled={!selected}
          onConfirm={() => onRecord("result_sent", selected || null)}
        />
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

/** /ops/applications 운영자 화면(로그인 + beta_operator_accounts에 등록된 계정만). 메일은 보내지 않고 초안만 만든다. */
export function BetaOpsApplications() {
  const preview = useMemo(() => isBetaPreviewMode(), []);
  const [backend, setBackend] = useState<BetaOpsBackend | null>(null);
  const [gate, setGate] = useState<Gate>("loading");
  const [applications, setApplications] = useState<BetaOpsApplication[]>([]);
  const [notices, setNotices] = useState<BetaOpsNotice[]>([]);
  const [deletions, setDeletions] = useState<BetaOpsDeletion[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [interviewScheduleUrl, setInterviewScheduleUrl] = useState("");
  const [betaAccessUrl, setBetaAccessUrl] = useState("");
  const [planned, setPlanned] = useState<Record<string, PlannedOutcome>>({});
  // 기한 판정 기준 시각. 렌더 중에 시계를 읽지 않도록 목록을 불러올 때 함께 정한다.
  const [loadedAt, setLoadedAt] = useState(0);
  // 로그인 계정이 바뀔 때마다 1씩 올린다. 그 전에 보낸 조회의 늦은 응답은 버린다.
  const generationRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const clearAll = useCallback(() => {
    setBackend(null);
    setApplications([]);
    setNotices([]);
    setDeletions([]);
    setPlanned({});
    setMessage(null);
  }, []);

  // startedGeneration: 작업 뒤 이어서 부르는 조회는 그 작업을 시작한 세대를 넘긴다.
  // 그 사이 로그아웃·계정 전환이 있었으면 조회하지 않아서, 이전 계정의 작업이 새 화면을 바꾸지 못한다.
  const refresh = useCallback(async (target: BetaOpsBackend, startedGeneration?: number) => {
    const generation = startedGeneration ?? generationRef.current;
    if (generation !== generationRef.current) return null;
    try {
      const [nextApplications, nextNotices, nextDeletions] = await Promise.all([
        target.listApplications(), target.listNotices(), target.listDeletions(),
      ]);
      if (generation !== generationRef.current) return null;
      setApplications(nextApplications);
      setNotices(nextNotices);
      setDeletions(nextDeletions);
      setLoadedAt(Date.now());
      setGate("ready");
      return nextApplications;
    } catch (error) {
      if (generation !== generationRef.current) return null;
      setGate(error instanceof BetaNotOperatorError ? "not_operator" : "error");
      return null;
    }
  }, []);

  useEffect(() => {
    if (preview) {
      const target = previewBetaOpsBackend();
      const timer = window.setTimeout(() => {
        setBackend(target);
        void refresh(target);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const client = getSupabaseBrowserClient();
    if (!client) {
      const timer = window.setTimeout(() => setGate("error"), 0);
      return () => window.clearTimeout(timer);
    }
    let disposed = false;
    // 로그인 계정이 정해질 때마다(처음, 로그아웃, 계정 전환) 화면을 먼저 비우고 권한을 다시 확인한다.
    const adopt = (userId: string | null) => {
      if (disposed) return;
      generationRef.current += 1;
      userIdRef.current = userId;
      clearAll();
      if (!userId) {
        setGate("login_required");
        return;
      }
      setGate("loading");
      const target = hostedBetaOpsBackend(client);
      setBackend(target);
      void refresh(target);
    };
    const startedAt = generationRef.current;
    void client.auth.getSession().then(({ data }) => {
      // 그 사이 인증 변경 알림이 먼저 왔으면 그 결과가 최신이다.
      if (generationRef.current === startedAt) adopt(data.session?.user?.id ?? null);
    });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user?.id ?? null;
      if (event !== "SIGNED_OUT" && nextUserId !== null && nextUserId === userIdRef.current) return;
      adopt(nextUserId);
    });
    return () => {
      disposed = true;
      generationRef.current += 1;
      data.subscription.unsubscribe();
    };
  }, [preview, refresh, clearAll]);

  const now = loadedAt;
  const draftOptions: DraftOptions = { origin, interviewScheduleUrl, betaAccessUrl, now: new Date(now) };
  const byId = new Map(applications.map((application) => [application.id, application]));
  const expired = applications.filter((application) => application.purgeAfter && new Date(application.purgeAfter).getTime() <= now);
  const adTargets = [...new Set(applications.filter((application) => application.adTarget).map((application) => application.email))];
  // 화면 통지만 가능한 건(주소가 이미 정리됨)은 메일로 보낼 수 없으니 '남은 통지'로 세지 않는다.
  const openNotices = notices.filter((notice) => !notice.noticeEmailedAt && !notice.emailUnavailable);
  const openDeletions = deletions.filter((deletion) => deletion.email && !deletion.resultEmailedAt);

  // 작업 응답을 기다리는 사이 로그아웃·계정 전환이 있었는지. 있었으면 늦게 온 응답으로 화면을 바꾸지 않는다.
  const isStale = (generation: number) => generation !== generationRef.current;

  async function run<T>(action: () => Promise<T>, done: string | ((result: T) => string)) {
    if (!backend) return;
    const generation = generationRef.current;
    try {
      const result = await action();
      if (isStale(generation)) return;
      setMessage(typeof done === "function" ? done(result) : done);
    } catch (error) {
      if (isStale(generation)) return;
      setMessage(error instanceof BetaNotOperatorError || error instanceof BetaNoticesPendingError
        ? error.message
        : "처리하지 못했어요. 새로고침 뒤 다시 시도해 주세요.");
    }
    await refresh(backend, generation);
  }

  // 정리 실행: 신청 정리와 호출 기록 정리는 서로 다른 RPC(트랜잭션)다. 결과·오류를 각각 처리해서,
  // 신청 정리가 끝난 뒤 호출 기록 정리만 실패해도 이미 끝난 신청 정리 결과를 그대로 알린다.
  async function runCleanup() {
    if (!backend) return;
    const generation = generationRef.current;
    let purge: BetaPurgeResult;
    try {
      purge = await backend.purgeExpired();
    } catch (error) {
      if (isStale(generation)) return;
      setMessage(error instanceof BetaNotOperatorError
        ? error.message
        : "신청 정리를 하지 못했어요. 호출 기록 정리도 하지 않았어요. 새로고침 뒤 다시 시도해 주세요.");
      await refresh(backend, generation);
      return;
    }
    // 그 사이 계정이 바뀌었으면 다음 RPC(호출 기록 정리)도 부르지 않는다.
    if (isStale(generation)) return;
    const parts = [
      `신청 ${purge.deletedCount}건을 정리했어요.`,
      purge.remainingCount > 0
        ? `정리 가능한 남은 대상 ${purge.remainingCount}명이 있어요(한 번에 주소 100개까지라 다시 눌러 주세요).`
        : "",
      purge.heldCount > 0
        ? `보내지 않은 통지 때문에 보류된 주소 ${purge.heldCount}명이 있어요(통지를 보낸 뒤 정리돼요).`
        : "",
    ];
    try {
      const prune = await backend.pruneCallCounters();
      parts.push(`오래된 호출 기록 ${prune.deletedRows}행을 지웠어요.`);
      if (prune.remainingRows > 5000) parts.push("남은 기록이 5,000행 넘게 있어요. 다시 눌러 지워 주세요.");
      else if (prune.remainingRows > 0) parts.push(`남은 ${prune.remainingRows}행은 다시 눌러 지워 주세요.`);
    } catch (error) {
      if (isStale(generation)) return;
      parts.push(error instanceof BetaNotOperatorError
        ? error.message
        : "호출 기록 정리는 완료하지 못했어요. 다시 시도해 주세요.");
    }
    if (isStale(generation)) return;
    setMessage(parts.filter(Boolean).join(" "));
    await refresh(backend, generation);
  }

  async function copyAdTargets() {
    if (!backend) return;
    const generation = generationRef.current;
    // 복사 직전에 다시 불러와 방금 수신거부한 사람을 다시 뺀다.
    const latest = await refresh(backend, generation);
    if (!latest || isStale(generation)) return;
    const emails = [...new Set(latest.filter((application) => application.adTarget).map((application) => application.email))];
    if (emails.length === 0) {
      setMessage("광고 발송 대상이 없어요.");
      return;
    }
    const copied = await copyText(emails.join(", "));
    if (isStale(generation)) return;
    setMessage(copied ? `최신 목록으로 ${emails.length}명을 복사했어요.` : "복사하지 못했어요.");
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
    // 같은 로그인 세션에서 방금 끝낸 작업의 결과는, 뒤이은 목록 갱신이 실패해도 지우지 않고 먼저 보여 준다.
    // (계정이 바뀌거나 로그아웃하면 clearAll()이 결과도 지운다. 로그인 필요·운영자 아님 화면에서는 보여 주지 않는다.)
    const keepResult = gate === "error" && message;
    return (
      <main className="betaOpsPage">
        {header}
        {keepResult && (
          <p className="betaOpsMessage" role="status" data-testid="beta-ops-last-result">{message}</p>
        )}
        <p role={keepResult ? "alert" : "status"} data-testid="beta-ops-gate">
          {text}
          {keepResult && " 목록 갱신에도 실패했어요. 위 작업 결과를 확인한 뒤 목록을 다시 불러와 주세요."}
        </p>
        {gate === "error" && backend && (
          <p>
            <button className="compactButton" type="button" onClick={() => void refresh(backend)}>목록 다시 불러오기</button>
          </p>
        )}
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
      {message && <p className="betaOpsMessage" role="status" data-testid="beta-ops-last-result">{message}</p>}

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
        <p className="betaPublicMuted">주소 확인까지 끝난 동의자 중 가장 최근 신청이 적격이고, 같은 주소의 어느 신청도 미충족·미선정으로 안내되지 않았고, 발송금지가 아닌 사람만이에요(결정 전 기본 동작).</p>
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
            const overdue = !notice.noticeEmailedAt && !notice.emailUnavailable && new Date(notice.noticeDueAt).getTime() < now;
            return (
              <li
                key={notice.eventId}
                className="betaOpsItem"
                data-testid="beta-notice"
                data-overdue={overdue}
                data-kind={notice.kind}
                data-recipient={notice.recipientEmail ?? ""}
              >
                <div className="betaOpsFacts">
                  <strong>{NOTICE_KIND_LABELS[notice.kind]}</strong>
                  <span>{SOURCE_LABELS[notice.source]}</span>
                  <span>의사표시 {koreanDate(notice.occurredAt)}</span>
                  <span>화면 표시 {notice.noticeShownAt ? koreanDate(notice.noticeShownAt) : "없음"}</span>
                  <span className={overdue ? "betaOverdue" : undefined}>마감 {koreanDate(notice.noticeDueAt)}</span>
                  <span>
                    {notice.noticeEmailedAt
                      ? `통지 보냄 ${koreanDate(notice.noticeEmailedAt)}`
                      : notice.emailUnavailable ? "화면 통지만 함" : "통지 안 보냄"}
                  </span>
                </div>
                {notice.recipientEmail ? (
                  <details>
                    <summary>통지 초안 보기</summary>
                    <DraftCard
                      draft={buildNoticeDraft(notice, { email: notice.recipientEmail, unsubscribeToken: application?.unsubscribeToken ?? null }, draftOptions)}
                      recordEmail={notice.recipientEmail}
                    />
                  </details>
                ) : notice.emailUnavailable ? (
                  <p className="betaPublicMuted">주소가 정리되어 이메일 통지 불가 — 화면 통지만 함 (의사표시 때 처리 결과를 화면으로 보여 줬어요)</p>
                ) : notice.noticeEmailedAt ? (
                  <p className="betaPublicMuted">통지를 마치고 삭제 결과 안내까지 끝나 주소를 지웠어요.</p>
                ) : (
                  <p className="betaDraftProblems">받는 주소를 찾지 못했어요. 운영 확인이 필요해요.</p>
                )}
                {!notice.noticeEmailedAt && !notice.emailUnavailable && (
                  <ConfirmButton label="통지 보냄 표시" confirmLabel="보낸 것 맞아요" onConfirm={() => run(() => backend!.markNoticeEmailed(notice.eventId), "통지 보낸 시각을 남겼어요.")} />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {openDeletions.length > 0 && (
        <section className="betaOpsSection" aria-labelledby="beta-ops-deletion">
          <h2 id="beta-ops-deletion">삭제 처리 안내 {openDeletions.length}건 남음</h2>
          <p className="betaPublicMuted">
            신청 정보는 이미 지웠어요. 같은 주소의 처리결과 통지를 먼저 보내고, 마지막으로 삭제 결과 안내를 보낸 뒤 표시하면 남겨 둔 주소도 지워요.
            인터뷰 메모가 따로 있으면 그것도 지운 뒤 보내 주세요.
          </p>
          <ul className="betaOpsList">
            {openDeletions.map((deletion) => (
              <li key={deletion.id} className="betaOpsItem" data-testid="beta-deletion">
                <div className="betaOpsFacts">
                  <strong>{deletion.email}</strong>
                  <span>요청 처리 {koreanDate(deletion.requestedAt)}</span>
                  <span>지운 신청 {deletion.deletedCount}건</span>
                  <span className={deletion.pendingNotices > 0 ? "betaOverdue" : undefined}>보내지 않은 통지 {deletion.pendingNotices}건</span>
                </div>
                <DraftCard draft={buildDeletionDraft(deletion.email!, deletion.requestedAt)} recordEmail={deletion.email!} />
                <ConfirmButton
                  label="삭제 결과 안내 보냄 표시"
                  confirmLabel="보낸 것 맞아요"
                  onConfirm={() => run(() => backend!.markDeletionEmailed(deletion.id), "삭제 결과 안내를 기록하고 남겨 둔 주소를 지웠어요.")}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="betaOpsSection" aria-labelledby="beta-ops-applications">
        <h2 id="beta-ops-applications">신청 {applications.length}건</h2>
        <div className="betaActions">
          {/* 만료 신청이 없어도 누를 수 있다: 2일 지난 호출 제한 기록 정리도 이 버튼으로만 실행된다. */}
          <ConfirmButton
            label={`정리 실행 (만료 신청 ${expired.length}건 · 2일 지난 호출 기록)`}
            confirmLabel="신청과 오래된 호출 기록 정리하기"
            onConfirm={() => void runCleanup()}
          />
        </div>
        <ul className="betaOpsList">
          {applications.map((application) => {
            const plannedOutcome = planned[application.id] ?? "";
            const draftSource = toDraftApplication(application, plannedOutcome || null);
            return (
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
                  {buildApplicationDrafts(draftSource, draftOptions).map((draft) => (
                    <DraftCard key={draft.id} draft={draft} recordEmail={application.email} />
                  ))}
                </details>
                <MilestoneControls
                  application={application}
                  planned={plannedOutcome}
                  onPlan={(outcome) => setPlanned((current) => ({ ...current, [application.id]: outcome }))}
                  onRecord={(kind, outcome) => run(() => backend!.recordMilestone(application.id, kind, outcome), "기록했어요.")}
                />
                <div className="betaActions">
                  <ConfirmButton
                    label="삭제 요청 처리"
                    confirmLabel="같은 주소의 신청을 모두 지우기"
                    onConfirm={() => run(() => backend!.deleteApplication(application.id), "신청 정보를 지웠어요. 아래 '삭제 처리 안내'에서 통지와 결과 안내를 보내 주세요.")}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
