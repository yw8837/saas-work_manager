"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, LockKeyhole, Send, ShieldCheck } from "lucide-react";

import { Brand } from "@/components/brand";
import { getRevisionSummary, useWorkspace } from "@/components/workspace-provider";
import { getPublicServiceConfig } from "@/lib/policies";
import {
  getHostedPublicRevisionSummary,
  getHostedRuntimeBoundary,
  getSupabaseBrowserClient,
  submitHostedPublicRevision,
  type PublicRevisionSummary,
} from "@/lib/supabase";

function PublicRevisionPrivacyNotice() {
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

export function PublicRevisionForm({ token }: { token: string }) {
  const { jobs, hydrated, recordPublicRevision } = useWorkspace();
  const hosted = useMemo(() => getHostedRuntimeBoundary().requestedMode === "hosted", []);
  const localMatch = useMemo(
    () => jobs.find((item) => item.revisionPortalToken === token),
    [jobs, token],
  );
  const localJob = localMatch?.revisionPortalEnabled ? localMatch : undefined;
  const [hostedSummary, setHostedSummary] = useState<PublicRevisionSummary | null>(null);
  const [loading, setLoading] = useState(hosted);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [receipt, setReceipt] = useState<"used" | "extra_scope" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryIdentityRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!hosted) return;
    const client = getSupabaseBrowserClient();
    if (!client) {
      const timer = window.setTimeout(() => {
        setError("Hosted 공개 링크가 설정되지 않았어요.");
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    void getHostedPublicRevisionSummary(client, token)
      .then((summary) => { if (!cancelled) setHostedSummary(summary); })
      .catch(() => { if (!cancelled) setHostedSummary(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hosted, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (hosted) {
        const client = getSupabaseBrowserClient();
        if (!client) throw new Error("Hosted 공개 링크가 설정되지 않았어요.");
        const fingerprint = `${name.trim()}\u0000${content.trim()}`;
        if (retryIdentityRef.current?.fingerprint !== fingerprint) {
          retryIdentityRef.current = { fingerprint, key: crypto.randomUUID() };
        }
        const result = await submitHostedPublicRevision(client, {
          token,
          body: content,
          clientLabel: name,
          idempotencyKey: retryIdentityRef.current.key,
        });
        retryIdentityRef.current = null;
        setReceipt(result.usage);
        setHostedSummary((current) => current ? {
          ...current,
          used: result.usage === "used" ? current.used + 1 : current.used,
          remaining: result.remaining,
        } : current);
      } else {
        const result = recordPublicRevision(token, content, name);
        if (!result) throw new Error("사용할 수 없는 링크예요.");
        setReceipt(result.usage);
      }
      setContent("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "요청을 저장하지 못했어요.");
    } finally {
      setPending(false);
    }
  }

  if (loading || (!hosted && !hydrated)) {
    return <main className="publicRevisionPage"><p>수정요청 화면을 준비하고 있어요.</p></main>;
  }

  if ((hosted && !hostedSummary) || (!hosted && !localJob)) {
    // 로컬 모드에는 서버가 없다. 이 브라우저에 그 일감이 아예 없으면 링크가 꺼진 게 아니라
    // 애초에 다른 기기에서 열린 것이다. 고객에게 잘못된 이유를 말하면 작업자에게 헛물을 켠다.
    const emptyReason = !hosted && !localMatch
      ? "이 링크는 작업자 기기에 저장된 일감을 여는 주소예요. 작업자에게 다시 요청해주세요."
      : "링크가 꺼졌거나 작업이 완료됐어요.";
    return (
      <main className="publicRevisionPage">
        <section className="publicRevisionCard publicRevisionEmpty">
          <Brand />
          <LockKeyhole size={28} />
          <h1>사용할 수 없는 링크예요</h1>
          <p>{error ?? emptyReason}</p>
          <PublicRevisionPrivacyNotice />
        </section>
      </main>
    );
  }

  const revision = hostedSummary ?? getRevisionSummary(localJob!);
  const title = hostedSummary?.title ?? localJob!.clientLabel;
  const packageName = hostedSummary?.packageName ?? localJob!.packageSnapshot.name;

  return (
    <main className="publicRevisionPage">
      <section className="publicRevisionCard">
        <header className="publicRevisionHeader">
          <Brand />
          <span className="localDemoBadge"><ShieldCheck size={14} /> {hosted ? "보안 링크로 직접 전달" : "이 브라우저에 저장"}</span>
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
            <p className="publicRevisionFootnote">{hosted ? "링크를 받은 사람만 요청할 수 있어요. 연락처·금액·다른 고객 정보는 공개하지 않아요." : "보내주신 내용은 지금 이 브라우저에만 저장돼요."}</p>
          </>
        )}
        <PublicRevisionPrivacyNotice />
      </section>
    </main>
  );
}
