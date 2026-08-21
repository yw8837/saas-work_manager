"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, LockKeyhole } from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Brand } from "./brand";

export function PasswordResetForm() {
  const [sessionReady, setSessionReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      const timer = window.setTimeout(() => setChecked(true), 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    const settle = (hasSession: boolean) => {
      if (!active) return;
      setSessionReady(hasSession);
      setChecked(true);
    };
    void client.auth.getSession().then(({ data }) => settle(Boolean(data.session)));
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (session) settle(true);
    });
    const timer = window.setTimeout(() => setChecked(true), 5000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      listener.subscription.unsubscribe();
    };
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getSupabaseBrowserClient();
    if (!client || !sessionReady) return;
    setPending(true);
    setFeedback(null);
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      setFeedback(error.message);
      setPending(false);
      return;
    }
    setFeedback("새 비밀번호를 저장했어요. 작업공간으로 이동할게요.");
    window.setTimeout(() => window.location.replace("/today"), 700);
  }

  return (
    <main className="authPage">
      <section className="authCard">
        <Brand />
        <span className="authIcon"><LockKeyhole size={23} /></span>
        <div className="authHeading">
          <h1>새 비밀번호 설정</h1>
          <p>재설정 메일을 연 이 브라우저에서 새 비밀번호를 저장해요.</p>
        </div>
        {!checked ? (
          <p className="authFeedback neutral" role="status">재설정 링크를 확인하고 있어요.</p>
        ) : !sessionReady ? (
          <p className="authFeedback" role="alert">링크가 만료됐거나 유효하지 않아요. 로그인 화면에서 재설정 메일을 다시 요청해주세요.</p>
        ) : (
          <form className="authForm" onSubmit={updatePassword}>
            <label>
              <span>새 비밀번호</span>
              <span className="authInput"><LockKeyhole size={17} /><input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8자 이상" /></span>
            </label>
            <button className="primaryButton authPrimary" type="submit" disabled={pending}>
              {pending ? "저장 중…" : <><CheckCircle2 size={17} /> 새 비밀번호 저장</>}
            </button>
          </form>
        )}
        {feedback && <p className={feedback.startsWith("새 비밀번호") ? "authFeedback success" : "authFeedback"} role="status">{feedback}</p>}
      </section>
    </main>
  );
}
