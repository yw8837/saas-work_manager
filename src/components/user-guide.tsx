import Link from "next/link";
import { ArrowRight, MousePointerClick } from "lucide-react";

import { Brand } from "./brand";

export type GuideStep = {
  id: string;
  title: string;
  body: string;
  /** 맨 위 단계 띠에 쓰는 두세 단어 */
  short: string;
  image: { src: string; alt: string; width: number; height: number };
  /** 그 단계를 바로 해 보는 곳. 작업공간 화면은 로그인 뒤에 열린다. */
  tryIt: { href: string; label: string };
};

/**
 * 캡처는 e2e/capture/guide-screens.capture.ts가 로컬 모드 예시 데이터(src/lib/demo/sample-order.ts)로 찍는다.
 * 실제 계정·고객 정보는 들어가지 않는다. 화면이 바뀌면 그 스펙을 다시 돌려 이미지를 갱신한다.
 */
export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "signup",
    short: "가입",
    tryIt: { href: "/today", label: "Google로 시작하기" },
    title: "Google 계정으로 가입해요",
    body: "Google로 계속하기를 누르면 바로 내 작업공간이 열려요. 베타 이용 코드를 받았다면 첫 화면에서 입력하세요.",
    image: { src: "/guide/01-signup.webp", alt: "Google 계정으로 시작하기 버튼이 있는 로그인 화면", width: 750, height: 1004 },
  },
  {
    id: "packages",
    short: "패키지 저장",
    tryIt: { href: "/packages", label: "내 패키지 고치기" },
    title: "자주 파는 패키지를 한 번만 저장해요",
    body: "BASIC·STANDARD·DELUXE처럼 금액, 기간, 수정 횟수, 기본 할 일을 묶어 둬요.",
    image: { src: "/guide/02-packages.webp", alt: "BASIC, STANDARD, DELUXE 로고 패키지가 금액과 수정 횟수와 함께 보이는 패키지 화면", width: 750, height: 1520 },
  },
  {
    id: "new-job",
    short: "주문 등록",
    tryIt: { href: "/jobs/new", label: "새 일감 만들어 보기" },
    title: "주문이 오면 네 가지만 골라요",
    body: "고객, 시작일, 패키지, 옵션을 고르면 금액·마감·할 일·수정 횟수가 저절로 채워져요.",
    image: { src: "/guide/03-new-job.webp", alt: "예시 고객과 STANDARD 로고 패키지를 고르자 금액과 마감, 할 일, 수정 횟수가 계산된 새 일감 화면", width: 750, height: 1520 },
  },
  {
    id: "send-link",
    short: "링크 보내기",
    tryIt: { href: "/demo/r", label: "고객 화면 직접 눌러 보기" },
    title: "고객에게 수정요청 링크를 보내요",
    body: "일감을 저장하면 바로 뜨는 보내기 안내에서 링크나 카톡에 붙일 문구를 복사해 보내요. 고객은 로그인 없이 열어요.",
    image: { src: "/guide/04-send-link.webp", alt: "일감을 저장한 직후 링크 복사, 카톡 문구 복사, 고객 화면 미리보기 버튼이 보이는 보내기 안내", width: 750, height: 1520 },
  },
  {
    id: "revisions",
    short: "수정 자동 기록",
    tryIt: { href: "/demo/r", label: "요청 남겨 보기" },
    title: "고객 요청은 자동으로 기록·차감돼요",
    body: "고객이 링크로 남긴 요청은 원문과 시각이 수정 로그에 쌓이고 남은 횟수가 1회 줄어요.",
    image: { src: "/guide/05-revisions.webp", alt: "고객 링크로 들어온 수정 요청 두 건과 남은 수정 횟수가 보이는 수정 요청 로그", width: 750, height: 1520 },
  },
  {
    id: "addon",
    short: "추가요청",
    tryIt: { href: "/jobs", label: "내 일감에서 해 보기" },
    title: "범위 밖 요청은 추가요청으로 따로 받아요",
    body: "초안으로 적어 두고 고객이 동의하면 확정해요. 확정하면 금액·마감·할 일에 반영돼요.",
    image: { src: "/guide/06-addon.webp", alt: "명함 시안 추가 요청이 초안으로 기록되고 확정 버튼이 보이는 추가요청 구획", width: 750, height: 1520 },
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
          <p>가입부터 추가 요청까지 여섯 장면이면 끝나요.</p>
          <div className="guideIntroActions">
            <Link href="/demo/r" className="primaryButton" data-testid="guide-demo-link">
              <MousePointerClick size={18} aria-hidden="true" /> 고객이 받는 화면 눌러 보기
            </Link>
            <Link href="/today" className="secondaryButton">무료로 시작하기</Link>
          </div>
        </section>

        <nav className="guideStrip" aria-label="여섯 단계 한눈에 보기">
          <ol>
            {GUIDE_STEPS.map((step, index) => (
              <li key={step.id}>
                <a href={`#${step.id}`} data-testid={`guide-strip-${step.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={step.image.src} alt="" width={step.image.width} height={step.image.height} loading="eager" decoding="async" />
                  <span><b>{index + 1}</b> {step.short}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <ol className="guideSteps">
          {GUIDE_STEPS.map((step, index) => (
            <li key={step.id} id={step.id} className="guideStep">
              <div className="guideStepCopy">
                <span className="guideStepNumber" aria-hidden="true">{index + 1}</span>
                <h2>{step.title}</h2>
                <p>{step.body}</p>
                <Link href={step.tryIt.href} className="secondaryButton guideTryButton" data-testid={`guide-try-${step.id}`}>
                  직접 해보기 · {step.tryIt.label} <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
              <figure className="guideShot">
                {/* 정적 캡처라 next/image 최적화 없이 그대로 쓴다. Sites(vite) 빌드도 같은 경로를 쓴다. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={step.image.src}
                  alt={step.image.alt}
                  width={step.image.width}
                  height={step.image.height}
                  loading={index < 2 ? "eager" : "lazy"}
                  decoding="async"
                />
              </figure>
            </li>
          ))}
        </ol>

        <section className="guideOutro">
          <h2>고객 쪽 화면이 궁금하면</h2>
          <p>예시 주문으로 수정 요청을 직접 남겨 보세요. 실제로 전송되지 않아요.</p>
          <Link href="/demo/r" className="primaryButton">
            체험 링크 열기 <ArrowRight size={17} aria-hidden="true" />
          </Link>
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
