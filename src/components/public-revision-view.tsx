"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, LockKeyhole, Send, ShieldCheck } from "lucide-react";

import { Brand } from "@/components/brand";
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
      <strong>개인정보 처리 안내</strong>
      <p>
        이름·담당자명(선택), 수정 요청 원문과 접수 시각을 요청 전달·처리 기록 목적으로 저장하며,
        연결된 일감 또는 계정이 삭제될 때 함께 삭제합니다. 주민번호·건강정보·계좌 비밀번호 같은 민감한 내용은 적지 마세요.
      </p>
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
        <Brand />
        <LockKeyhole size={28} />
        <h1>사용할 수 없는 링크예요</h1>
        <p>{message}</p>
        <PublicRevisionPrivacyNotice />
      </section>
    </main>
  );
}

export type PublicRevisionUsage = "used" | "extra_scope";

export type PublicRevisionViewProps = {
  title: string;
  packageName: string;
  revision: { included: number; used: number; remaining: number };
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
            <p>{receipt === "used" ? "작업자에게 요청 내용과 접수 시각이 기록됐어요." : "포함된 수정 횟수를 넘어 추가 작업 검토 요청으로 기록됐어요."}</p>
            <button type="button" className="primaryButton" onClick={() => setReceipt(null)}>다른 요청 남기기</button>
          </div>
        ) : (
          <>
            <div className="publicRevisionIntro">
              <p className="pageEyebrow">{title} · {packageName}</p>
              <h1>수정할 내용을 한 번에 남겨주세요</h1>
              <p>남겨주신 내용은 접수 시각과 함께 기록돼요. 서로 다른 수정사항은 번호를 붙이면 더 정확해요.</p>
            </div>

            <div className="publicRevisionCounter">
              <span>포함 수정</span>
              <strong>{revision.remaining}회 남음</strong>
              <small>사용 {revision.used} / 전체 {revision.included}</small>
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
