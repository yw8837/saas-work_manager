"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronDown, MousePointerClick } from "lucide-react";
import { useCallback, useEffect, useRef, useSyncExternalStore, type TouchEvent } from "react";

import "@/styles/guide-demo.css";
import { SIGNUP_START_HREF } from "@/lib/signup-start";
import { Brand } from "./brand";
import { GuideDemo, type GuideDemoSpec } from "./guide-demo";
import { GUIDE_DEMOS } from "./guide-demo-screens";
import { SignupOffer } from "./signup-offer";

/**
 * 설명서 한 단계. 짧은 제목 한 줄 + 설명 한 줄 + 저절로 움직이는 시연 하나. 더 긴 글은 '자세히' 접기에만 둔다.
 * 첫 단계(흐름도)는 흐름도 칸에 차례로 불이 들어오는 시연이다.
 */
export type GuideStep = {
  id: string;
  /** 무기 3개(+더 편하게) 중 어느 장인지. 제목 위에 작게 보인다. */
  chapter?: string;
  title: string;
  caption: string;
  detail?: string;
  /** 화면 모형과 장면 목록(guide-demo-screens.tsx). 한 재생기(guide-demo.tsx)가 돌린다. */
  demo: GuideDemoSpec;
};

/**
 * 시연은 예시 데이터(src/lib/demo/sample-order.ts의 패키지·옵션 값)로 그린 화면 모형이다. 동영상·움직이는 그림 파일은 쓰지 않는다.
 * 실제 계정·고객 정보는 들어가지 않는다. 실제 화면 문구가 바뀌면 guide-demo-screens.tsx의 모형도 같이 고친다.
 * (예전 정지 캡처 public/guide/*.webp 중 셋은 첫 실행 안내가 그대로 쓴다.)
 */
export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "flow",
    title: "주문 하나가 끝나기까지",
    caption: "누가 할 일인지, 무엇이 자동인지 먼저 봐요.",
    demo: GUIDE_DEMOS.flow,
  },
  {
    id: "signup",
    title: "Google 계정으로 가입해요",
    caption: "처음이면 약관에 동의하고, 내 작업공간이 열려요.",
    demo: GUIDE_DEMOS.signup,
  },
  {
    id: "packages",
    chapter: "주문 등록",
    title: "패키지는 한 번만 저장해요",
    caption: "금액·기간·수정 횟수에 받을 자료·질문까지 묶어 둬요.",
    demo: GUIDE_DEMOS.packages,
  },
  {
    id: "new-job",
    chapter: "주문 등록",
    title: "주문 오면 네 가지만 골라요",
    caption: "고객·시작일·패키지·옵션을 고르면 금액·마감이 채워져요.",
    detail: "할 일·수정 횟수도 함께 채워져요. 받은 곳은 비워 두고, 지난 주문의 받은 곳을 옆에 작게 알려 줘요.",
    demo: GUIDE_DEMOS["new-job"],
  },
  {
    id: "send-message",
    chapter: "시작 안내 한 방",
    title: "카톡 문구 하나만 복사해요",
    caption: "링크·받을 자료·질문이 한 문구에 들어 있어요.",
    detail: "평소 대화창에 붙여 보내요. 자동으로 보내지지는 않아요.",
    demo: GUIDE_DEMOS["send-message"],
  },
  {
    id: "check-answers",
    chapter: "시작 안내 한 방",
    title: "답·자료가 오면 체크해요",
    caption: "고객은 링크 없이 대화창으로 답해도 돼요.",
    detail: "체크한 것은 다음에 보낼 문구에서 빠져요.",
    demo: GUIDE_DEMOS["check-answers"],
  },
  {
    id: "revisions",
    chapter: "수정 범위 정리",
    title: "요청은 확인 대기로 들어와요",
    caption: "고친 뒤 '수정 완료'를 누를 때 1회를 써요.",
    detail: "질문·중복은 '반려', 범위 밖은 '추가 작업으로'를 눌러요. 둘 다 횟수를 안 써요.",
    demo: GUIDE_DEMOS.revisions,
  },
  {
    id: "addon",
    chapter: "수정 범위 정리",
    title: "범위 밖은 추가요청으로",
    caption: "초안으로 적어 두고, 고객이 동의하면 확정해요.",
    detail: "확정하면 금액·마감·할 일에 반영돼요.",
    demo: GUIDE_DEMOS.addon,
  },
  {
    id: "messages",
    chapter: "더 편하게",
    title: "상황별 문구를 골라 보내요",
    caption: "남은 것 요청·시안 확인·범위 밖 안내 등을 골라 복사해요.",
    detail: "금액·받은 곳은 문구에 넣지 않아요.",
    demo: GUIDE_DEMOS.messages,
  },
  {
    id: "monthly",
    chapter: "더 편하게",
    title: "달마다 매출을 모아 봐요",
    caption: "완료한 주문을 받은 곳별로 보고 표 파일로 받아요.",
    detail: "'일감 완료'를 누른 주문이 모여요. 세금 계산이나 신고는 하지 않아요.",
    demo: GUIDE_DEMOS.monthly,
  },
];

const TOTAL = GUIDE_STEPS.length;
const STEP_EVENT = "ilgamcheck:guide-step";
/** 이만큼 넘게 옆으로 밀고, 세로로 민 것보다 1.5배 넘게 옆으로 밀었을 때만 넘긴다(스크롤과 헷갈리지 않게). */
const SWIPE_MIN = 50;

/** 주소 `#step-3` → 3번째 단계(0부터 2). 없거나 범위 밖이면 첫 단계. */
export function stepIndexFromHash(hash: string): number {
  const match = /^#step-(\d{1,2})$/.exec(hash);
  if (!match) return 0;
  const number = Number(match[1]);
  return number >= 1 && number <= TOTAL ? number - 1 : 0;
}

function subscribeStep(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener(STEP_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(STEP_EVENT, onChange);
  };
}

const readStep = () => stepIndexFromHash(window.location.hash);
const serverStep = () => 0;

/** 주소만 바꾸고(기록을 쌓지 않음) 화면은 그 자리에서 바꾼다. 스크롤을 건드리지 않는다. */
function writeStep(index: number) {
  window.history.replaceState(window.history.state, "", `#step-${index + 1}`);
  window.dispatchEvent(new Event(STEP_EVENT));
}

export function UserGuide() {
  const index = useSyncExternalStore(subscribeStep, readStep, serverStep);
  const step = GUIDE_STEPS[index];
  const isFirst = index === 0;
  const isLast = index === TOTAL - 1;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const movedByUser = useRef(false);

  const go = useCallback((target: number) => {
    const clamped = Math.min(Math.max(target, 0), TOTAL - 1);
    if (clamped === readStep()) return;
    movedByUser.current = true;
    writeStep(clamped);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "ArrowRight") go(readStep() + 1);
      else if (event.key === "ArrowLeft") go(readStep() - 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // '다음'이 마지막 단계에서 '무료로 시작하기'로 바뀌면 누르던 버튼이 사라진다. 그때만 포커스를 새 제목으로 옮긴다(화면은 안 움직임).
  useEffect(() => {
    if (!movedByUser.current) return;
    movedByUser.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) titleRef.current?.focus({ preventScroll: true });
  }, [index]);

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(dx < 0 ? index + 1 : index - 1);
  };

  return (
    <div className="guidePage guideViewer">
      <header className="guideHeader">
        <Brand />
        {/* 처음 온 사람에게 '로그인'은 가입 버튼으로 안 읽혀서 눈에 띄는 시작 버튼을 따로 둔다. 휴대폰 폭에서는 고객 화면 체험을 접는다(마지막 단계에 있음). */}
        <nav aria-label="설명서 메뉴">
          <Link href="/demo/r" className="guideHeaderExtra">고객 화면 체험</Link>
          <Link href="/today" className="guideHeaderLogin" data-testid="guide-header-login">로그인</Link>
          <Link href={SIGNUP_START_HREF} className="guideHeaderStart" data-testid="guide-header-start">무료로 시작하기</Link>
        </nav>
      </header>

      <main className="guideMain guideViewerMain">
        <div className="guideProgress">
          <h1 className="guideProgressTitle">그림 설명서</h1>
          <p className="guideProgressCount" data-testid="guide-progress">
            <b>{index + 1}</b> / {TOTAL}
          </p>
          <div
            className="guideProgressBar"
            role="progressbar"
            aria-label="설명서 진행"
            aria-valuemin={1}
            aria-valuemax={TOTAL}
            aria-valuenow={index + 1}
            aria-valuetext={`${TOTAL}단계 중 ${index + 1}단계`}
          >
            {GUIDE_STEPS.map((item, dot) => (
              <span key={item.id} data-state={dot < index ? "done" : dot === index ? "current" : "todo"} />
            ))}
          </div>
        </div>

        {/* 바뀐 단계를 낭독기에 알린다. 포커스는 누르던 버튼에 그대로 둔다. */}
        <p className="srOnly" role="status" aria-live="polite" data-testid="guide-live">
          {`${index + 1}/${TOTAL} 단계, ${step.title}`}
        </p>

        <section
          key={step.id}
          className="guideStage"
          data-kind={step.demo.alt ? "shot" : "flow"}
          data-step={index + 1}
          aria-labelledby="guide-step-title"
          data-testid="guide-step"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="guideStageText">
            {step.chapter && <p className="guideStageChapter">{step.chapter}</p>}
            <h2 id="guide-step-title" ref={titleRef} tabIndex={-1} data-testid="guide-step-title">{step.title}</h2>
            <p className="guideStageCaption">{step.caption}</p>
            {isFirst && (
              <Link href="/try" className="guideTryLink" data-testid="guide-try">가입 없이 둘러보기</Link>
            )}
            {step.detail && (
              <details className="guideDetail">
                {/* 낭독기에는 단계 제목을 붙여 어떤 '자세히'인지 알린다. 보이는 글은 '자세히' 그대로다. */}
                <summary>자세히<span className="srOnly">, {step.title}</span> <ChevronDown size={15} aria-hidden="true" /></summary>
                <p>{step.detail}</p>
              </details>
            )}
          </div>

          {/* 단계가 바뀌면 구획을 새로 그리므로(key) 시연도 첫 장면부터 다시 돈다. 다음 단계로 저절로 넘기지는 않는다. */}
          <GuideDemo spec={step.demo} label={`시연: ${step.title}`} />

          {isLast && (
            <div className="guideFinish">
              {/* 구현된 것과 아직 안 되는 것을 섞지 않는다. 기준: docs/design/revision-count-and-customer-link.md */}
              <section className="guideOutro" aria-labelledby="guide-not-yet-title" data-testid="guide-not-yet">
                <h3 id="guide-not-yet-title">아직 안 되는 것</h3>
                <p>플랫폼·메신저의 주문과 대화를 자동으로 가져오지 않아요. 주문은 직접 등록하고 링크도 직접 보내요. 고객에게 자동으로 답장하지 않고, 고객이 결과를 확인한 뒤에 차감하는 방식과 웹에서 새 요청 알림도 아직 준비 전이에요.</p>
              </section>
              {/* 아래 '무료로 시작하기' 바로 위에 베타 코드·무료 범위를 둔다(네 공개 화면 같은 문장). */}
              <SignupOffer testId="guide-offer" className="guideOffer" />
            </div>
          )}
        </section>

        {/* 휴대폰은 엄지가 닿는 화면 아래에 붙여 둔다. 주 버튼(파랑)은 '다음' 하나, 마지막에는 '무료로 시작하기' 하나. */}
        <nav className="guideStepNav" data-last={isLast || undefined} aria-label="단계 이동">
          {/* 마지막 단계에서는 두 행동(체험·시작)이 그림 아래로 밀리지 않게 버튼 줄에 같이 둔다. 체험은 보조 버튼. */}
          {isLast && (
            <Link href="/demo/r" className="secondaryButton guideDemoLink" data-testid="guide-demo-link">
              <MousePointerClick size={18} aria-hidden="true" /> 고객이 받는 화면 체험
            </Link>
          )}
          <button
            type="button"
            className="guidePrevButton"
            aria-disabled={isFirst}
            onClick={() => go(index - 1)}
            data-testid="guide-prev"
          >
            <ArrowLeft size={18} aria-hidden="true" /> 이전
          </button>
          {isLast ? (
            <Link href={SIGNUP_START_HREF} className="primaryButton guideNextButton" data-testid="guide-start">
              무료로 시작하기 <ArrowRight size={18} aria-hidden="true" />
            </Link>
          ) : (
            <button type="button" className="primaryButton guideNextButton" onClick={() => go(index + 1)} data-testid="guide-next">
              다음 <ArrowRight size={18} aria-hidden="true" />
            </button>
          )}
        </nav>
      </main>

      <footer className="guideFooter">
        <Link href="/">일감체크 소개</Link>
        <Link href="/examples" data-testid="guide-examples">업종별 예시 패키지</Link>
        <Link href="/terms">이용약관</Link>
        <Link href="/privacy">개인정보처리방침</Link>
      </footer>
    </div>
  );
}
