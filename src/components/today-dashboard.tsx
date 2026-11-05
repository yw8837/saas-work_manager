"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BellRing,
  Check,
  ChevronDown,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MessageCircle,
  MessageSquareText,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FirstRunChecklist } from "./first-run-checklist";
import { StarterLinkNotice } from "./starter-link-notice";
import { displayJobTitle, orderSourceLabel } from "@/lib/domain";
import { localTodayISO } from "@/lib/due-tile";
import { hasMaterialWaiting, isNearRevisionLimit } from "@/lib/job-chips";
import { monthKeyOf } from "@/lib/summary/monthly";
import { thisMonthMoney } from "@/lib/summary/this-month-money";
import { emptyTodaySearch, subscribeTodayLocation, todaySearchSnapshot, updateTodayScope } from "@/lib/today-location";
import { DueTile } from "./due-tile";
import {
  formatShortDate,
  formatWon,
  getRevisionSummary,
  useWorkspace,
  type Job,
  type Task,
} from "./workspace-provider";

/** 우선 처리 한 줄 = 일감 하나. 가장 급한 할 일 하나를 보이고, 나머지 밀린 할 일은 개수만 붙인다. */
type QueueItem = { job: Job; task: Task; more: number };

/** 줄에 보이는 일감 이름. 받은 곳이 있으면 뒤에 작게 붙인다("Basic 홈페이지 · 크몽"). */
function jobLine(job: Job) {
  const source = orderSourceLabel(job.source);
  return source ? `${displayJobTitle(job)} · ${source}` : displayJobTitle(job);
}

function todayISO() {
  return localTodayISO();
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * 오늘 화면 맨 위 '받을 돈' 카드(디자인 A). 숫자는 월별 정리·수수료 함수만 묶은 thisMonthMoney.
 * 돈이 먼저 보여야 해서 휴대폰에서도 처음엔 펼쳐 두고, '금액 접기'로 접을 수 있다(데스크톱은 CSS로 늘 펼침).
 */
function MonthMoneyCard({ jobs }: { jobs: Job[] }) {
  const [open, setOpen] = useState(true);
  const timeZone = browserTimeZone();
  const money = thisMonthMoney(jobs, monthKeyOf(new Date().toISOString(), timeZone), timeZone);
  return (
    <section className="monthMoneyCard" aria-label="받을 돈" data-money-open={open}>
      <div className="monthMoneyHead">
        <h2>받을 돈<small> · 진행 중 {money.inProgress.count}건{money.fee > 0 && ", 수수료 빼고"}</small></h2>
        <button
          type="button"
          className="textButton monthMoneyToggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="month-money-body"
        >
          {open ? "금액 접기" : "금액 보기"} <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
      <div id="month-money-body" className="monthMoneyBody">
        <strong className="monthMoneyTotal" data-testid="month-money-total">{formatWon(money.receivable)}</strong>
        <dl className="monthMoneyCells">
          {/* 수수료가 없으면 진행 중 금액이 큰 숫자와 같아서 칸을 두지 않는다. */}
          {money.fee > 0 && (
            <>
              <div data-testid="month-money-in-progress">
                <dt>진행 중 금액 · {money.inProgress.count}건</dt>
                <dd>{formatWon(money.inProgress.amount)}</dd>
              </div>
              <div data-testid="month-money-fee">
                <dt>수수료</dt>
                <dd>−{formatWon(money.fee)}</dd>
              </div>
            </>
          )}
          <div data-testid="month-money-completed">
            <dt>이번 달 완료 · {money.completed.count}건</dt>
            <dd>{formatWon(money.completed.amount)}</dd>
          </div>
        </dl>
        <Link href="/jobs/summary" className="inlineLink monthMoneyLink">월별 정리 <ArrowUpRight size={14} /></Link>
      </div>
    </section>
  );
}

function todayHeading() {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
}

function QueueRow({ item, onComplete }: { item: QueueItem; onComplete: (item: QueueItem) => void }) {
  const { job, task } = item;
  const urgent = task.dueDate < todayISO();
  const contactLink = job.links.find((link) => link.kind === "contact");
  const workLink = job.links.find((link) => link.kind === "work");

  return (
    <article className="taskRow" data-urgent={urgent}>
      <button
        type="button"
        className="taskCheckButton"
        aria-label={`${task.title} 완료 처리`}
        data-testid={`task-toggle-${task.id}`}
        onClick={() => onComplete(item)}
      >
        <Check size={18} strokeWidth={2.5} />
      </button>
      <DueTile dueDate={task.dueDate} today={todayISO()} />
      <Link href={`/jobs/${job.id}`} className="taskRowMain">
        <div className="taskMetaLine">
          <span className="clientName">{job.clientLabel}</span>
        </div>
        <strong>{task.title}</strong>
        {item.more > 0 && <span className="taskMore" data-testid={`task-more-${job.id}`}>{urgent ? "밀린" : "오늘"} 할 일 {item.more}개 더</span>}
        <span className="taskContext">{jobLine(job)} · {formatShortDate(job.dueDate)} 마감</span>
      </Link>
      {(contactLink || workLink) && (
        <div className="taskQuickActions">
          {contactLink && (
            <a href={contactLink.url} target="_blank" rel="noreferrer" className="rowIconButton" aria-label={`${job.clientLabel}에게 연락`}>
              <MessageCircle size={18} />
            </a>
          )}
          {workLink && (
            <a href={workLink.url} target="_blank" rel="noreferrer" className="rowIconButton" aria-label={`${job.clientLabel} 작업 링크 열기`}>
              <ExternalLink size={18} />
            </a>
          )}
        </div>
      )}
    </article>
  );
}

/** 고객이 링크로 남긴 확인 대기 요청. 체크하는 줄이 아니라 그 일감의 수정 요청 구획으로 가는 줄이다. */
function RequestRow({ job, pending }: { job: Job; pending: number }) {
  return (
    <article className="taskRow" data-testid={`today-pending-request-${job.id}`}>
      <span className="taskRowIcon" aria-hidden="true"><MessageSquareText size={18} /></span>
      <span className="dueTile" data-tone="soon" aria-hidden="true"><b>요청</b><small>{pending}건</small></span>
      <Link href={`/jobs/${job.id}#revisions`} className="taskRowMain">
        <div className="taskMetaLine">
          <span className="clientName">{job.clientLabel}</span>
        </div>
        <strong>고객 요청 {pending}건 확인 대기</strong>
        <span className="taskContext">{jobLine(job)}</span>
      </Link>
    </article>
  );
}

export function TodayDashboard() {
  const { jobs, jobsCreatedTotal, toggleTask, toggleJobWaiting, resetDemo, alerts, settings, runtimeMode } = useWorkspace();
  // 방금 체크한 할 일. 알림의 '되돌리기'로 체크를 되돌린다.
  const [completed, setCompleted] = useState<{ jobId: string; taskId: string; title: string } | null>(null);
  const completedTimer = useRef<number | undefined>(undefined);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const search = useSyncExternalStore(subscribeTodayLocation, todaySearchSnapshot, emptyTodaySearch);
  const selectedJobId = new URLSearchParams(search).get("job") ?? "";
  const now = todayISO();
  const todayStart = new Date(`${now}T00:00:00`).getTime();
  const activeJobs = useMemo(() => jobs.filter((job) => job.status === "active"), [jobs]);
  // Completed/deleted jobs cannot leave the dashboard stuck on a missing selection.
  const scopeJobId = activeJobs.some((job) => job.id === selectedJobId) ? selectedJobId : "";
  const scopedJobs = useMemo(
    () => scopeJobId ? activeJobs.filter((job) => job.id === scopeJobId) : activeJobs,
    [activeJobs, scopeJobId],
  );

  // 시작일이 과거인 일감은 할 일이 한꺼번에 밀려 화면을 덮는다. 일감마다 한 줄로 묶는다.
  const queue = useMemo(
    () =>
      scopedJobs
        .flatMap((job): QueueItem[] => {
          const due = job.tasks
            .filter((task) => task.status !== "done" && task.status !== "waiting" && task.dueDate <= now)
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.order - b.order);
          return due.length ? [{ job, task: due[0], more: due.length - 1 }] : [];
        })
        .sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate)),
    [scopedJobs, now],
  );

  // 확인 대기 요청은 맨 위 알림 한 줄에만 나오면 놓치기 쉬워 '우선 처리' 맨 앞에 일감마다 한 줄로 둔다.
  const requestRows = scopedJobs
    .map((job) => ({ job, pending: getRevisionSummary(job).pending }))
    .filter((item) => item.pending > 0);

  const waitingJobs = scopedJobs.filter(
    (job) => job.status === "active" && job.tasks.some((task) => task.status === "waiting"),
  );
  // 마감이 지난 일감도 빼지 않는다. 날짜순이라 지연 일감이 맨 위에 온다.
  const upcomingJobs = scopedJobs
    .filter((job) => job.status === "active")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4);
  // 받을 자료나 착수 전 질문의 답이 남은 진행 중 일감.
  const materialWaitingJobs = scopedJobs.filter(hasMaterialWaiting);
  // 수정을 실제로 쓰기 시작한 일감만 센다(기준은 lib/job-chips — 일감 목록의 '수정 n/m' 칩과 같다).
  const nearRevisionLimit = scopedJobs.filter(isNearRevisionLimit);
  const primaryAlert = alerts.find((alert) => !scopeJobId || alert.jobId === scopeJobId);
  const visibleQueue = showAllTasks ? queue : queue.slice(0, 6);

  // 되돌리기를 누를 시간을 준다.
  const restartCompletedTimer = () => {
    window.clearTimeout(completedTimer.current);
    completedTimer.current = window.setTimeout(() => setCompleted(null), 6000);
  };
  const closeCompleted = () => {
    window.clearTimeout(completedTimer.current);
    setCompleted(null);
  };
  useEffect(() => () => window.clearTimeout(completedTimer.current), []);

  const handleComplete = (item: QueueItem) => {
    toggleTask(item.job.id, item.task.id);
    setCompleted({ jobId: item.job.id, taskId: item.task.id, title: item.task.title });
    restartCompletedTimer();
  };

  const undoComplete = () => {
    if (completed) toggleTask(completed.jobId, completed.taskId);
    closeCompleted();
  };

  const handleResetDemo = () => {
    const confirmed = window.confirm(
      // 남는 것을 숨기면 "초기화했는데 왜 아직 한도에 걸리지?"가 된다. 남는 것도 이름으로 말한다.
      "이 브라우저에 저장된 일감과 수정 기록, 그리고 직접 만든 패키지와 옵션까지 모두 지울까요? 기본 패키지와 옵션은 보관해 둔 것까지 다시 살아나요. 지금까지 만든 일감 수와 체험·베타 이용 기간은 그대로 남아요. 이 작업은 되돌릴 수 없어요.",
    );
    if (confirmed) resetDemo();
  };

  return (
    <div className="pageSurface todayPage">
      <header className="pageHeader todayHeader">
        <div>
          <h1>오늘 할 일</h1>
          <p className="todayDate">{todayHeading()}</p>
          <p>{jobs.length === 0 ? "일감을 등록하면 마감과 할 일을 여기에 모아드려요." : "급한 순서대로 꺼내뒀어요. 끝낸 일은 한 번만 눌러주세요."}</p>
        </div>
        <div className="pageHeaderActions">
          {runtimeMode === "local" && (
            <button type="button" className="quietButton desktopOnly" onClick={handleResetDemo}>
              <RotateCcw size={16} /> 전체 초기화
            </button>
          )}
          <Link href="/jobs/new" className="primaryButton desktopCreateButton" data-testid="create-job">
            <Plus size={18} /> 새 일감
          </Link>
        </div>
      </header>

      <StarterLinkNotice />
      {jobs.length === 0 ? (
        <FirstRunChecklist />
      ) : (
        <>
      <MonthMoneyCard jobs={jobs} />
      {(jobsCreatedTotal ?? jobs.length) <= 1 && <FirstRunChecklist compact />}
      <div className="workspaceScope">
        <label htmlFor="today-job-scope">일감별로 보기</label>
        <select
          id="today-job-scope"
          value={scopeJobId}
          onChange={(event) => {
            updateTodayScope(event.target.value);
            setShowAllTasks(false);
          }}
        >
          <option value="">진행 중인 일감 전체 · {activeJobs.length}건</option>
          {activeJobs.map((job) => (
            <option key={job.id} value={job.id}>{job.clientLabel} · {displayJobTitle(job)}</option>
          ))}
        </select>
        <Link href="/jobs">전체 일감 보기 <ArrowUpRight size={15} /></Link>
      </div>
      <section className="todayBrief" aria-label="오늘 업무 요약" data-severity={primaryAlert?.severity}>
        <div className="briefMessage">
          <span className="briefIcon"><BellRing size={18} /></span>
          <div>
            <strong>{primaryAlert ? primaryAlert.title : "확인할 알림이 없어요"}</strong>
            <p>{primaryAlert ? (primaryAlert.kind === "revision" && !settings.privateNotificationDetails ? "새 수정요청이 들어왔어요. 상세에서 내용을 확인하세요." : primaryAlert.message) : "마감과 고객 답변은 아래에서 확인하세요."}</p>
          </div>
        </div>
        <dl className="briefStats">
          <div><dt>오늘</dt><dd>{queue.length}</dd></div>
          <div><dt>자료 대기</dt><dd>{materialWaitingJobs.length}</dd></div>
          <div><dt>고객 대기</dt><dd>{waitingJobs.length}</dd></div>
          <div><dt>수정 거의 다 씀</dt><dd>{nearRevisionLimit.length}</dd></div>
        </dl>
      </section>

      <div className="dashboardGrid">
        <div className="dashboardPrimary">
          <section className="contentSection focusSection">
            <div className="sectionHeadingRow">
              <div>
                <h2>우선 처리</h2>
                <p>새 고객 요청과 마감이 지난 일부터 보여줘요.</p>
              </div>
              <span className="sectionCount">{requestRows.length + queue.length}개</span>
            </div>

            <div className="taskList">
              {requestRows.map((item) => (
                <RequestRow key={`request-${item.job.id}`} job={item.job} pending={item.pending} />
              ))}
              {queue.length > 0 ? (
                visibleQueue.map((item) => (
                  <QueueRow key={`${item.job.id}-${item.task.id}`} item={item} onComplete={handleComplete} />
                ))
              ) : requestRows.length === 0 && (
                  <div className="clearState">
                    <CheckCircle2 size={24} />
                    <div><strong>급한 일은 모두 끝났어요</strong><span>마음 편히 다음 작업에 집중하세요.</span></div>
                  </div>
              )}
            </div>

            {queue.length > 6 && (
              <button type="button" className="queueExpandButton" onClick={() => setShowAllTasks((visible) => !visible)}>
                {showAllTasks ? "우선 6개만 보기" : `나머지 ${queue.length - 6}개도 보기`}
              </button>
            )}
          </section>

          <section className="contentSection waitingSection">
            <div className="sectionHeadingRow">
              <div><h2>고객 답변 대기</h2><p>답이 오면 ‘답변 받음’을 눌러요.</p></div>
              <span className="sectionCount muted">{waitingJobs.length}건</span>
            </div>
            {waitingJobs.length ? (
              <div className="waitingList">
                {waitingJobs.map((job) => {
                  const waitingTask = job.tasks.find((task) => task.status === "waiting");
                  const days = waitingTask?.waitingSince
                    ? Math.max(1, Math.floor((todayStart - new Date(waitingTask.waitingSince).getTime()) / 86_400_000))
                    : 1;
                  return (
                    <article className="waitingRow" key={job.id}>
                      <span className="waitingAvatar">{job.clientLabel.slice(0, 1)}</span>
                      <Link href={`/jobs/${job.id}`} className="waitingMain">
                        <strong>{job.clientLabel}</strong>
                        <span>{jobLine(job)} · {waitingTask?.title ?? "고객 답변 대기 중"}</span>
                      </Link>
                      <span className="waitingDays">{days}일째</span>
                      <button type="button" className="compactButton" onClick={() => toggleJobWaiting(job.id)}>답변 받음</button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="inlineEmpty">대기 중인 고객이 없어요.</p>
            )}
          </section>
        </div>

        <aside className="dashboardAside">
          <section className="sideSection">
            <div className="sectionHeadingRow compact">
              <div><h2>다가오는 마감</h2><p>진행률과 남은 날짜</p></div>
              <Link href="/jobs" className="inlineLink">전체 보기 <ArrowUpRight size={14} /></Link>
            </div>
            <div className="upcomingList">
              {upcomingJobs.length === 0 && (
                <p className="upcomingEmpty">
                  {jobs.length === 0
                    ? "일감을 만들면 마감이 가까운 순서로 여기에 모아 보여드려요."
                    : "다가오는 마감이 없어요."}
                </p>
              )}
              {upcomingJobs.map((job) => {
                const finished = job.tasks.filter((task) => task.status === "done").length;
                const progress = Math.round((finished / Math.max(1, job.tasks.length)) * 100);
                const overdue = job.dueDate < now;
                return (
                  <Link href={`/jobs/${job.id}`} className="upcomingItem" key={job.id} data-overdue={overdue}>
                    <DueTile dueDate={job.dueDate} today={now} />
                    <div className="upcomingBody">
                      <div className="upcomingTop"><span>{job.clientLabel}</span><strong className="upcomingAmount">{formatWon(job.amount)}</strong></div>
                      <p>{jobLine(job)}</p>
                      <div className="progressLine" aria-label={`${progress}% 완료`}><span style={{ width: `${progress}%` }} /></div>
                      <span className="progressCaption">{finished}/{job.tasks.length} 완료</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="quickGuide">
            <Clock3 size={18} />
            <div><strong>작업만 하세요</strong><p>마감, 대기, 수정 횟수는 일감체크가 다시 꺼내드릴게요.</p></div>
          </section>
        </aside>
      </div>
        </>
      )}

      {completed && (
        <div
          className="actionToast"
          role="status"
          // 알림 안에 포커스나 마우스가 있는 동안은 저절로 닫지 않는다(일감 화면 알림과 같은 규칙).
          onMouseEnter={() => window.clearTimeout(completedTimer.current)}
          onFocus={() => window.clearTimeout(completedTimer.current)}
          onMouseLeave={restartCompletedTimer}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) restartCompletedTimer(); }}
        >
          <CheckCircle2 size={19} />
          <span><strong>{completed.title}</strong> 완료했어요</span>
          <button type="button" onClick={undoComplete}>되돌리기</button>
        </div>
      )}
    </div>
  );
}
