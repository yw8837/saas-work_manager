"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";

import { Brand } from "./brand";
import { useWorkspace } from "./workspace-provider";
import {
  getSupabaseBrowserClient,
  hasCurrentPolicyAcceptance,
  recordCurrentPolicyAcceptance,
} from "@/lib/supabase";
import { currentPolicyAcceptance } from "@/lib/policies";
import { nativePlatform } from "@/lib/native/platform";
import { subscribeNativeAuth, nativeAuthStatus, cancelNativeOAuth } from "@/lib/native/auth-runtime";
import { NativeOfflineWorkspace } from "./native-offline-workspace";

export function WorkspaceAuthGate({ children }: { children: ReactNode }) {
  const native = nativePlatform() !== "web";
  const nativeAuth = useSyncExternalStore(subscribeNativeAuth, nativeAuthStatus, nativeAuthStatus);
  const { runtimeMode, authStatus, authError, signInWithGoogle, signOut } = useWorkspace();
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [pending, setPending] = useState<"google" | "policy" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [policyGateStatus, setPolicyGateStatus] = useState<"idle" | "checking" | "required" | "accepted" | "error">("idle");
  const [policyGateError, setPolicyGateError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (runtimeMode !== "hosted" || authStatus !== "signed_in") {
        setPolicyGateStatus("idle");
        setPolicyGateError(null);
        return;
      }

      const client = getSupabaseBrowserClient();
      if (!client) {
        setPolicyGateStatus("error");
        setPolicyGateError("정책 동의 기록을 확인할 Hosted 연결이 없어요.");
        return;
      }

      setPolicyGateStatus("checking");
      setPolicyGateError(null);
      void hasCurrentPolicyAcceptance(client)
        .then((accepted) => {
          if (active) setPolicyGateStatus(accepted ? "accepted" : "required");
        })
        .catch((error: unknown) => {
          if (!active) return;
          setPolicyGateStatus("error");
          setPolicyGateError(error instanceof Error ? error.message : "정책 동의 기록을 확인하지 못했어요.");
        });
    });

    return () => { active = false; };
  }, [authStatus, runtimeMode]);

  async function acceptSignedInPolicies() {
    if (!policiesAccepted) {
      setFeedback("이용약관과 개인정보처리방침에 동의해주세요.");
      return;
    }

    const client = getSupabaseBrowserClient();
    if (!client) {
      setFeedback("정책 동의 기록을 저장할 Hosted 연결이 없어요.");
      return;
    }

    setPending("policy");
    setFeedback(null);
    try {
      await recordCurrentPolicyAcceptance(client, currentPolicyAcceptance());
      setPolicyGateStatus("accepted");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "정책 동의 기록을 저장하지 못했어요.");
    } finally {
      setPending(null);
    }
  }

  if (runtimeMode === "local") return children;
  if (native && authStatus === "offline") return <NativeOfflineWorkspace />;
  if (authStatus === "signed_in" && policyGateStatus === "accepted") return children;

  if (
    authStatus === "loading"
    || (authStatus === "signed_in" && ["idle", "checking"].includes(policyGateStatus))
  ) {
    return (
      <main className="authPage">
        <section className="authCard authLoading" aria-live="polite">
          <Brand />
          <span className="authSpinner" aria-hidden="true" />
          <h1>내 작업공간을 불러오고 있어요</h1>
        </section>
      </main>
    );
  }

  if (authStatus === "configuration_error" || policyGateStatus === "error") {
    return (
      <main className="authPage">
        <section className="authCard">
          <Brand />
          <span className="authIcon error"><LockKeyhole size={23} /></span>
          <h1>Hosted 연결을 확인해주세요</h1>
          <p>{policyGateError ?? authError ?? "Supabase 환경값이나 migration 적용 상태를 확인해주세요."}</p>
          <small>설정이 빠진 Hosted 빌드는 로컬 저장으로 몰래 전환하지 않아요.</small>
        </section>
      </main>
    );
  }

  if (authStatus === "signed_in" && policyGateStatus === "required") {
    return (
      <main className="authPage">
        <section className="authCard">
          <Brand />
          <span className="authIcon"><ShieldCheck size={23} /></span>
          <div className="authHeading">
            <h1>첫 사용 전 동의가 필요해요</h1>
            <p>현재 정책을 확인하고 동의하면 작업공간을 바로 열 수 있어요.</p>
          </div>
          <form className="authForm" onSubmit={(event) => {
            event.preventDefault();
            void acceptSignedInPolicies();
          }}>
            <label className="authPolicyConsent">
              <input
                required
                type="checkbox"
                checked={policiesAccepted}
                onChange={(event) => setPoliciesAccepted(event.target.checked)}
              />
              <span>
                <Link href="/terms">이용약관</Link>과 <Link href="/privacy">개인정보처리방침</Link>을 읽었으며
                두 문서에 모두 동의합니다. (필수)
              </span>
            </label>
            <button className="primaryButton authPrimary" type="submit" disabled={pending !== null}>
              {pending === "policy" ? "동의 저장 중…" : "동의하고 작업공간 열기"}<ArrowRight size={17} />
            </button>
            <button className="authTextButton" type="button" disabled={pending !== null} onClick={() => void signOut()}>
              다른 계정으로 로그인
            </button>
          </form>
          {feedback && <p className="authFeedback" role="status">{feedback}</p>}
          <small>동의 버전과 시각은 계정별 증빙으로 저장됩니다.</small>
        </section>
      </main>
    );
  }

  async function performGoogleLogin() {
    setPending("google");
    setFeedback(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "요청을 처리하지 못했어요.");
      setPending(null);
    } finally {
      // Native login leaves this WebView open; its external-store status owns the pending UI.
      if (native) setPending(null);
    }
  }

  return (
    <main className="authPage">
      <section className="authCard">
        <Brand />
        <span className="authIcon"><ShieldCheck size={23} /></span>
        <div className="authHeading">
          <h1>Google 계정으로 시작하기</h1>
          <p>한 번 로그인하면 내 고객·금액·수정 기록만 따로 저장돼요.</p>
        </div>
        <form className="authForm" onSubmit={(event) => {
          event.preventDefault();
          void performGoogleLogin();
        }}>
          <button className="primaryButton authPrimary" type="submit" disabled={pending !== null || (native && nativeAuth.pending)}>
            {pending === "google" || (native && nativeAuth.pending) ? "Google로 이동 중…" : "Google로 계속하기"}
            <ArrowRight size={17} />
          </button>
          {native && nativeAuth.pending && (
            <button className="authTextButton" type="button" onClick={() => {
              void cancelNativeOAuth().catch(() => setFeedback("로그인 취소를 완료하지 못했어요. 앱을 다시 열어주세요."));
            }}>로그인 취소</button>
          )}
        </form>
        {(feedback || authError || (native && nativeAuth.error)) && <p className="authFeedback" role="status">{feedback ?? authError ?? nativeAuth.error}</p>}
        <small>
          Google 인증은 Supabase Auth가 처리하며 Google 비밀번호는 일감체크에 저장되지 않아요.
          {' '}<Link href="/terms">이용약관</Link> · <Link href="/privacy">개인정보처리방침</Link>
        </small>
      </section>
    </main>
  );
}
