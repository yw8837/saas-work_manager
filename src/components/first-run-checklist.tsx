"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import {
  firstRunSteps,
  markFirstRun,
  readFirstRunFlags,
  serverFirstRunFlags,
  subscribeFirstRun,
  type FirstRunStepId,
} from "@/lib/first-run";
import {
  currentStarterIndustry,
  INDUSTRY_LABELS,
  INDUSTRY_ORDER,
  INDUSTRY_STARTERS,
  usesOnlyStarterPackages,
  type Industry,
} from "@/lib/store/industry-starters";
import { useWorkspace } from "./workspace-provider";

// 그림은 사용설명서와 같은 캡처(e2e/capture/guide-screens.capture.ts)를 다시 쓴다. 크기는 그 파일 그대로.
// 그림 칸은 폭 200px·최대 높이 240px로 위쪽만 보인다(.firstRunShot). alt는 그 칸에 보이는 부분만 말한다:
// 패키지 그림은 위쪽 약 40%(받을 자료·착수 전 질문 칸, 저장 버튼은 칸 밖), 새 일감 그림은 위쪽 약 35%(패키지·옵션·금액·마감은 칸 밖), 저장 직후 안내는 전부.
const STEP_COPY: Record<FirstRunStepId, { title: string; body: string; image: { src: string; width: number; height: number }; alt: string }> = {
  packages: {
    title: "내 일에 맞는 예시 패키지 고르기",
    body: "업종을 고르면 그 업종 예시 패키지로 바꿔 드려요. 금액은 예시라서 패키지 화면에서 내 조건으로 고쳐 쓰면 돼요.",
    image: { src: "/guide/02-packages.webp", width: 750, height: 2258 },
    alt: "받을 자료·착수 전 질문 칸이 보이는 패키지 화면 예시",
  },
  "first-job": {
    title: "첫 일감 만들기",
    body: "고객, 시작일, 패키지, 옵션 네 가지만 고르면 금액·마감·할 일·수정 횟수가 채워져요.",
    image: { src: "/guide/03-new-job.webp", width: 750, height: 2530 },
    alt: "고객 이름·받은 곳·시작일이 보이는 새 일감 화면 예시",
  },
  "send-link": {
    title: "고객에게 수정 요청 링크 보내기",
    body: "일감 화면에서 링크나 카톡 문구를 복사해 보내요. 고객은 로그인 없이 열어 수정 요청을 남겨요.",
    image: { src: "/guide/04-send-message.webp", width: 750, height: 840 },
    alt: "카톡 문구 복사 버튼과 보낼 문구가 보이는 저장 직후 안내 예시",
  },
};

/**
 * 오늘 화면 첫 실행 체크리스트. 일감이 없으면 빈 화면 대신 크게, 첫 일감을 만든 뒤에는
 * 링크를 보낼 때까지 작게 보여 준다. 셋 다 끝나면 그리지 않는다.
 */
export function FirstRunChecklist({ compact = false }: { compact?: boolean }) {
  const workspace = useWorkspace();
  const { jobs, applyIndustryStarter } = workspace;
  const packages = workspace.packages ?? [];
  const jobsCreatedTotal = workspace.jobsCreatedTotal ?? jobs.length;
  const flags = useSyncExternalStore(subscribeFirstRun, readFirstRunFlags, serverFirstRunFlags);
  const [industryMessage, setIndustryMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const selectedIndustry = currentStarterIndustry(packages);
  // 기본 예시(처음엔 웹)를 그대로 쓰고 있으면 1단계는 끝난 것으로 보고 접는다(누르기 1번 덜).
  const steps = firstRunSteps({ jobs, flags, packagesCustomized: !usesOnlyStarterPackages(packages), starterSet: selectedIndustry !== null });
  const doneCount = steps.filter((step) => step.done).length;
  const currentId = steps.find((step) => !step.done)?.id;
  const canPickIndustry = jobs.length === 0 && jobsCreatedTotal === 0;
  const sendTarget = jobs.find((job) => job.status === "active") ?? jobs[0];

  if (doneCount === steps.length) return null;
  if (compact && flags.dismissed) return null;

  const pickIndustry = (industry: Industry) => {
    try {
      applyIndustryStarter(industry);
      markFirstRun("packagesReviewed");
      setIndustryMessage({
        tone: "ok",
        text: `${INDUSTRY_LABELS[industry]} 예시 패키지 ${INDUSTRY_STARTERS[industry].packages.length}개로 바꿨어요. 금액은 예시예요.`,
      });
    } catch (error) {
      setIndustryMessage({ tone: "error", text: error instanceof Error ? error.message : "예시 패키지를 바꾸지 못했어요." });
    }
  };

  return (
    <section className="firstRunChecklist" data-compact={compact} aria-labelledby="first-run-title" data-testid="first-run-checklist">
      <div className="firstRunHead">
        <div>
          <h2 id="first-run-title">첫 고객 링크까지 세 단계</h2>
          <p>세 단계를 마치면 고객에게 첫 수정 요청 링크를 보낼 수 있어요.</p>
        </div>
        <div className="firstRunProgress">
          <span data-testid="first-run-progress">{doneCount}/{steps.length} 완료</span>
          <div className="progressLine" role="progressbar" aria-label="첫 실행 진행률" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
            <span style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }} />
          </div>
        </div>
        {compact && (
          <button type="button" className="iconButton firstRunClose" aria-label="첫 실행 안내 닫기" onClick={() => markFirstRun("dismissed")}>
            <X size={18} />
          </button>
        )}
      </div>

      <ol className="firstRunSteps">
        {steps.map((step, index) => {
          const copy = STEP_COPY[step.id];
          const current = step.id === currentId;
          // 큰 체크리스트는 아직 안 끝난 단계마다 바로 갈 곳을 준다. 순서를 강제하지 않는다.
          const actionable = !step.done && (!compact || current);
          // 끝난 단계는 제목만 남기고 접는다. 일감을 만들기 전 1단계만 한 줄과 작은 업종 칩을 남긴다.
          // 웹이 아닌 업종도 칩 한 번으로 바꾼다(펼치는 버튼을 두면 첫 링크까지 누르기가 1번 는다).
          const packagesDoneLine = step.id === "packages" && step.done && canPickIndustry && !compact;
          return (
            <li key={step.id} className="firstRunStep" data-state={step.done ? "done" : current ? "current" : "todo"} data-testid={`first-run-step-${step.id}`}>
              <span className="firstRunMarker" aria-hidden="true">{step.done ? <Check size={15} /> : index + 1}</span>
              <div className="firstRunBody">
                <h3>
                  {copy.title}
                  <span className="firstRunState">{step.done ? "완료" : current ? "지금 할 일" : "다음"}</span>
                </h3>
                {!step.done && (!compact || current) && <p>{copy.body}</p>}

                {packagesDoneLine && (
                  <p className="firstRunDoneLine" data-testid="first-run-starter-line">
                    <span>{selectedIndustry ? `${INDUSTRY_LABELS[selectedIndustry]} 예시로 시작했어요` : "패키지를 정했어요"}</span>
                    <Link href="/packages" className="inlineLink" onClick={() => markFirstRun("packagesReviewed")}>
                      패키지 확인하기 <ArrowUpRight size={16} />
                    </Link>
                  </p>
                )}

                {(actionable || packagesDoneLine) && step.id === "packages" && (
                  <div className="firstRunActions">
                    {canPickIndustry && (
                      <div className={packagesDoneLine ? "industryPicker firstRunIndustryChips" : "industryPicker"} role="group" aria-label="업종 고르기">
                        {INDUSTRY_ORDER.map((industry) => (
                          <button
                            key={industry}
                            type="button"
                            className="industryChip"
                            aria-pressed={selectedIndustry === industry}
                            onClick={() => pickIndustry(industry)}
                            data-testid={`industry-${industry}`}
                          >
                            {selectedIndustry === industry && <Check size={14} aria-hidden="true" />}
                            {INDUSTRY_LABELS[industry]}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* 접힌 한 줄에 이미 있으면 같은 링크를 또 두지 않는다. */}
                    {actionable && (
                      <Link href="/packages" className="inlineLink" onClick={() => markFirstRun("packagesReviewed")}>
                        패키지 확인하기 <ArrowUpRight size={16} />
                      </Link>
                    )}
                  </div>
                )}
                {industryMessage && step.id === "packages" && (
                  <p className="firstRunMessage" data-tone={industryMessage.tone} role={industryMessage.tone === "error" ? "alert" : "status"}>
                    {industryMessage.text}
                  </p>
                )}
                {actionable && step.id === "first-job" && usesOnlyStarterPackages(packages) && (
                  <p className="firstRunSamplePrice" data-testid="first-run-sample-price">
                    예시 금액이에요 · <Link href="/packages" className="inlineLink" onClick={() => markFirstRun("packagesReviewed")}>바꾸기</Link>
                  </p>
                )}
                {actionable && step.id === "first-job" && (
                  <div className="firstRunActions">
                    <Link href="/jobs/new" className={current ? "primaryButton" : "secondaryButton"} data-testid="first-run-create-job">
                      첫 일감 만들기 <ArrowRight size={18} />
                    </Link>
                  </div>
                )}
                {actionable && step.id === "send-link" && sendTarget && (
                  <div className="firstRunActions">
                    <Link href={`/jobs/${encodeURIComponent(sendTarget.id)}?send=1`} className="primaryButton" data-testid="first-run-send-link">
                      보낼 링크 열기 <ArrowRight size={18} />
                    </Link>
                    <Link href="/demo/r" className="inlineLink">고객이 받는 화면 보기 <ArrowUpRight size={16} /></Link>
                  </div>
                )}
              </div>
              {!compact && current && (
                <figure className="firstRunShot">
                  {/* 설명서와 같은 정적 캡처를 다시 쓴다. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={copy.image.src} alt={copy.alt} width={copy.image.width} height={copy.image.height} loading="lazy" decoding="async" />
                </figure>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
