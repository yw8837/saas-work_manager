import Link from "next/link";
import { ArrowRight, ChevronDown, MousePointerClick } from "lucide-react";

import { Brand } from "./brand";
import { WorkFlowChart } from "./work-flow-chart";

/** 그림 한 장. 그림이 먼저, 아래에 제목 한 줄·설명 한 줄. 더 긴 글은 '자세히' 접기에만 둔다. */
export type GuideShot = {
  id: string;
  title: string;
  caption: string;
  detail?: string;
  image: { src: string; alt: string; width: number; height: number };
};

/** 무기 3개(+더 편하게) 순서의 장. '직접 해 보기'는 장마다 하나. 작업공간 화면은 로그인 뒤에 열린다. */
export type GuideChapter = {
  id: string;
  title: string;
  tryIt: { href: string; label: string };
  shots: GuideShot[];
};

/**
 * 그림은 e2e/capture/guide-screens.capture.ts가 로컬 모드 예시 데이터(src/lib/demo/sample-order.ts 기반)로 찍고,
 * 누를 곳에 흑연색 테두리와 번호 동그라미를 그려 넣는다. 실제 계정·고객 정보는 들어가지 않는다.
 * 화면이 바뀌면 그 스펙을 다시 돌려 그림을 갱신한다.
 */
export const GUIDE_SIGNUP: GuideShot = {
  id: "signup",
  title: "Google 계정으로 가입해요",
  caption: "누르면 바로 내 작업공간이 열려요.",
  image: { src: "/guide/01-signup.webp", alt: "Google로 계속하기 버튼에 1번 표시가 있는 로그인 화면", width: 750, height: 386 },
};

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    id: "order",
    title: "주문 30초 등록",
    tryIt: { href: "/jobs/new", label: "새 일감 만들기" },
    shots: [
      {
        id: "packages",
        title: "패키지는 한 번만 저장해요",
        caption: "금액·기간·수정 횟수에 받을 자료·질문까지 묶어 둬요.",
        image: { src: "/guide/02-packages.webp", alt: "패키지 편집 화면. 받을 자료 칸에 1번, 착수 전 질문 칸에 2번, 패키지 저장 버튼에 3번 표시", width: 750, height: 1304 },
      },
      {
        id: "new-job",
        title: "주문이 오면 네 가지만 골라요",
        caption: "고객·시작일·패키지·옵션을 고르면 금액·마감·할 일이 채워져요.",
        detail: "받은 곳은 지난 주문 것이 먼저 골라져 있어요.",
        image: { src: "/guide/03-new-job.webp", alt: "새 일감 화면. 고객 이름·시작일·패키지·옵션에 1~4번, 아래 일감 만들기 버튼에 5번 표시. 받은 곳은 크몽이 골라져 있음", width: 750, height: 2544 },
      },
    ],
  },
  {
    id: "start",
    title: "시작 안내 한 방",
    tryIt: { href: "/demo/r", label: "고객이 받는 화면" },
    shots: [
      {
        id: "send-message",
        title: "카톡 문구 하나만 복사해요",
        caption: "링크·받을 자료·질문이 한 문구에 들어 있어요.",
        detail: "평소 대화창에 붙여 보내요. 자동으로 보내지지는 않아요.",
        image: { src: "/guide/04-send-message.webp", alt: "일감을 저장한 직후 안내. 카톡 문구 복사 버튼에 1번 표시, 아래 말풍선에 받을 자료와 질문이 든 보낼 문구", width: 750, height: 824 },
      },
      {
        id: "check-answers",
        title: "답·자료가 오면 체크해요",
        caption: "고객은 링크 없이 대화창으로 답해도 돼요.",
        detail: "체크한 것은 다음에 보낼 문구에서 빠져요.",
        image: { src: "/guide/05-checklist.webp", alt: "시작 전 받을 자료와 착수 전 질문 목록. 아직 안 받은 자료에 1번, 답을 못 받은 질문에 2번 표시", width: 750, height: 1400 },
      },
    ],
  },
  {
    id: "scope",
    title: "수정 범위 정리",
    tryIt: { href: "/jobs", label: "내 일감 열기" },
    shots: [
      {
        id: "revisions",
        title: "요청은 확인 대기로 들어와요",
        caption: "고친 뒤 '수정 완료'를 누를 때 1회를 써요.",
        detail: "질문·중복은 '반려', 범위 밖은 '추가 작업으로'를 눌러요. 둘 다 횟수를 안 써요.",
        image: { src: "/guide/06-revisions.webp", alt: "수정 요청 기록. 확인 대기 요청의 수정 완료 버튼에 1번 표시, 아래에 1회차로 센 요청", width: 750, height: 926 },
      },
      {
        id: "addon",
        title: "범위 밖은 추가요청으로 받아요",
        caption: "초안으로 적어 두고, 고객이 동의하면 확정해요.",
        detail: "확정하면 금액·마감·할 일에 반영돼요.",
        image: { src: "/guide/07-addon.webp", alt: "추가요청 구획. 추가요청 기록 버튼에 1번, 초안의 확정 버튼에 2번 표시", width: 750, height: 580 },
      },
    ],
  },
  {
    id: "more",
    title: "더 편하게",
    tryIt: { href: "/jobs/summary", label: "월별 정리 열기" },
    shots: [
      {
        id: "messages",
        title: "상황에 맞는 말을 골라 보내요",
        caption: "남은 것 요청·시안 확인·범위 밖 안내 등을 골라 복사해요.",
        detail: "금액·받은 곳은 문구에 넣지 않아요.",
        image: { src: "/guide/08-messages.webp", alt: "고객에게 보낼 말 구획. 시안 확인 부탁 칩에 1번, 문구 복사 버튼에 2번 표시", width: 750, height: 792 },
      },
      {
        id: "monthly",
        title: "달마다 매출을 모아 봐요",
        caption: "완료한 주문을 받은 곳별로 보고 표 파일로 받아요.",
        detail: "'일감 완료'를 누른 주문이 모여요. 세금 계산이나 신고는 하지 않아요.",
        image: { src: "/guide/09-monthly.webp", alt: "월별 정리 화면. 10월 내려받기 버튼에 1번 표시, 아래에 받은 곳별 합계", width: 750, height: 1350 },
      },
    ],
  },
];

export function UserGuide() {
  return (
    <div className="guidePage">
      <header className="guideHeader">
        <Brand />
        <nav aria-label="설명서 메뉴">
          <Link href="/demo/r">고객 화면 체험</Link>
          <Link href="/today">로그인</Link>
        </nav>
      </header>

      <main className="guideMain">
        <section className="guideIntro">
          <h1>그림으로 보는 일감체크</h1>
          <p>주문 하나가 끝나기까지 흐름을 먼저 보고, 아래 그림으로 화면을 따라 해 보세요.</p>
          <div className="guideIntroActions">
            <Link href="/demo/r" className="primaryButton" data-testid="guide-demo-link">
              <MousePointerClick size={18} aria-hidden="true" /> 고객이 받는 화면 눌러 보기
            </Link>
            <Link href="/today" className="secondaryButton">무료로 시작하기</Link>
          </div>
        </section>

        {/* 처음 보는 사람이 한눈에 알도록 흐름도를 그림보다 먼저 둔다. */}
        <WorkFlowChart headingId="guide-flow-title" />

        {/* 가입은 한 번뿐이라 맨 위에 작게 둔다. */}
        <figure className="guideSignup" data-testid="guide-signup">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={GUIDE_SIGNUP.image.src} alt={GUIDE_SIGNUP.image.alt} width={GUIDE_SIGNUP.image.width} height={GUIDE_SIGNUP.image.height} loading="eager" decoding="async" />
          <figcaption>
            <strong>{GUIDE_SIGNUP.title}</strong>
            <span>{GUIDE_SIGNUP.caption}</span>
          </figcaption>
        </figure>

        <nav className="guideStrip" aria-label="네 장 한눈에 보기">
          <ol>
            {GUIDE_CHAPTERS.map((chapter, index) => (
              <li key={chapter.id}>
                <a href={`#${chapter.id}`} data-testid={`guide-strip-${chapter.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={chapter.shots[0].image.src} alt="" width={chapter.shots[0].image.width} height={chapter.shots[0].image.height} loading="eager" decoding="async" />
                  <span><b>{index + 1}</b> {chapter.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <ol className="guideChapters">
          {GUIDE_CHAPTERS.map((chapter, chapterIndex) => (
            <li key={chapter.id} id={chapter.id} className="guideChapter">
              <h2>
                <span className="guideStepNumber" aria-hidden="true">{chapterIndex + 1}</span>
                {chapter.title}
              </h2>
              <ol className="guideShots">
                {chapter.shots.map((shot, shotIndex) => (
                  <li key={shot.id} id={shot.id} className="guideShotItem">
                    <figure className="guideShot">
                      {/* 정적 캡처라 next/image 최적화 없이 그대로 쓴다. Sites(vite) 빌드도 같은 경로를 쓴다. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot.image.src}
                        alt={shot.image.alt}
                        width={shot.image.width}
                        height={shot.image.height}
                        loading={chapterIndex === 0 && shotIndex === 0 ? "eager" : "lazy"}
                        decoding="async"
                      />
                    </figure>
                    <h3>{shot.title}</h3>
                    <p>{shot.caption}</p>
                    {shot.detail && (
                      <details className="guideDetail">
                        {/* '자세히'가 일곱 번 나오니 낭독기에는 그림 제목을 붙여 구분한다. 보이는 글은 '자세히' 그대로다. */}
                        <summary>자세히<span className="srOnly">, {shot.title}</span> <ChevronDown size={15} aria-hidden="true" /></summary>
                        <p>{shot.detail}</p>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
              <Link href={chapter.tryIt.href} className="secondaryButton guideTryButton" data-testid={`guide-try-${chapter.id}`}>
                직접 해 보기 · {chapter.tryIt.label} <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>

        {/* 구현된 것과 아직 안 되는 것을 섞지 않는다. 기준: docs/design/revision-count-and-customer-link.md */}
        <section className="guideOutro" aria-labelledby="guide-not-yet-title" data-testid="guide-not-yet">
          <h2 id="guide-not-yet-title">아직 안 되는 것</h2>
          <p>플랫폼·메신저의 주문과 대화를 자동으로 가져오지 않아요. 주문은 직접 등록하고 링크도 직접 보내요. 고객에게 자동으로 답장하지 않고, 고객이 결과를 확인한 뒤에 차감하는 방식과 웹에서 새 요청 알림도 아직 준비 전이에요.</p>
        </section>
      </main>

      <footer className="guideFooter">
        <Link href="/">일감체크 소개</Link>
        <Link href="/terms">이용약관</Link>
        <Link href="/privacy">개인정보처리방침</Link>
      </footer>
    </div>
  );
}
