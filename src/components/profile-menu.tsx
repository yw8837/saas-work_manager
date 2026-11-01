"use client";

import Link from "next/link";
import { LogOut, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { PlanAccess } from "@/lib/domain";
import { useWorkspace } from "./workspace-provider";

const PLAN_NAMES = { free: "무료", basic: "Basic", pro: "Pro" } as const;

/** 프로필 메뉴에 보여 줄 요금제 한 줄. 베타·체험은 남은 날을 함께 쓴다. */
export function planSummary(access: Pick<PlanAccess, "plan" | "source" | "remainingDays">): string {
  const name = PLAN_NAMES[access.plan];
  if (access.source === "beta") return `${name} 베타 · ${access.remainingDays}일 남음`;
  if (access.source === "trial") return `${name} 체험 · ${access.remainingDays}일 남음`;
  return name;
}

/**
 * 상단바 오른쪽 계정 표시. 누르면 로그인한 계정·요금제·설정·로그아웃을 보여 준다.
 * 로그아웃은 설정 화면과 같은 함수를 쓰고, 저장 안 된 변경이 있어 멈추면 설정에서 마저 처리하게 안내한다.
 */
export function ProfileMenu() {
  const { userEmail, runtimeMode, planAccess, signOut } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const hosted = runtimeMode === "hosted";
  const label = userEmail ?? (hosted ? "내 계정" : "이 브라우저에 저장");

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutside);
    };
  }, [open]);

  const handleSignOut = async () => {
    setSigningOut(true);
    setError("");
    try {
      await signOut();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그아웃하지 못했어요.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="avatar avatarButton"
        aria-label={`계정 메뉴 열기: ${label}`}
        title={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="profile-menu"
        ref={buttonRef}
        onClick={() => setOpen((value) => !value)}
        data-testid="open-profile-menu"
      >
        {(userEmail?.[0] ?? "용").toUpperCase()}
      </button>
      {open && (
        <section className="alertPopover profilePopover" id="profile-menu" ref={panelRef} aria-label="계정" data-testid="profile-menu">
          <div className="profileSummary">
            <span className="avatar" aria-hidden="true">{(userEmail?.[0] ?? "용").toUpperCase()}</span>
            <div>
              <strong data-testid="profile-email">{label}</strong>
              <small data-testid="profile-plan">{planSummary(planAccess)}</small>
            </div>
          </div>
          <div className="profileActions">
            <Link href="/settings" onClick={() => setOpen(false)} className="profileAction">
              <Settings2 size={16} /> 설정
            </Link>
            {hosted && (
              <button type="button" className="profileAction" onClick={() => void handleSignOut()} disabled={signingOut} data-testid="profile-sign-out">
                <LogOut size={16} /> {signingOut ? "로그아웃 중…" : "로그아웃"}
              </button>
            )}
          </div>
          {error && (
            <p className="profileError" role="alert">
              {error} <Link href="/settings" onClick={() => setOpen(false)}>설정에서 처리하기</Link>
            </p>
          )}
        </section>
      )}
    </>
  );
}
