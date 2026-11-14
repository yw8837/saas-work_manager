"use client";

import Link from "next/link";
import { useEffect } from "react";

import { startClarityOnPage } from "@/lib/clarity";
import { configuredClarityProjectId } from "@/lib/clarity-config";

/**
 * 방문 기록 도구(Microsoft Clarity)를 붙인다. 메인(src/app/page.tsx)·둘러보기(src/app/try/page.tsx)에서만 렌더한다.
 * 조건 판정과 다른 화면으로 옮길 때 멈추기는 src/lib/clarity.ts에 있다. 화면에는 아무것도 그리지 않는다.
 */
export function ClarityLoader() {
  useEffect(() => {
    startClarityOnPage();
  }, []);
  return null;
}

/** 두 화면 바닥글 근처의 한 줄 안내. 프로젝트 ID가 없으면(도구를 안 쓰면) 그리지 않는다. */
export function ClarityNotice() {
  if (!configuredClarityProjectId()) return null;
  return (
    <p className="clarityNotice" data-testid="clarity-notice">
      이 화면은 개선을 위해 방문 기록 도구(Microsoft Clarity)를 써요. 브라우저에서 추적 거부(GPC·DNT)를 켜면 쓰지 않아요.{" "}
      <Link href="/privacy">개인정보처리방침</Link>
    </p>
  );
}
