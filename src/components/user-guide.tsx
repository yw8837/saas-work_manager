"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronDown, MousePointerClick } from "lucide-react";
import { useCallback, useEffect, useRef, useSyncExternalStore, type TouchEvent } from "react";

import { Brand } from "./brand";
import { WorkFlowChart } from "./work-flow-chart";

/**
 * 설명서 한 단계. 짧은 제목 한 줄 + 설명 한 줄 + 그림 하나. 더 긴 글은 '자세히' 접기에만 둔다.
 * 첫 단계(흐름도)만 그림 대신 흐름도 요약을 보인다.
 */
export type GuideStep = {
  id: string;
  /** 무기 3개(+더 편하게) 중 어느 장인지. 제목 위에 작게 보인다. */
  chapter?: string;
  title: string;
  caption: string;
  detail?: string;
  image?: { src: string; alt: string; width: number; height: number };
};

/**
 * 그림은 e2e/capture/guide-screens.capture.ts가 로컬 모드 예시 데이터(src/lib/demo/sample-order.ts 기반)로 찍고,
 * 누를 곳에 주황 테두리와 번호 동그라미를 그려 넣는다. 실제 계정·고객 정보는 들어가지 않는다.
 * 휴대폰 한 화면에 들어가게 필요한 부분만 잘라(가운데를 건너뛴 곳은 물결 띠로 표시) 750px 폭·1100px 이하 높이로 저장한다.
 * 화면이 바뀌면 그 스펙을 다시 돌려 그림을 갱신하고 아래 width·height를 찍힌 크기로 맞춘다.
 */
export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "flow",
    title: "주문 하나가 끝나기까지",
    caption: "누가 할 일인지, 무엇이 자동인지 먼저 봐요.",
  },
  {
    id: "signup",
    title: "Google 계정으로 가입해요",
    caption: "누르면 바로 내 작업공간이 열려요.",
    image: { src: "/guide/01-signup.webp", alt: "Google로 계속하기 버튼에 1번 표시가 있는 로그인 화면", width: 750, height: 388 },
  },
  {
    id: "packages",
    chapter: "주문 30초 등록",
    title: "패키지는 한 번만 저장해요",
    caption: "금액·기간·수정 횟수에 받을 자료·질문까지 묶어 둬요.",
    image: { src: "/guide/02-packages.webp", alt: "패키지 편집 화면. 받을 자료 칸에 1번, 착수 전 질문 칸에 2번, 패키지 저장 버튼에 3번 표시", width: 750, height: 722 },
  },
  {
    id: "new-job",
    chapter: "주문 30초 등록",
    title: "주문 오면 네 가지만 골라요",
    caption: "고객·시작일·패키지·옵션을 고르면 금액·마감이 채워져요.",
    detail: "할 일·수정 횟수도 함께 채워져요. 받은 곳은 비워 두고, 지난 주문의 받은 곳을 옆에 작게 알려 줘요.",
    image: { src: "/guide/03-new-job.webp", alt: "새 일감 화면. 고객 이름·시작일·패키지·옵션에 1~4번, 아래 일감 만들기 버튼에 5번 표시. 받은 곳은 크몽이 골라져 있음", width: 750, height: 970 },
  },
  {
    id: "send-message",
    chapter: "시작 안내 한 방",
    title: "카톡 문구 하나만 복사해요",
    caption: "링크·받을 자료·질문이 한 문구에 들어 있어요.",
    detail: "평소 대화창에 붙여 보내요. 자동으로 보내지지는 않아요.",
    image: { src: "/guide/04-send-message.webp", alt: "일감을 저장한 직후 안내. 카톡 문구 복사 버튼에 1번 표시, 아래 말풍선에 받을 자료와 질문이 든 보낼 문구", width: 750, height: 840 },
  },
  {
    id: "check-answers",
    chapter: "시작 안내 한 방",
    title: "답·자료가 오면 체크해요",
    caption: "고객은 링크 없이 대화창으로 답해도 돼요.",
    detail: "체크한 것은 다음에 보낼 문구에서 빠져요.",
    image: { src: "/guide/05-checklist.webp", alt: "시작 전 받을 자료와 착수 전 질문 목록. 아직 안 받은 자료에 1번, 답을 못 받은 질문에 2번 표시", width: 750, height: 992 },
  },
  {
    id: "revisions",
    chapter: "수정 범위 정리",
    title: "요청은 확인 대기로 들어와요",
    caption: "고친 뒤 '수정 완료'를 누를 때 1회를 써요.",
    detail: "질문·중복은 '반려', 범위 밖은 '추가 작업으로'를 눌러요. 둘 다 횟수를 안 써요.",
    image: { src: "/guide/06-revisions.webp", alt: "수정 요청 기록. 확인 대기 요청의 수정 완료 버튼에 1번 표시, 아래에 1회차로 센 요청", width: 750, height: 926 },
  },
  {
    id: "addon",
    chapter: "수정 범위 정리",
    title: "범위 밖은 추가요청으로",
    caption: "초안으로 적어 두고, 고객이 동의하면 확정해요.",
    detail: "확정하면 금액·마감·할 일에 반영돼요.",
    image: { src: "/guide/07-addon.webp", alt: "추가요청 구획. 추가요청 기록 버튼에 1번, 초안의 확정 버튼에 2번 표시", width: 750, height: 578 },
  },
  {
    id: "messages",
    chapter: "더 편하게",
    title: "상황별 문구를 골라 보내요",
    caption: "남은 것 요청·시안 확인·범위 밖 안내 등을 골라 복사해요.",
    detail: "금액·받은 곳은 문구에 넣지 않아요.",
    image: { src: "/guide/08-messages.webp", alt: "고객에게 보낼 말 구획. 시안 확인 부탁 칩에 1번, 문구 복사 버튼에 2번 표시", width: 750, height: 792 },
  },
  {
    id: "monthly",
    chapter: "더 편하게",
    title: "달마다 매출을 모아 봐요",
    caption: "완료한 주문을 받은 곳별로 보고 표 파일로 받아요.",
    detail: "'일감 완료'를 누른 주문이 모여요. 세금 계산이나 신고는 하지 않아요.",
    image: { src: "/guide/09-monthly.webp", alt: "월별 정리 화면. 10월 내려받기 버튼에 1번 표시, 아래에 받은 곳별 합계", width: 750, height: 872 },
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

  // 앞뒤 단계 그림을 미리 받아 두어 넘길 때 빈 칸이 보이지 않게 한다.
  useEffect(() => {
    for (const near of [GUIDE_STEPS[index + 1], GUIDE_STEPS[index - 1]]) {
      if (!near?.image) continue;
      const preload = new Image();
      preload.decoding = "async";
      preload.src = near.image.src;
    }
  }, [index]);

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
        <nav aria-label="설명서 메뉴">
          <Link href="/demo/r">고객 화면 체험</Link>
          <Link href="/today">로그인</Link>
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
          data-kind={step.image ? "shot" : "flow"}
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
            {step.detail && (
              <details className="guideDetail">
                {/* 낭독기에는 단계 제목을 붙여 어떤 '자세히'인지 알린다. 보이는 글은 '자세히' 그대로다. */}
                <summary>자세히<span className="srOnly">, {step.title}</span> <ChevronDown size={15} aria-hidden="true" /></summary>
                <p>{step.detail}</p>
              </details>
            )}
          </div>

          {step.image ? (
            <figure className="guideStageShot">
              {/* 정적 캡처라 next/image 최적화 없이 그대로 쓴다. Sites(vite) 빌드도 같은 경로를 쓴다. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={step.image.src} alt={step.image.alt} width={step.image.width} height={step.image.height} decoding="async" />
            </figure>
          ) : (
            <WorkFlowChart headingId="guide-step-title" showHeading={false} compact />
          )}

          {isLast && (
            <div className="guideFinish">
              {/* 구현된 것과 아직 안 되는 것을 섞지 않는다. 기준: docs/design/revision-count-and-customer-link.md */}
              <section className="guideOutro" aria-labelledby="guide-not-yet-title" data-testid="guide-not-yet">
                <h3 id="guide-not-yet-title">아직 안 되는 것</h3>
                <p>플랫폼·메신저의 주문과 대화를 자동으로 가져오지 않아요. 주문은 직접 등록하고 링크도 직접 보내요. 고객에게 자동으로 답장하지 않고, 고객이 결과를 확인한 뒤에 차감하는 방식과 웹에서 새 요청 알림도 아직 준비 전이에요.</p>
              </section>
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
            <Link href="/today" className="primaryButton guideNextButton" data-testid="guide-start">
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
