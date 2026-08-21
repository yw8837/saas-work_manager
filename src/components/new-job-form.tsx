"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  composeJob,
  PLAN_LIMITS,
  PLAN_NAMES,
  PLAN_PRICES,
  type JobLimitKind,
  type Plan,
  type PlanLimits,
} from "@/lib/domain";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ListChecks,
  PackageCheck,
  Plus,
  RotateCcw,
  Sparkles,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { formatShortDate, formatWon, useWorkspace } from "./workspace-provider";
import { UpgradeNotice } from "./upgrade-notice";

/**
 * 어느 한도에 걸렸는지에 따라 안내 문구가 달라진다. 숫자는 전부 PLAN_LIMITS에서 온다.
 * 안내 문구와 버튼이 서로 다른 요금제를 가리키면 안 된다.
 * 지금 막힌 한도를 실제로 풀어주는 가장 싼 요금제를 하나만 고른다.
 */
function jobLimitCopy(hit: JobLimitKind | null, limits: PlanLimits, plan: Plan) {
  if (hit === "totalJobs") {
    return {
      title: `무료로 만들 수 있는 ${limits.totalJobs}건을 다 쓰셨어요`,
      description: `누적 기준이라 완료하거나 지워도 다시 늘어나지 않아요. Solo(${PLAN_PRICES.solo.label})부터 누적 제한이 없어요.`,
      ctaLabel: `${PLAN_NAMES.solo} 업그레이드`,
    };
  }
  // 무료의 동시 한도는 Solo(5건)로 풀린다. Solo에서 막혔을 때만 Pro가 답이다.
  if (plan === "free") {
    return {
      title: `동시 진행 ${limits.activeJobs}건을 다 쓰셨어요`,
      description: `진행 중인 일감을 완료하면 자리가 나요. Solo(${PLAN_PRICES.solo.label})는 동시 ${PLAN_LIMITS.solo.activeJobs}건까지 늘어나요.`,
      ctaLabel: `${PLAN_NAMES.solo} 업그레이드`,
    };
  }
  return {
    title: `동시 진행 ${limits.activeJobs}건을 다 쓰셨어요`,
    description: `진행 중인 일감을 완료하면 자리가 나요. Pro(${PLAN_PRICES.pro.label})는 동시 진행도 무제한이에요.`,
    ctaLabel: `${PLAN_NAMES.pro} 업그레이드`,
  };
}

function currentDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function NewJobForm() {
  const router = useRouter();
  const { packages, options, createJob, canCreateJob, jobLimitHit, limits, plan } = useWorkspace();
  const limitCopy = jobLimitCopy(jobLimitHit, limits, plan);
  const activePackages = packages.filter((item) => !item.archivedAt);
  const activeOptions = options.filter((item) => !item.archivedAt);
  const [clientLabel, setClientLabel] = useState("");
  const [startDate, setStartDate] = useState(currentDate());
  const [packageId, setPackageId] = useState(activePackages[0]?.id ?? "");
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const preview = useMemo(() => {
    const selectedPackage = activePackages.find((item) => item.id === packageId) ?? activePackages[0];
    const selectedOptions = activeOptions.filter((item) => optionIds.includes(item.id));
    if (!selectedPackage) return null;
    try {
      const job = composeJob({
        clientLabel: clientLabel.trim() || "미리보기 고객",
        startDate,
        package: selectedPackage,
        options: selectedOptions,
        jobId: "preview-job",
        revisionPortalToken: "preview-token",
        now: "2026-01-01T00:00:00.000Z",
      });
      return { selectedPackage, selectedOptions, job };
    } catch {
      return null;
    }
  }, [clientLabel, packageId, optionIds, activePackages, activeOptions, startDate]);

  const toggleOption = (id: string) => {
    setOptionIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clientLabel.trim() || !packageId || submitting || !canCreateJob) return;
    setSubmitting(true);
    const id = createJob({ clientLabel, startDate, packageId, optionIds });
    router.push(`/jobs/${id}?created=1`);
  };

  return (
    <div className="pageSurface newJobPage">
      <header className="formPageHeader">
        <div className="formTitleLine">
          <Link href="/today" className="iconButton backButton" aria-label="오늘 화면으로 돌아가기">
            <ArrowLeft size={19} />
          </Link>
          <div>
            <span className="pageEyebrow">새 주문이 들어왔나요?</span>
            <h1>네 가지만 고르면 준비 끝.</h1>
            <p>저장하는 순간 금액, 마감, 할 일과 수정 횟수를 자동으로 채워요.</p>
          </div>
        </div>
        <span className="formTimePromise"><Clock3 size={15} /> 평균 30초</span>
      </header>

      <div className="fieldProgress" aria-label="새 일감에 필요한 네 가지 항목">
        <span data-filled={Boolean(clientLabel.trim())}><b>1</b>고객</span>
        <span data-filled={Boolean(startDate)}><b>2</b>시작일</span>
        <span data-filled={Boolean(packageId)}><b>3</b>패키지</span>
        <span data-filled={optionIds.length > 0}><b>4</b>옵션 <em>선택</em></span>
      </div>

      <form className="jobComposer" onSubmit={handleSubmit}>
        <div className="composerFields">
          <section className="formSection">
            <div className="formSectionNumber">01</div>
            <div className="formSectionBody">
              <label htmlFor="clientLabel" className="fieldLabel">
                고객 이름
                <span>메신저에서 구분하는 이름이면 충분해요</span>
              </label>
              <div className="inputWithIcon">
                <UserRound size={18} />
                <input
                  id="clientLabel"
                  name="clientLabel"
                  value={clientLabel}
                  onChange={(event) => setClientLabel(event.target.value)}
                  placeholder="예: 오로라 스튜디오"
                  autoComplete="organization"
                  required
                />
              </div>
            </div>
          </section>

          <section className="formSection">
            <div className="formSectionNumber">02</div>
            <div className="formSectionBody">
              <label htmlFor="startDate" className="fieldLabel">
                시작일
                <span>마감과 할 일 날짜의 기준이 돼요</span>
              </label>
              <div className="inputWithIcon">
                <CalendarDays size={18} />
                <input
                  id="startDate"
                  name="startDate"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  required
                />
              </div>
            </div>
          </section>

          <section className="formSection packageFieldSection">
            <div className="formSectionNumber">03</div>
            <fieldset className="formSectionBody">
              <legend className="fieldLabel">
                패키지
                <span>등록해둔 상품에서 하나만 고르세요</span>
              </legend>
              <div className="packageChoices">
                {activePackages.map((item) => {
                  const selected = packageId === item.id;
                  return (
                    <label className="packageChoice" key={item.id} data-selected={selected}>
                      <input
                        type="radio"
                        name="packageId"
                        value={item.id}
                        checked={selected}
                        onChange={() => setPackageId(item.id)}
                      />
                      <span className="choiceRadio">{selected && <Check size={14} />}</span>
                      <span className="packageChoiceMain">
                        <strong>{item.name}</strong>
                        <span>{item.description ?? "반복 업무 패키지"}</span>
                      </span>
                      <span className="packageChoiceMeta">
                        <strong>{formatWon(item.price)}</strong>
                        <span>{item.durationDays}일 · 수정 {item.revisionLimit}회</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </section>

          <section className="formSection optionFieldSection">
            <div className="formSectionNumber">04</div>
            <fieldset className="formSectionBody">
              <legend className="fieldLabel">
                옵션
                <span>없으면 그냥 넘어가도 돼요</span>
              </legend>
              <div className="optionChoices">
                {activeOptions.map((item) => {
                  const selected = optionIds.includes(item.id);
                  return (
                    <label className="optionChoice" key={item.id} data-selected={selected}>
                      <input
                        type="checkbox"
                        name="optionIds"
                        value={item.id}
                        checked={selected}
                        onChange={() => toggleOption(item.id)}
                      />
                      <span className="choiceCheckbox">{selected && <Check size={14} />}</span>
                      <span className="optionChoiceMain">
                        <strong>{item.name}</strong>
                        <span>+{formatWon(item.priceDelta)} · +{item.durationDaysDelta}일{item.revisionLimitDelta ? ` · 수정 +${item.revisionLimitDelta}회` : ""}</span>
                      </span>
                    </label>
                  );
                })}
                <Link href="/packages" className="optionDraftButton">
                  <Plus size={16} /> 패키지·옵션 편집
                </Link>
              </div>
            </fieldset>
          </section>
        </div>

        <aside className="jobPreview" aria-live="polite">
          <div className="previewSticky">
            <div className="previewTitle">
              <span><Sparkles size={15} /> 자동 완성 미리보기</span>
              <strong>{clientLabel.trim() || "고객 이름"}</strong>
              <p>{preview?.selectedPackage.name ?? "패키지"} 일감</p>
            </div>

            {preview && (
              <>
                <dl className="previewMetrics">
                  <div>
                    <dt><CircleDollarSign size={16} /> 계약 금액</dt>
                    <dd>{formatWon(preview.job.amount)}</dd>
                  </div>
                  <div>
                    <dt><Wallet size={16} /> 예상 원가</dt>
                    <dd data-testid="preview-estimated-cost">{formatWon(preview.job.estimatedCost)}</dd>
                  </div>
                  <div>
                    <dt><TrendingUp size={16} /> 예상 마진</dt>
                    <dd data-testid="preview-margin">
                      {formatWon(preview.job.margin)}
                      {preview.job.amount > 0 && <span>마진율 {Math.round((preview.job.margin / preview.job.amount) * 100)}%</span>}
                    </dd>
                  </div>
                  <div>
                    <dt><CalendarDays size={16} /> 자동 마감</dt>
                    <dd>{formatShortDate(preview.job.dueDate)} <span>자동 계산</span></dd>
                  </div>
                  <div>
                    <dt><RotateCcw size={16} /> 수정 한도</dt>
                    <dd>{preview.job.revisionLimit}회</dd>
                  </div>
                  <div>
                    <dt><ListChecks size={16} /> 생성할 일</dt>
                    <dd>{preview.job.tasks.length}개</dd>
                  </div>
                </dl>

                <div className="previewTodoBlock">
                  <span>생성될 체크리스트</span>
                  <ul>
                    {preview.job.tasks.slice(0, 5).map((task) => (
                      <li key={task.id}>
                        <CheckCircle2 size={15} />
                        <span>{task.title}</span>
                      </li>
                    ))}
                  </ul>
                  {preview.job.tasks.length > 5 && <span className="moreTasks">+ {preview.job.tasks.length - 5}개 더</span>}
                </div>

                {preview.selectedOptions.length > 0 && (
                  <div className="selectedOptionSummary">
                    <span>선택 옵션</span>
                    {preview.selectedOptions.map((item) => <b key={item.id}>{item.name}</b>)}
                  </div>
                )}
              </>
            )}

            {canCreateJob ? (
              <>
                <button
                  type="submit"
                  className="primaryButton previewSubmit"
                  disabled={!clientLabel.trim() || !packageId || submitting}
                  data-testid="submit-job"
                >
                  {submitting ? "일감 만드는 중…" : "일감 만들기"}
                  {!submitting && <ArrowRight size={18} />}
                </button>
                <p className="snapshotNote">
                  <PackageCheck size={15} /> 만든 뒤 패키지를 바꿔도 이 일감의 조건은 그대로 보존해요.
                </p>
              </>
            ) : (
              <div className="previewUpgrade">
                <UpgradeNotice
                  title={limitCopy.title}
                  description={limitCopy.description}
                  ctaLabel={limitCopy.ctaLabel}
                />
              </div>
            )}
          </div>
        </aside>

        {canCreateJob ? (
          <div className="mobileSubmitBar">
            <div className="mobileSubmitSummary">
              <span>
                {preview
                  ? `${formatWon(preview.job.amount)} · Todo ${preview.job.tasks.length}개`
                  : "금액과 Todo를 자동 계산해요"}
              </span>
              <strong>
                {preview
                  ? `${formatShortDate(preview.job.dueDate)} 마감 · 수정 ${preview.job.revisionLimit}회`
                  : "패키지를 골라주세요"}
              </strong>
            </div>
            <button
              type="submit"
              className="primaryButton"
              disabled={!clientLabel.trim() || !packageId || submitting}
              data-testid="submit-job-mobile"
            >
              {submitting ? "만드는 중…" : "일감 만들기"}
              {!submitting && <ArrowRight size={17} />}
            </button>
          </div>
        ) : (
          <div className="mobileUpgradeBar">
            <UpgradeNotice
              title={limitCopy.title}
              description={limitCopy.description}
              ctaLabel={limitCopy.ctaLabel}
            />
          </div>
        )}
      </form>
    </div>
  );
}
