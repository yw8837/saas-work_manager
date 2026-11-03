"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  PublicRevisionCompleted,
  PublicRevisionLoading,
  PublicRevisionUnavailable,
  PublicRevisionView,
} from "@/components/public-revision-view";
import { getRevisionSummary, useWorkspace } from "@/components/workspace-provider";
import {
  customerCompletedLabel,
  customerDueLabel,
  customerProgressOf,
  customerRequestsOf,
  customerStageFromProgress,
  pendingIntakeLabels,
  type CustomerProgress,
} from "@/lib/domain";
import { localToday } from "@/lib/store";
import {
  getHostedPublicRevisionSummary,
  getHostedRuntimeBoundary,
  getSupabaseBrowserClient,
  submitHostedPublicRevision,
  type PublicRevisionSummary,
} from "@/lib/supabase";

export function PublicRevisionForm({ token }: { token: string }) {
  const { jobs, settings, hydrated, recordPublicRevision } = useWorkspace();
  const hosted = useMemo(() => getHostedRuntimeBoundary().requestedMode === "hosted", []);
  const localMatch = useMemo(
    () => jobs.find((item) => item.revisionPortalToken === token),
    [jobs, token],
  );
  // 링크를 켠 채 완료한 일감은 완료 화면을, 끈 링크·보관한 일감은 '사용할 수 없음'을 보인다.
  const localJob = localMatch?.revisionPortalEnabled && localMatch.status !== "archived" ? localMatch : undefined;
  const [hostedSummary, setHostedSummary] = useState<PublicRevisionSummary | null>(null);
  const [loading, setLoading] = useState(hosted);
  const [error, setError] = useState<string | null>(null);
  const retryIdentityRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!hosted) return;
    const client = getSupabaseBrowserClient();
    if (!client) {
      const timer = window.setTimeout(() => {
        setError("링크를 열 수 없어요. 작업자에게 링크를 다시 받아 주세요.");
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

  async function submit({ name, content }: { name: string; content: string }) {
    if (hosted) {
      const client = getSupabaseBrowserClient();
      if (!client) throw new Error("링크를 열 수 없어요. 작업자에게 링크를 다시 받아 주세요.");
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
      setHostedSummary((current) => current ? {
        ...current,
        used: result.usage === "used" ? current.used + 1 : current.used,
        // 지금 규칙에서는 접수가 확인 대기로 쌓인다. 대기 건수를 모르는 옛 서버면 그대로 둔다.
        pending: result.usage === "pending" && current.pending !== undefined ? current.pending + 1 : current.pending,
        remaining: result.remaining,
        // 방금 남긴 요청도 되돌리지 않은 요청이라 진행 단계가 '수정'으로 바뀐다.
        hasOpenRevision: current.tasksTotal === undefined ? current.hasOpenRevision : true,
        // 목록을 아는 서버면 방금 남긴 요청을 맨 위에 '접수됨'으로 먼저 보여 준다(곧 서버 요약으로 맞춘다).
        requests: current.requests === undefined || result.usage !== "pending"
          ? current.requests
          : [{ status: "pending" as const, submittedAt: result.submittedAt, body: content.trim() }, ...current.requests].slice(0, 20),
      } : current);
      // 링크를 연 사이 작업자가 다른 요청을 '수정 완료'했을 수 있다. 처음 읽은 값으로 계산한 숫자 대신 서버 요약으로 맞춘다.
      void getHostedPublicRevisionSummary(client, token)
        .then((fresh) => { if (fresh) setHostedSummary(fresh); })
        .catch(() => undefined);
      return result.usage;
    }
    const result = recordPublicRevision(token, content, name);
    if (!result) throw new Error("사용할 수 없는 링크예요.");
    return result.usage;
  }

  if (loading || (!hosted && !hydrated)) {
    return <PublicRevisionLoading />;
  }

  if ((hosted && !hostedSummary) || (!hosted && !localJob)) {
    // 로컬 모드에는 서버가 없다. 이 브라우저에 그 일감이 아예 없으면 링크가 꺼진 게 아니라
    // 애초에 다른 기기에서 열린 것이다. 고객에게 잘못된 이유를 말하면 작업자에게 헛물을 켠다.
    const emptyReason = !hosted && !localMatch
      ? "이 링크는 작업자 기기에 저장된 일감을 여는 주소예요. 작업자에게 다시 요청해주세요."
      : "링크가 꺼졌거나 새 주소로 바뀌었어요.";
    return <PublicRevisionUnavailable message={error ?? emptyReason} />;
  }

  const revision = hostedSummary ?? getRevisionSummary(localJob!);
  const title = hostedSummary?.title ?? localJob!.clientLabel;
  const packageName = hostedSummary?.packageName ?? localJob!.packageSnapshot.name;
  // 새 RPC가 없는 DB에서는 hostedSummary에 진행 정보가 없다. 그때는 이름·마감·단계를 그리지 않는다.
  const progress: CustomerProgress | undefined = hostedSummary
    ? hostedSummary.tasksTotal === undefined
      ? undefined
      : {
          total: hostedSummary.tasksTotal,
          done: hostedSummary.tasksDone ?? 0,
          hasOpenRevision: hostedSummary.hasOpenRevision ?? false,
          intakePending: hostedSummary.intakePending?.length,
        }
    : customerProgressOf(localJob!);
  const dueDate = hostedSummary ? hostedSummary.dueDate : localJob!.dueDate;
  const workerName = (hostedSummary ? hostedSummary.workerName : settings.publicWorkerName)?.trim().slice(0, 40) || undefined;
  const requests = hostedSummary ? hostedSummary.requests : customerRequestsOf(localJob!);
  const intakePending = hostedSummary ? hostedSummary.intakePending : pendingIntakeLabels(localJob!);

  const completed = hostedSummary ? hostedSummary.jobStatus === "completed" : localJob!.status === "completed";
  if (completed) {
    return (
      <PublicRevisionCompleted
        title={title}
        packageName={packageName}
        completedLabel={customerCompletedLabel(hostedSummary ? hostedSummary.completedAt : localJob!.completedAt)}
        workerName={workerName}
        requests={requests}
      />
    );
  }

  return (
    <PublicRevisionView
      title={title}
      packageName={packageName}
      revision={revision}
      intakePending={intakePending}
      workerName={workerName}
      dueLabel={dueDate ? customerDueLabel(dueDate, localToday()) : undefined}
      stage={progress ? customerStageFromProgress(progress) : undefined}
      progress={progress}
      requests={requests}
      badgeLabel={hosted ? "보안 링크로 직접 전달" : "이 브라우저에 저장"}
      footnote={hosted ? "링크를 받은 사람만 요청할 수 있어요. 연락처·금액·다른 고객 정보는 공개하지 않아요." : "보내주신 내용은 지금 이 브라우저에만 저장돼요."}
      onSubmit={submit}
    />
  );
}
