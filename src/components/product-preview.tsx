"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Clock3,
  Coins,
  Link2,
  ListChecks,
  MessageCircle,
  MessageSquareText,
  MousePointer2,
  Package,
  RotateCcw,
  SlidersHorizontal,
  Users,
} from "lucide-react";

// Hero motion should support reading the scene, not compete with it.
const AUTO_MS = 2800;

function SceneSidebar({ active }: { active: "오늘" | "일감" | "패키지" }) {
  const items: Array<"오늘" | "일감" | "패키지"> = ["오늘", "일감", "패키지"];
  return (
    <aside className="sceneSidebar" aria-hidden="true">
      <span className="miniBrandMark">
        <Check size={13} />
      </span>
      {items.map((item) => (
        <span key={item} className={item === active ? "sceneNav active" : "sceneNav"}>
          {item}
        </span>
      ))}
    </aside>
  );
}

function Scene({
  title,
  live,
  active,
  children,
}: {
  title: string;
  live: string;
  active: "오늘" | "일감" | "패키지";
  children: ReactNode;
}) {
  return (
    <div className="productScene">
      <div className="productSceneBar">
        <span className="sceneDots" aria-hidden="true" />
        <span>{title}</span>
        <span className="sceneLive">
          <i /> {live}
        </span>
      </div>
      <div className="productSceneBody">
        <SceneSidebar active={active} />
        <div className="sceneWorkspace">{children}</div>
      </div>
    </div>
  );
}

type Slide = { key: string; caption: string; render: () => ReactNode };

const slides: Slide[] = [
  {
    key: "today",
    caption: "앱을 열면 마감과 고객 대기를 먼저 정리해서 보여줘요",
    render: () => (
      <Scene title="오늘의 작업대" live="자동 정리됨" active="오늘">
        <div className="sceneHeading">
          <div>
            <span>8월 15일 토요일</span>
            <strong>오늘은 4가지만 끝내면 돼요.</strong>
          </div>
          <span className="sceneAdd">
            <MousePointer2 size={15} /> 새 일감
          </span>
        </div>
        <div className="sceneBrief">
          <span>
            <Clock3 size={15} /> 오늘 4
          </span>
          <span>
            <MessageSquareText size={15} /> 고객 대기 1
          </span>
          <span>
            <RotateCcw size={15} /> 수정 임박 1
          </span>
        </div>
        <div className="sceneQueue">
          <div className="sceneTask urgent">
            <span className="sceneCheck" />
            <div>
              <small>담다상점 · 1일 지연</small>
              <strong>결제·배송 최종 테스트</strong>
            </div>
            <span className="sceneAction">완료</span>
          </div>
          <div className="sceneTask">
            <span className="sceneCheck" />
            <div>
              <small>오로라 스튜디오 · D-1</small>
              <strong>메인 카피 반영</strong>
            </div>
            <span className="sceneMeta">수정 1회 남음</span>
          </div>
          <div className="sceneTask waiting">
            <MessageSquareText size={17} />
            <div>
              <small>모로우 베이크 · 2일째</small>
              <strong>브랜드 자료 기다리는 중</strong>
            </div>
            <span className="sceneMeta">답변 대기</span>
          </div>
        </div>
      </Scene>
    ),
  },
  {
    key: "compose",
    caption: "네 가지만 고르면 금액과 마감, 체크리스트가 만들어져요",
    render: () => (
      <Scene title="새 일감 만들기" live="30초면 끝" active="일감">
        <div className="sceneHeading">
          <div>
            <span>새 일감</span>
            <strong>네 가지만 고르면 끝나요.</strong>
          </div>
          <span className="sceneAdd">
            <MousePointer2 size={15} /> 딸깍 저장
          </span>
        </div>
        <div className="ppComposer">
          <div className="ppSteps">
            <span className="ppStep done">
              <Users size={15} />
              <div>
                <small>고객</small>
                <strong>오로라 스튜디오</strong>
              </div>
              <span className="ppStepState">선택됨</span>
            </span>
            <span className="ppStep done">
              <CalendarDays size={15} />
              <div>
                <small>시작일</small>
                <strong>8월 18일</strong>
              </div>
              <span className="ppStepState">선택됨</span>
            </span>
            <span className="ppStep done">
              <Package size={15} />
              <div>
                <small>패키지</small>
                <strong>Deluxe</strong>
              </div>
              <span className="ppStepState">선택됨</span>
            </span>
            <span className="ppStep active">
              <SlidersHorizontal size={15} />
              <div>
                <small>옵션</small>
                <strong>2개 선택 중</strong>
              </div>
              <span className="ppStepState">선택 중</span>
            </span>
          </div>
          <div className="ppAuto">
            <span className="ppAutoTag">자동 미리보기</span>
            <ul>
              <li>
                <span>
                  <Coins size={13} /> 계약 금액
                </span>
                <strong>1,320,000원</strong>
              </li>
              <li>
                <span>
                  <CalendarClock size={13} /> 자동 마감
                </span>
                <strong>9월 2일</strong>
              </li>
              <li>
                <span>
                  <RotateCcw size={13} /> 수정 한도
                </span>
                <strong>3회</strong>
              </li>
            </ul>
            <div className="ppChecklist">
              <small>
                <ListChecks size={12} /> 생성될 체크리스트
              </small>
              <p>
                <CheckSquare size={14} /> 킥오프 미팅
              </p>
              <p>
                <CheckSquare size={14} /> 1차 시안 공유
              </p>
              <p>
                <CheckSquare size={14} /> 최종 납품
              </p>
            </div>
          </div>
        </div>
      </Scene>
    ),
  },
  {
    key: "revision",
    caption: "링크든 메신저든 모든 수정 요청이 한 타임라인에 쌓여요",
    render: () => (
      <Scene title="수정 요청 기록" live="자동 카운트" active="일감">
        <div className="sceneHeading">
          <div>
            <span>오로라 스튜디오</span>
            <strong>수정 요청 타임라인</strong>
          </div>
          <span className="ppCounter">
            <b>2</b> / 3회
          </span>
        </div>
        <div className="ppTimeline">
          <div className="ppEvent auto">
            <span className="ppEventIcon">
              <Link2 size={15} />
            </span>
            <div>
              <small>고객 링크 · 어제 오후 4:12</small>
              <strong>메인 비주얼을 조금 더 밝게</strong>
            </div>
            <span className="ppEventTag">자동 −1</span>
          </div>
          <div className="ppEvent manual">
            <span className="ppEventIcon">
              <MessageCircle size={15} />
            </span>
            <div>
              <small>카카오톡 · 오늘 오전 9:40</small>
              <strong>회사소개 문구 교체</strong>
            </div>
            <span className="ppEventTag">수동 기록</span>
          </div>
        </div>
        <div className="ppRemain">
          <span>남은 수정</span>
          <strong>1회</strong>
          <span className="ppRemainBadge">초과 시 추가 작업</span>
        </div>
      </Scene>
    ),
  },
  {
    key: "packages",
    caption: "한 번 저장해두면 다음 주문부터는 고르기만 하면 돼요",
    render: () => (
      <Scene title="패키지·옵션 설정" live="저장됨" active="패키지">
        <div className="sceneHeading">
          <div>
            <span>내 패키지</span>
            <strong>금액·기간·수정 한도를 저장</strong>
          </div>
          <span className="sceneAdd">
            <Package size={15} /> 패키지 추가
          </span>
        </div>
        <div className="ppPackages">
          <div className="ppPackage">
            <div className="ppPackageTop">
              <strong>Standard</strong>
            </div>
            <dl>
              <dt>금액</dt>
              <dd>800,000원</dd>
              <dt>기간</dt>
              <dd>10일</dd>
              <dt>수정</dt>
              <dd>2회</dd>
            </dl>
          </div>
          <div className="ppPackage pick">
            <div className="ppPackageTop">
              <strong>Deluxe</strong>
              <span className="ppPackageTag">기본</span>
            </div>
            <dl>
              <dt>금액</dt>
              <dd>1,200,000원</dd>
              <dt>기간</dt>
              <dd>15일</dd>
              <dt>수정</dt>
              <dd>3회</dd>
            </dl>
          </div>
        </div>
        <div className="ppOptions">
          <small>옵션</small>
          <div className="ppOption">
            <p>반응형 모바일 최적화</p>
            <em>+5일</em>
            <span className="ppOptionDelta">+120,000원 · 수정 +1</span>
          </div>
          <div className="ppOption">
            <p>서브 페이지 1종 추가</p>
            <em>+3일</em>
            <span className="ppOptionDelta">+90,000원</span>
          </div>
        </div>
      </Scene>
    ),
  },
  {
    key: "alerts",
    caption: "마감 이틀 전, 하루 전을 앱에서 미리 알려줘요",
    render: () => (
      <Scene title="마감 알림" live="인앱 알림" active="오늘">
        <div className="sceneHeading">
          <div>
            <span>다가오는 마감</span>
            <strong>미리 알려드릴게요.</strong>
          </div>
          <span className="sceneAdd">
            <BellRing size={15} /> 모두 읽음
          </span>
        </div>
        <div className="ppAlerts">
          <div className="ppAlert soon">
            <span className="ppAlertIcon">
              <AlertTriangle size={16} />
            </span>
            <div>
              <small>담다상점 · 홈페이지</small>
              <strong>마감 하루 전</strong>
            </div>
            <span className="ppAlertMeta">D-1</span>
          </div>
          <div className="ppAlert">
            <span className="ppAlertIcon">
              <Clock3 size={16} />
            </span>
            <div>
              <small>오로라 스튜디오 · 리뉴얼</small>
              <strong>마감 이틀 전</strong>
            </div>
            <span className="ppAlertMeta">D-2</span>
          </div>
          <div className="ppAlert">
            <span className="ppAlertIcon">
              <MessageSquareText size={16} />
            </span>
            <div>
              <small>모로우 베이크 · 대기 중</small>
              <strong>고객 자료 3일째 대기</strong>
            </div>
            <span className="ppAlertMeta">확인</span>
          </div>
        </div>
      </Scene>
    ),
  },
];

// 표시 순서: 작업 흐름대로 — 패키지 설정 → 새 일감 딸깍 → 오늘 작업대 → 수정 요청 → 마감 알림
const SLIDE_ORDER = ["packages", "compose", "today", "revision", "alerts"] as const;
const orderedSlides: Slide[] = SLIDE_ORDER.map(
  (key) => slides.find((slide) => slide.key === key) as Slide,
);

export function ProductPreview() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Bumped on manual navigation to restart the auto-advance timer.
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % orderedSlides.length);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [paused, epoch]);

  const goTo = (next: number) => {
    setIndex((next + orderedSlides.length) % orderedSlides.length);
    setEpoch((value) => value + 1);
  };

  return (
    <div
      className="previewCarousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="previewViewport" role="group" aria-label="일감체크 화면 미리보기">
        <div className="previewTrack" style={{ transform: `translateX(-${index * 100}%)` }}>
          {orderedSlides.map((slide, i) => (
            <article
              key={slide.key}
              className="previewSlide"
              aria-hidden={i !== index}
            >
              {slide.render()}
            </article>
          ))}
        </div>
        <button
          type="button"
          className="previewArrow prev"
          aria-label="이전 미리보기"
          onClick={() => goTo(index - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          className="previewArrow next"
          aria-label="다음 미리보기"
          onClick={() => goTo(index + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="previewControls">
        <p className="previewCaption" aria-live="polite">
          <b>
            {index + 1}/{orderedSlides.length}
          </b>{" "}
          · {orderedSlides[index].caption}
        </p>
        <div className="previewDots">
          {orderedSlides.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              className="previewDot"
              data-active={i === index}
              aria-label={`${i + 1}번째 미리보기`}
              aria-current={i === index}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
