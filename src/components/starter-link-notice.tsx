"use client";

import { useEffect, useRef, useState } from "react";

import { markFirstRun } from "@/lib/first-run";
import {
  canAutoApplyStarter,
  captureStarterFromLocation,
  clearPendingStarter,
  readPendingStarter,
} from "@/lib/starter-link";
import { INDUSTRY_LABELS, INDUSTRY_STARTERS } from "@/lib/store/industry-starters";
import { useWorkspace } from "./workspace-provider";

type Notice = { tone: "ok" | "info" | "error"; text: string };

/**
 * 업종별 예시 페이지에서 '이 예시로 시작하기'로 들어오면(`/today?starter=design`),
 * 작업공간을 다 불러온 뒤 첫 실행 체크리스트의 업종 칩과 같은 applyIndustryStarter를 한 번만 부른다.
 * 일감이 있거나 사용자가 고친 패키지가 있으면 아무것도 바꾸지 않고 짧게 알리기만 한다.
 */
export function StarterLinkNotice() {
  const workspace = useWorkspace();
  const { hydrated, runtimeMode, authStatus, jobs, applyIndustryStarter } = workspace;
  const packages = workspace.packages;
  const jobsCreatedTotal = workspace.jobsCreatedTotal ?? jobs.length;
  const [notice, setNotice] = useState<Notice | null>(null);
  const handled = useRef(false);
  const ready = hydrated && (runtimeMode === "local" || authStatus === "signed_in");

  useEffect(() => {
    // 로그인 관문보다 이 효과가 먼저 돌 수 있어(로컬 모드) 여기서도 주소의 값을 옮겨 둔다.
    captureStarterFromLocation();
    if (!ready || handled.current) return;
    const industry = readPendingStarter();
    clearPendingStarter();
    if (!industry) return;
    handled.current = true;

    let next: Notice;
    if (!canAutoApplyStarter({ jobs, jobsCreatedTotal, packages: packages ?? [] })) {
      next = { tone: "info", text: "이미 만든 일감이나 고친 패키지가 있어서 예시 패키지로 바꾸지 않았어요." };
    } else {
      try {
        applyIndustryStarter(industry);
        markFirstRun("packagesReviewed");
        next = {
          tone: "ok",
          text: `${INDUSTRY_LABELS[industry]} 예시 패키지 ${INDUSTRY_STARTERS[industry].packages.length}개로 시작했어요. 금액과 횟수는 예시예요.`,
        };
      } catch (error) {
        next = { tone: "error", text: error instanceof Error ? error.message : "예시 패키지를 바꾸지 못했어요." };
      }
    }
    queueMicrotask(() => setNotice(next));
  }, [applyIndustryStarter, jobs, jobsCreatedTotal, packages, ready]);

  if (!notice) return null;
  return (
    <p
      className="starterLinkNotice"
      data-tone={notice.tone}
      role={notice.tone === "error" ? "alert" : "status"}
      data-testid="starter-link-notice"
    >
      {notice.text}
    </p>
  );
}
