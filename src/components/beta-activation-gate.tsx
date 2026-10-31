"use client";

import { ArrowRight, BadgeCheck, KeyRound } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { captureInviteFromLocation, clearPendingInvite, peekPendingInvite, readPendingInvite } from "@/lib/invite-link";
import { Brand } from "./brand";
import { useWorkspace } from "./workspace-provider";

export function BetaActivationGate({ children }: { children: ReactNode }) {
  const {
    hydrated,
    runtimeMode,
    settings,
    planAccess,
    activateInviteCode,
    updateSettings,
  } = useWorkspace();
  const [inviteCode, setInviteCode] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  // 초대 링크로 받은 코드: 있으면 관문 화면 대신 "적용 중"을 먼저 보여 주고 자동으로 적용한다.
  const [inviteStatus, setInviteStatus] = useState<"none" | "pending" | "failed">(() => (peekPendingInvite() ? "pending" : "none"));
  const inviteStarted = useRef(false);

  const alreadyCompleted = Boolean(
    settings.betaCodeOnboardingCompletedAt
    || planAccess.source === "beta",
  );

  useEffect(() => {
    if (runtimeMode !== "hosted" || !hydrated || inviteStarted.current) return;
    // 이 컴포넌트가 로그인 관문보다 먼저 효과를 실행할 수 있어 여기서도 주소의 코드를 옮겨 둔다.
    captureInviteFromLocation();
    const code = readPendingInvite();
    if (!code) {
      if (inviteStatus === "pending") queueMicrotask(() => setInviteStatus("none"));
      return;
    }
    inviteStarted.current = true;
    if (planAccess.source === "beta") {
      // 이미 베타 Pro가 켜진 계정이면 다시 적용할 필요가 없다.
      clearPendingInvite();
      queueMicrotask(() => setInviteStatus("none"));
      return;
    }
    const fail = (message: string) => {
      setInviteCode(code);
      setFeedback(message);
      setInviteStatus("failed");
    };
    void activateInviteCode(code)
      .then((result) => {
        clearPendingInvite();
        if (!result.ok) {
          fail(result.message);
          return;
        }
        updateSettings({ betaCodeOnboardingCompletedAt: new Date().toISOString() });
        setCompleted(true);
        setInviteStatus("none");
      })
      .catch(() => {
        clearPendingInvite();
        fail("코드를 확인하지 못했어요. 잠시 뒤 다시 시도해주세요.");
      });
  }, [activateInviteCode, hydrated, inviteStatus, planAccess.source, runtimeMode, updateSettings]);

  const showGate = inviteStatus === "failed" || !(alreadyCompleted || completed);
  if (runtimeMode !== "hosted" || (hydrated && inviteStatus === "none" && !showGate)) {
    return children;
  }

  if (hydrated && inviteStatus === "pending") {
    return (
      <main className="authPage">
        <section className="authCard authLoading" aria-live="polite" data-testid="invite-applying">
          <Brand />
          <span className="authSpinner" aria-hidden="true" />
          <h1>초대 코드를 적용하고 있어요</h1>
        </section>
      </main>
    );
  }

  if (!hydrated) {
    return (
      <main className="authPage">
        <section className="authCard authLoading" aria-live="polite">
          <Brand />
          <span className="authSpinner" aria-hidden="true" />
          <h1>첫 설정을 준비하고 있어요</h1>
        </section>
      </main>
    );
  }

  function finishOnboarding() {
    updateSettings({ betaCodeOnboardingCompletedAt: new Date().toISOString() });
    setCompleted(true);
    setInviteStatus("none");
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!inviteCode.trim()) {
      setFeedback("베타 이용 코드를 입력해주세요.");
      return;
    }

    setPending(true);
    setFeedback(null);
    try {
      const result = await activateInviteCode(inviteCode);
      if (!result.ok) {
        setFeedback(result.message);
        return;
      }
      finishOnboarding();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "코드를 확인하지 못했어요. 잠시 뒤 다시 시도해주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="authPage betaActivationPage">
      <section className="authCard betaActivationCard">
        <Brand />
        <span className="authIcon"><KeyRound size={23} /></span>
        <div className="authHeading">
          <h1>베타 코드가 있나요?</h1>
          <p>초대 코드를 받았다면 지금 입력해 30일 동안 Pro 기능을 사용하세요.</p>
        </div>

        <div className="betaActivationBenefits" aria-label="베타 이용 혜택">
          <span><BadgeCheck size={16} />30일 동안 일감·패키지 무제한</span>
          <span><BadgeCheck size={16} />사용 이력은 베타 참여 혜택으로 기록</span>
        </div>

        <form className="authForm" onSubmit={submitCode}>
          <label>
            <span>베타 이용 코드</span>
            <span className="authInput">
              <KeyRound size={17} />
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                autoComplete="off"
                inputMode="text"
                placeholder="받은 코드를 입력하세요"
                aria-describedby={feedback ? "beta-activation-feedback" : undefined}
              />
            </span>
          </label>
          <button className="primaryButton authPrimary" type="submit" disabled={pending}>
            {pending ? "코드 확인 중…" : "코드 적용하고 Pro 시작"}
            {!pending && <ArrowRight size={17} />}
          </button>
          <button className="secondaryButton authSecondary" type="button" disabled={pending} onClick={finishOnboarding}>
            코드 없이 무료로 시작
          </button>
        </form>

        {feedback && <p className="authFeedback" id="beta-activation-feedback" role="status">{feedback}</p>}
        <small>건너뛰어도 설정에서 코드를 나중에 입력할 수 있어요.</small>
      </section>
    </main>
  );
}
