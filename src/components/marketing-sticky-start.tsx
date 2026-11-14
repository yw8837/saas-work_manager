"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

/** 메인 첫 화면 시작 버튼 묶음과 맨 아래 시작 구역의 id. 고정 줄이 이 둘의 위치를 보고 나타나고 숨는다. */
export const LANDING_HERO_ACTIONS_ID = "landing-hero-actions";
export const LANDING_FINAL_CTA_ID = "landing-final-cta";

/**
 * 휴대폰에서 첫 화면 시작 버튼이 화면 위로 지나가면 아래에 시작 줄(무료로 시작하기·둘러보기)을 띄운다.
 * 맨 아래 시작 구역이 화면에 들어오면 숨긴다. 넓은 화면(720px 초과)에서는 CSS가 아예 그리지 않는다.
 * 숨어 있을 때는 낭독기·탭 이동에서도 빠진다(aria-hidden·inert).
 */
export function MarketingStickyStart({ href }: { href: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const hero = document.getElementById(LANDING_HERO_ACTIONS_ID);
      const final = document.getElementById(LANDING_FINAL_CTA_ID);
      if (!hero || !final) return;
      // 아직 그려지지 않아 크기가 0인 동안(bottom 0)은 지나간 것으로 보지 않는다.
      const passedHero = hero.getBoundingClientRect().bottom < 0;
      const finalBox = final.getBoundingClientRect();
      const finalInView = finalBox.top < window.innerHeight && finalBox.bottom > 0;
      setVisible(passedHero && !finalInView);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div
      className="stickyStart"
      data-visible={visible}
      aria-hidden={!visible}
      inert={!visible}
      data-testid="landing-sticky-start"
    >
      <Link href={href} className="primaryButton" data-testid="landing-sticky-start-button">
        무료로 시작하기 <ArrowRight size={17} aria-hidden="true" />
      </Link>
      <Link href="/try" className="secondaryButton" data-testid="landing-sticky-try">
        둘러보기
      </Link>
    </div>
  );
}
