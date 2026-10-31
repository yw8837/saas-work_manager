"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  PublicRevisionLoading,
  PublicRevisionUnavailable,
  PublicRevisionView,
} from "@/components/public-revision-view";
import { getRevisionSummary, useWorkspace } from "@/components/workspace-provider";
import {
  getHostedPublicRevisionSummary,
  getHostedRuntimeBoundary,
  getSupabaseBrowserClient,
  submitHostedPublicRevision,
  type PublicRevisionSummary,
} from "@/lib/supabase";

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

  async function submit({ name, content }: { name: string; content: string }) {
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
      setHostedSummary((current) => current ? {
        ...current,
        used: result.usage === "used" ? current.used + 1 : current.used,
        remaining: result.remaining,
      } : current);
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
      : "링크가 꺼졌거나 작업이 완료됐어요.";
    return <PublicRevisionUnavailable message={error ?? emptyReason} />;
  }

  const revision = hostedSummary ?? getRevisionSummary(localJob!);
  const title = hostedSummary?.title ?? localJob!.clientLabel;
  const packageName = hostedSummary?.packageName ?? localJob!.packageSnapshot.name;

  return (
    <PublicRevisionView
      title={title}
      packageName={packageName}
      revision={revision}
      badgeLabel={hosted ? "보안 링크로 직접 전달" : "이 브라우저에 저장"}
      footnote={hosted ? "링크를 받은 사람만 요청할 수 있어요. 연락처·금액·다른 고객 정보는 공개하지 않아요." : "보내주신 내용은 지금 이 브라우저에만 저장돼요."}
      onSubmit={submit}
    />
  );
}
