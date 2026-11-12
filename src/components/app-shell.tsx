"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BellRing,
  BriefcaseBusiness,
  CalendarCheck2,
  MessageSquareText,
  PackageCheck,
  Plus,
  Settings2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  betaSurveyPromptAnswered,
  loadBetaSurveyPrompt,
  markBetaSurveyPromptShown,
  nextBetaSurveyPromptRecord,
  saveBetaSurveyPrompt,
  shouldShowBetaSurveyPrompt,
  type BetaSurveyPromptChoice,
  type BetaSurveyPromptMemory,
} from "@/lib/beta-survey-prompt";
import { BETA_GRANT_DAYS, type InAppAlertKind } from "@/lib/domain";
import { getPublicEnvironmentValue } from "@/lib/public-environment";
import { BetaSurveyDialog } from "./beta-survey-dialog";
import { Brand } from "./brand";
import { ProfileMenu } from "./profile-menu";
import { useWorkspace } from "./workspace-provider";
import "@/styles/workspace.css";

const primaryNavigation = [
  { href: "/today", label: "오늘", icon: CalendarCheck2 },
  { href: "/jobs", label: "일감", icon: BriefcaseBusiness },
  { href: "/packages", label: "패키지", icon: PackageCheck },
  { href: "/settings", label: "설정", icon: Settings2 },
];

const supportNavigation = [{ href: "/feedback", label: "의견 보내기", icon: MessageSquareText }];
// 14일 이용권의 절반(7일째)부터 설문 안내를 띄운다.
const BETA_SURVEY_START_DAY = 7;
// 이용권이 끝난 뒤 설문 팝업: 브라우저 저장소를 못 쓸 때 이번 방문(새로 고침 전까지)만 기억하는 곳.
const betaSurveyPromptMemory: BetaSurveyPromptMemory = new Map();

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isCurrent(pathname: string, href: string) {
  if (href === "/today") return pathname === href;
  // 새 일감 화면은 '새 일감' 버튼이 지금 위치다(일감 메뉴와 겹쳐 표시하지 않는다).
  if (href === "/jobs" && pathname.startsWith("/jobs/new")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function alertKindLabel(kind: InAppAlertKind) {
  if (kind === "deadline") return "마감";
  if (kind === "waiting") return "고객 대기";
  if (kind === "digest") return "브리핑";
  return "수정 요청";
}

function pageContext(pathname: string) {
  if (pathname.startsWith("/jobs/new")) return ["새 일감", "주문 네 가지만 입력하면 돼요"];
  if (/^\/jobs\/summary\/?$/.test(pathname)) return ["월별 정리", "완료한 주문을 달마다 모아 봐요"];
  if (pathname.startsWith("/jobs/")) return ["일감 상세", "범위와 진행 상황을 한곳에서"];
  if (pathname.startsWith("/jobs")) return ["전체 일감", "진행 중인 고객을 빠르게 확인"];
  if (pathname.startsWith("/packages")) return ["패키지", "한 번 저장하고 다음 주문부터 재사용"];
  if (pathname.startsWith("/settings")) return ["설정", "알림과 데이터 보관 방식을 관리"];
  if (pathname.startsWith("/feedback")) return ["의견 보내기", "개인정보 없이 짧게 받아요"];
  return ["오늘", "지금 처리할 일만 모았어요"];
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { jobs, alerts, runtimeMode, saveStatus, saveError, realtimeStatus, realtimeError, planAccess, userId } = useWorkspace();
  const [alertOpen, setAlertOpen] = useState(false);
  const alertButtonRef = useRef<HTMLButtonElement>(null);
  const alertPopoverRef = useRef<HTMLElement>(null);
  const activeJobs = jobs.filter((job) => job.status === "active").length;
  const [currentPage, currentPageDescription] = pageContext(pathname);
  const feedbackFormUrl = getPublicEnvironmentValue("NEXT_PUBLIC_FEEDBACK_FORM_URL")?.trim();
  const betaSurveyDue = planAccess.betaExpired || (
    planAccess.source === "beta"
    && planAccess.remainingDays <= BETA_GRANT_DAYS - BETA_SURVEY_START_DAY
  );
  // 팝업은 이용권이 끝난 계정에만 판정한다. 기록은 계정별(로그인 모드는 계정 id가 잡힌 뒤, 로컬 모드는 이 기기 하나)로 나눈다.
  const surveyAccountKey = runtimeMode === "hosted" ? userId : "local";
  const surveyPromptAccount = planAccess.betaExpired && feedbackFormUrl && surveyAccountKey ? surveyAccountKey : null;
  const [surveyPrompt, setSurveyPrompt] = useState<{ account: string; open: boolean; answered: boolean } | null>(null);
  const currentSurveyPrompt = surveyPrompt && surveyPrompt.account === surveyPromptAccount ? surveyPrompt : null;
  // 판정 전·팝업이 떠 있는 동안·설문을 열었거나 다시 보지 않기로 한 뒤에는 띠를 숨긴다.
  const surveyBannerHidden = surveyPromptAccount !== null
    && (currentSurveyPrompt === null || currentSurveyPrompt.open || currentSurveyPrompt.answered);

  useEffect(() => {
    if (!surveyPromptAccount) return;
    let cancelled = false;
    // 서버 렌더와 어긋나지 않게 화면이 준비된 뒤 이 브라우저의 기록으로 판정한다.
    // 효과가 두 번 도는 개발 모드에서도 '이번 방문에 한 번'이 먼저 소모되지 않게 마지막 판정만 쓴다.
    queueMicrotask(() => {
      if (cancelled) return;
      const loaded = loadBetaSurveyPrompt(browserStorage(), surveyPromptAccount, betaSurveyPromptMemory);
      const open = shouldShowBetaSurveyPrompt({ eligible: true, ...loaded, now: new Date() });
      if (open && !loaded.storageAvailable) markBetaSurveyPromptShown(surveyPromptAccount, loaded.record, betaSurveyPromptMemory);
      setSurveyPrompt({ account: surveyPromptAccount, open, answered: betaSurveyPromptAnswered(loaded.record) });
    });
    return () => {
      cancelled = true;
    };
  }, [surveyPromptAccount]);

  const chooseSurveyPrompt = useCallback((choice: BetaSurveyPromptChoice) => {
    if (!surveyPromptAccount) return;
    const storage = browserStorage();
    const { record } = loadBetaSurveyPrompt(storage, surveyPromptAccount, betaSurveyPromptMemory);
    const next = nextBetaSurveyPromptRecord(record, choice, new Date());
    saveBetaSurveyPrompt(storage, surveyPromptAccount, next, betaSurveyPromptMemory);
    setSurveyPrompt({ account: surveyPromptAccount, open: false, answered: betaSurveyPromptAnswered(next) });
  }, [surveyPromptAccount]);

  useEffect(() => {
    if (!alertOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAlertOpen(false);
        alertButtonRef.current?.focus();
      }
    };
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!alertPopoverRef.current?.contains(target) && !alertButtonRef.current?.contains(target)) {
        setAlertOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutside);
    };
  }, [alertOpen]);

  return (
    <div className="appFrame">
      <aside className="desktopSidebar">
        <div className="sidebarTop">
          <Brand />
        </div>

        {/* 어느 화면에서든 두 번째 주문을 바로 넣을 수 있게 사이드바 맨 위에 고정한다. */}
        <Link
          href="/jobs/new"
          className="primaryButton sidebarCreateButton"
          aria-current={pathname.startsWith("/jobs/new") ? "page" : undefined}
          data-testid="sidebar-create-job"
        >
          <Plus size={18} strokeWidth={2.5} />
          <span>새 일감</span>
        </Link>

        <nav className="sideNav" aria-label="주요 메뉴">
          {primaryNavigation.map(({ href, label, icon: Icon }) => {
            const current = isCurrent(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className="sideNavItem"
                data-active={current}
                aria-current={current ? "page" : undefined}
              >
                <Icon size={19} strokeWidth={2} />
                <span>{label}</span>
                {label === "일감" && <span className="navCount">{activeJobs}</span>}
              </Link>
            );
          })}

          <div className="navDivider" aria-hidden="true" />
          {supportNavigation.map(({ href, label, icon: Icon }) => {
            const current = isCurrent(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className="sideNavItem"
                data-active={current}
                aria-current={current ? "page" : undefined}
              >
                <Icon size={19} strokeWidth={2} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebarBottom">
          <div className="localModeNotice">
            <span className="statusDot" aria-hidden="true" />
            <div>
              <strong>{runtimeMode === "hosted" ? "계정에 자동 저장" : "이 기기에 자동 저장"}</strong>
              <span title={realtimeError ?? undefined}>{runtimeMode === "hosted"
                ? realtimeStatus === "connected"
                  ? "실시간 연결됨"
                  : realtimeStatus === "error"
                    ? "실시간 연결 확인 필요"
                    : "실시간 연결 중"
                : "이 브라우저에만 저장돼요"}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="workspaceColumn">
        <header className="workspaceTopbar">
          <div className="mobileBrand">
            <Brand />
          </div>
          <div className="topbarContext">
            <strong>{currentPage}</strong>
            <span>{currentPageDescription}</span>
          </div>
          <div className="topbarActions">
            <span className="saveState" data-status={saveStatus} title={saveError ?? undefined}>
              <span className="statusDot" aria-hidden="true" />
              {saveStatus === "saving" ? "저장 중" : saveStatus === "error" ? "저장 실패" : "저장됨"}
            </span>
            <button
              type="button"
              className="iconButton"
              aria-label="알림 열기"
              aria-expanded={alertOpen}
              aria-controls="workspace-alerts"
              ref={alertButtonRef}
              onClick={() => setAlertOpen((open) => !open)}
              data-testid="open-alerts"
            >
              <Bell size={19} />
              {alerts.length > 0 && <span className="notificationDot" aria-hidden="true" />}
            </button>
            <ProfileMenu />
          </div>
          {alertOpen && (
            <section className="alertPopover" id="workspace-alerts" ref={alertPopoverRef} aria-label="현재 알림">
              <div className="alertPopoverHead">
                <div><strong>알림</strong></div>
                <Link href="/settings" onClick={() => setAlertOpen(false)}>알림 설정</Link>
              </div>
              {alerts.length ? (
                <div className="alertPopoverList">
                  {alerts.slice(0, 5).map((alert) => (
                    <Link key={alert.id} href={alert.jobId ? `/jobs/${alert.jobId}` : "/today"} className="alertPopoverItem" data-severity={alert.severity} onClick={() => setAlertOpen(false)}>
                      <BellRing size={15} />
                      <div><span>{alertKindLabel(alert.kind)}</span><strong>{alert.title}</strong><p>{alert.message}</p></div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="alertPopoverEmpty">지금 확인할 알림이 없어요.</p>
              )}
            </section>
          )}
        </header>

        {runtimeMode === "hosted" && realtimeStatus === "error" && (
          <div className="mobileRuntimeAlert" role="alert" aria-live="polite" title={realtimeError ?? undefined}>
            <div>
              <strong>실시간 연결이 끊겼어요</strong>
              <span>새 수정 요청 자동 반영이 멈췄을 수 있어요.</span>
            </div>
            <Link href="/settings">연결 확인</Link>
          </div>
        )}

        {betaSurveyDue && feedbackFormUrl && !surveyBannerHidden && (
          <aside className="betaSurveyBanner" aria-labelledby="beta-survey-title">
            <div>
              <strong id="beta-survey-title">써 보니 어떠셨나요?</strong>
              <span>아쉬웠던 점과 가격 의견을 짧게 남겨주세요.</span>
            </div>
            <a href={feedbackFormUrl} target="_blank" rel="noopener noreferrer">설문 작성하기</a>
          </aside>
        )}

        <main className="workspaceMain">{children}</main>
      </div>

      <nav className="mobileBottomNav" aria-label="모바일 주요 메뉴">
        {primaryNavigation.slice(0, 2).map(({ href, label, icon: Icon }) => {
          const current = isCurrent(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className="bottomNavItem"
              data-active={current}
              aria-current={current ? "page" : undefined}
            >
              <Icon size={21} />
              <span>{label}</span>
            </Link>
          );
        })}
        <Link href="/jobs/new" className="mobileCreateNav" aria-label="새 일감 만들기">
          <span><Plus size={21} strokeWidth={2.5} /></span>
          새 일감
        </Link>
        {primaryNavigation.slice(2).map(({ href, label, icon: Icon }) => {
          const current = isCurrent(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className="bottomNavItem"
              data-active={current}
              aria-current={current ? "page" : undefined}
            >
              <Icon size={21} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {currentSurveyPrompt?.open && feedbackFormUrl && (
        <BetaSurveyDialog formUrl={feedbackFormUrl} onChoose={chooseSurveyPrompt} />
      )}
    </div>
  );
}
