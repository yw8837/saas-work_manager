"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from "lucide-react";

import { Brand } from "./brand";
import { useWorkspace } from "./workspace-provider";
import {
  getSupabaseBrowserClient,
  hasCurrentPolicyAcceptance,
  recordCurrentPolicyAcceptance,
} from "@/lib/supabase";
import { currentPolicyAcceptance, getPublicServiceConfig } from "@/lib/policies";

export function WorkspaceAuthGate({ children }: { children: ReactNode }) {
  const { runtimeMode, authStatus, authError, signIn, signUp, signOut } = useWorkspace();
  const service = getPublicServiceConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [pending, setPending] = useState<"login" | "signup" | "reset" | "policy" | null>(null);
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
            <p>초대로 만든 계정도 현재 정책을 직접 확인한 뒤 작업공간을 열 수 있어요.</p>
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

  async function performAuth(mode: "login" | "signup") {
    setPending(mode);
    setFeedback(null);
    try {
      if (mode === "login") {
        await signIn(email, password);
      } else {
        if (!service.betaSignupEnabled) {
          throw new Error("현재는 초대받은 베타 계정만 사용할 수 있어요.");
        }
        if (!policiesAccepted) {
          throw new Error("이용약관과 개인정보처리방침에 동의해주세요.");
        }
        setFeedback(await signUp(email, password, currentPolicyAcceptance()));
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "요청을 처리하지 못했어요.");
    } finally {
      setPending(null);
    }
  }

  async function requestPasswordReset() {
    const normalizedEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setFeedback("재설정 메일을 받을 이메일을 먼저 입력해주세요.");
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) {
      setFeedback("Hosted 로그인이 설정되지 않았어요.");
      return;
    }
    setPending("reset");
    setFeedback(null);
    await client.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    setPending(null);
    // 성공·실패를 구분해 보여주면 그 주소로 가입했는지 알려주는 셈이 된다.
    // 어느 쪽이든 같은 문구를 준다.
    setFeedback("가입된 주소라면 비밀번호 재설정 메일을 보냈어요. 받은편지함을 확인해주세요.");
  }

  return (
    <main className="authPage">
      <section className="authCard">
        <Brand />
        <span className="authIcon"><ShieldCheck size={23} /></span>
        <div className="authHeading">
          <h1>{authMode === "signup" ? "베타 계정 만들기" : "내 일감으로 이어서 시작"}</h1>
          <p>{authMode === "signup" ? "가입 전 데이터 처리 기준을 확인해주세요." : "계정마다 고객·금액·수정 기록을 분리해 저장해요."}</p>
        </div>
        <form className="authForm" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          void performAuth(authMode);
        }}>
          <label>
            <span>이메일</span>
            <span className="authInput"><Mail size={17} /><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></span>
          </label>
          <label>
            <span>비밀번호</span>
            <span className="authInput"><LockKeyhole size={17} /><input required minLength={8} type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8자 이상" /></span>
          </label>
          {authMode === "signup" && (
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
          )}
          <button className="primaryButton authPrimary" type="submit" disabled={pending !== null}>
            {pending === authMode
              ? (authMode === "signup" ? "가입 중…" : "로그인 중…")
              : (authMode === "signup" ? "동의하고 베타 가입" : "로그인")}
            <ArrowRight size={17} />
          </button>
          {service.betaSignupEnabled && (
            <button
              className="secondaryButton authSecondary"
              type="button"
              disabled={pending !== null}
              onClick={() => {
                setAuthMode((current) => current === "login" ? "signup" : "login");
                setFeedback(null);
              }}
            >
              {authMode === "signup" ? "기존 계정으로 로그인" : "베타 계정 만들기"}
            </button>
          )}
          {authMode === "login" && (
            <button className="authTextButton" type="button" disabled={pending !== null} onClick={() => void requestPasswordReset()}>
              {pending === "reset" ? "재설정 메일 보내는 중…" : "비밀번호를 잊었어요"}
            </button>
          )}
        </form>
        {!service.betaSignupEnabled && (
          <aside className="closedBetaNotice">
            <strong>지금은 초대형 폐쇄 베타예요</strong>
            <p>운영자가 초대한 계정은 그대로 로그인할 수 있어요.</p>
            {service.supportEmail && <a href={`mailto:${service.supportEmail}`}>베타 문의</a>}
          </aside>
        )}
        {(feedback || authError) && <p className="authFeedback" role="status">{feedback ?? authError}</p>}
        <small>
          비밀번호와 세션은 Supabase Auth가 처리하며 앱 DB에는 저장하지 않아요.
          {' '}<Link href="/terms">이용약관</Link> · <Link href="/privacy">개인정보처리방침</Link>
        </small>
      </section>
    </main>
  );
}
