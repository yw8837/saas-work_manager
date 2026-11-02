"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { Check, CheckCircle2, LockKeyhole, Send, ShieldCheck } from "lucide-react";

import { Brand } from "@/components/brand";
import { CUSTOMER_STAGE_LABELS, type CustomerStage } from "@/lib/domain/customer-stage";
import type { RevisionUsage } from "@/lib/domain/types";
import { getPublicServiceConfig } from "@/lib/policies";

/**
 * 고객 수정요청 화면의 겉모습만 담는다.
 * 실제 링크(/r/[token])와 체험 링크(/demo/r)가 같은 화면을 쓰도록 저장·네트워크는 부르지 않고,
 * 요청을 어디에 남길지는 onSubmit을 넘기는 쪽이 정한다.
 */
export function PublicRevisionPrivacyNotice() {
  const service = getPublicServiceConfig();

  return (
    <aside className="publicRevisionPrivacyNotice" aria-label="개인정보 처리 안내">
      {/* 문구는 그대로 두고 접기만 한다. 펼치면 전체 내용을 읽을 수 있고, 방침 링크는 늘 보인다. */}
      <details>
        <summary><strong>개인정보 처리 안내</strong><span>무엇을 저장하는지 보기</span></summary>
        <p>
          이름·담당자명(선택), 수정 요청 원문과 접수 시각을 요청 전달·처리 기록 목적으로 저장하며,
          연결된 일감 또는 계정이 삭제될 때 함께 삭제합니다. 주민번호·건강정보·계좌 비밀번호 같은 민감한 내용은 적지 마세요.
        </p>
      </details>
      <div>
        <Link href="/privacy">개인정보처리방침</Link>
        <span aria-hidden="true"> · </span>
        <span>운영자 {service.operatorName ?? "정보 연결 전"}</span>
        {service.supportEmail && (
          <>
            <span aria-hidden="true"> · </span>
            <a href={`mailto:${service.supportEmail}`}>문의</a>
          </>
        )}
      </div>
    </aside>
  );
}

export function PublicRevisionLoading() {
  return <main className="publicRevisionPage"><p>수정요청 화면을 준비하고 있어요.</p></main>;
}

export function PublicRevisionUnavailable({ message }: { message: string }) {
  return (
    <main className="publicRevisionPage">
      <section className="publicRevisionCard publicRevisionEmpty">
        <header className="publicRevisionHeader"><Brand /></header>
        <span className="publicRevisionEmptyIcon" aria-hidden="true"><LockKeyhole size={28} /></span>
        <h1>사용할 수 없는 링크예요</h1>
        <p>{message}</p>
        <div className="publicRevisionNextStep" data-testid="unavailable-next-step">
          <strong>이렇게 해 보세요</strong>
          <p>이 링크를 보낸 작업자에게 새 수정 요청 링크를 보내 달라고 말해 주세요. 작업자가 링크를 다시 만들면 예전 주소는 열리지 않아요.</p>
        </div>
        <p className="publicRevisionAbout"><Link href="/">일감체크가 무엇인지 보기</Link></p>
        <PublicRevisionPrivacyNotice />
      </section>
    </main>
  );
}

/** pending: 확인 대기(지금 규칙). used/extra_scope는 migration 전 서버가 돌려주는 옛 영수증이다. */
export type PublicRevisionUsage = RevisionUsage;

export type PublicRevisionViewProps = {
  title: string;
  packageName: string;
  /** pending은 접수됐지만 작업자가 아직 처리하지 않은 요청 수. 모르면 비워 둔다. */
  revision: { included: number; used: number; remaining: number; pending?: number };
  /** 작업자가 정한 '시작 전 받을 자료' 중 아직 받지 못한 것의 이름. 없으면 그리지 않는다. */
  intakePending?: string[];
  /** 작업자(가게) 이름. 서버가 내려 주지 않는 실제 링크에서는 비워 둔다. */
  workerName?: string;
  /** 마감 표시(예: "11월 6일 · 7일 남음"). 모르면 비워 둔다. */
  dueLabel?: string;
  /** 진행 단계. 모르면 비워 두고, 그러면 단계 칩을 그리지 않는다. */
  stage?: CustomerStage;
  /** 할 일 완료 개수. 이름은 내보내지 않고 개수만 보여 준다. 할 일이 없으면 그리지 않는다. */
  progress?: { done: number; total: number };
  badgeLabel: string;
  footnote: string;
  /** 성공하면 차감 결과를 돌려주고, 실패하면 고객에게 보여줄 문구로 throw한다. */
  onSubmit: (input: { name: string; content: string }) => Promise<PublicRevisionUsage>;
  /** 카드 위에 붙는 안내(체험 화면 표시 등). 실제 링크에서는 비워 둔다. */
  before?: ReactNode;
  pageClassName?: string;
};

export function PublicRevisionView({
  title,
  packageName,
  revision,
  intakePending,
  workerName,
  dueLabel,
  stage,
  progress,
  badgeLabel,
  footnote,
  onSubmit,
  before,
  pageClassName,
}: PublicRevisionViewProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [receipt, setReceipt] = useState<PublicRevisionUsage | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 서버가 주는 기본 제목은 이미 "고객 · 패키지" 모양이라, 패키지 이름으로 끝나면 다시 붙이지 않는다.
  const titleLine = title === packageName || title.endsWith(` · ${packageName}`) ? title : `${title} · ${packageName}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      setReceipt(await onSubmit({ name, content }));
      setContent("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "요청을 저장하지 못했어요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={pageClassName ? `publicRevisionPage ${pageClassName}` : "publicRevisionPage"}>
      {before}
      <section className="publicRevisionCard">
        <header className="publicRevisionHeader">
          <Brand />
          <span className="localDemoBadge"><ShieldCheck size={14} /> {badgeLabel}</span>
        </header>

        {receipt ? (
          <div className="revisionReceipt" role="status">
            <CheckCircle2 size={36} />
            <h1>수정 요청을 남겼어요</h1>
            <p>
              {receipt === "pending"
                ? revision.remaining > 0
                  ? "요청을 접수했어요. 작업자가 수정을 마치면 그때 포함 수정 1회로 세요."
                  : "요청을 접수했어요. 남은 포함 수정이 없어서, 추가 작업으로 진행할지 작업자가 먼저 알려 드려요."
                : receipt === "used"
                  ? "포함 수정 1회로 접수됐어요. 요청 내용과 접수 시각이 작업자에게 기록됐어요."
                  : "포함된 수정 횟수를 넘어 추가 작업 검토 요청으로 기록됐어요."}
            </p>
            <div className="publicRevisionNextStep" data-testid="revision-next-step">
              <strong>다음에 일어나는 일</strong>
              <p>
                {receipt === "extra_scope" || (receipt === "pending" && revision.remaining === 0)
                  ? "남은 포함 수정이 없어서, 추가 작업으로 진행할지 작업자가 먼저 확인하고 알려 드려요."
                  : "작업자가 요청을 확인하고 평소 연락하던 방법으로 답해 드려요."}
                {" "}남은 포함 수정은 {revision.remaining}회예요.
              </p>
            </div>
            <button type="button" className="primaryButton" onClick={() => setReceipt(null)}>다른 요청 남기기</button>
          </div>
        ) : (
          <>
            <div className="publicRevisionIntro">
              {workerName && <p className="publicRevisionWorker" data-testid="revision-worker">{workerName}</p>}
              <p className="pageEyebrow">{titleLine}</p>
              <h1>수정할 내용을 한 번에 남겨주세요</h1>
              <p>남겨주신 내용은 접수 시각과 함께 기록돼요. 서로 다른 수정사항은 번호를 붙이면 더 정확해요.</p>
            </div>

            <dl className="publicRevisionFacts" data-has-due={Boolean(dueLabel)}>
              <div className="publicRevisionCounter">
                <dt>남은 수정</dt>
                <dd><strong data-testid="revision-remaining">{revision.remaining}</strong><span>회</span></dd>
                <dd className="publicRevisionFactSub">전체 {revision.included}회 중 {revision.used}회 사용</dd>
                {(revision.pending ?? 0) > 0 && (
                  <dd className="publicRevisionFactSub" data-testid="revision-pending">확인 대기 {revision.pending}건</dd>
                )}
              </div>
              {dueLabel && (
                <div className="publicRevisionDue">
                  <dt>마감</dt>
                  <dd data-testid="revision-due">{dueLabel}</dd>
                </div>
              )}
            </dl>

            {stage !== undefined && (
              <ol className="customerStageChips" aria-label="진행 단계">
                {CUSTOMER_STAGE_LABELS.map((label, index) => {
                  const state = index < stage ? "done" : index === stage ? "current" : "todo";
                  return (
                    <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
                      {state === "done" && <Check size={13} aria-hidden="true" />}
                      <span>{label}</span>
                      {state === "current" && <em>지금</em>}
                    </li>
                  );
                })}
              </ol>
            )}
            {stage !== undefined && progress && progress.total > 0 && (
              <p className="customerStageProgress" data-testid="revision-progress">할 일 {progress.total}개 중 {progress.done}개 완료</p>
            )}

            {intakePending && intakePending.length > 0 && (
              <div className="publicRevisionNextStep publicRevisionIntake" data-testid="revision-intake-pending">
                <strong>작업을 시작하려면 아직 필요한 자료</strong>
                <ul>
                  {intakePending.map((label, index) => <li key={`${index}-${label}`}>{label}</li>)}
                </ul>
                <p>평소 대화창으로 보내 주세요. 받으면 작업자가 이 목록에서 지워요.</p>
              </div>
            )}

            {/* 수정 횟수는 접수가 아니라 작업자가 수정을 마칠 때 쓴다(engine.ts completeRevision). 질문만 하려다 횟수를 걱정하지 않도록 제출 전에 알린다. */}
            <div className="publicRevisionNextStep" data-testid="revision-how-it-counts">
              <strong>요청을 남기면</strong>
              <p>
                {revision.remaining > 0
                  ? "먼저 접수되고, 작업자가 수정을 마치면 그때 포함 수정 1회로 세요."
                  : "남은 포함 수정이 없어서, 새 요청은 작업자가 추가 작업으로 따로 협의해요."}
                {" "}질문은 평소 대화창으로 해 주시고, 답도 평소 연락하던 방법으로 드려요.
              </p>
            </div>

            <form className="publicRevisionFields" onSubmit={submit}>
              <label>
                <span>이름 또는 담당자명 <small>선택</small></span>
                <input maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 김담당" />
              </label>
              <label>
                <span>수정 요청 내용</span>
                <textarea required minLength={2} maxLength={4000} value={content} onChange={(event) => setContent(event.target.value)} placeholder={"1. 메인 문구를 바꿔주세요.\n2. 두 번째 이미지가 모바일에서 잘리지 않게 수정해주세요."} rows={7} />
              </label>
              <button className="primaryButton publicRevisionSubmit" type="submit" disabled={pending}>
                <Send size={17} /> {pending ? "저장 중…" : "요청 남기기"}
              </button>
              {error && <p className="publicRevisionError" role="alert">{error}</p>}
            </form>
            <p className="publicRevisionFootnote">{footnote}</p>
          </>
        )}
        <PublicRevisionPrivacyNotice />
      </section>
    </main>
  );
}
