"use client";

import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MessageCircle,
  PackageCheck,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  formatShortDate,
  getRevisionSummary,
  getDday,
  useWorkspace,
  type Job,
  type Task,
} from "./workspace-provider";

type QueueItem = { job: Job; task: Task };

function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const dday = getDday(task.dueDate);
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
      <Link href={`/jobs/${job.id}`} className="taskRowMain">
        <div className="taskMetaLine">
          <span className="clientName">{job.clientLabel}</span>
          <span className={urgent ? "dueTag danger" : "dueTag"}>
            {urgent && <AlarmClock size={13} />}
            {dday}
          </span>
        </div>
        <strong>{task.title}</strong>
        <span className="taskContext">{job.packageSnapshot.name} · {formatShortDate(job.dueDate)} 전체 마감</span>
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

export function TodayDashboard() {
  const { jobs, toggleTask, toggleJobWaiting, resetDemo, alerts, settings, runtimeMode } = useWorkspace();
  const [completedLabel, setCompletedLabel] = useState<string | null>(null);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const now = todayISO();
  const todayStart = new Date(`${now}T00:00:00`).getTime();

  const queue = useMemo(
    () =>
      jobs
        .filter((job) => job.status === "active")
        .flatMap((job) =>
          job.tasks
            .filter((task) => task.status !== "done" && task.status !== "waiting" && task.dueDate <= now)
            .map((task) => ({ job, task })),
        )
        .sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate)),
    [jobs, now],
  );

  const waitingJobs = jobs.filter(
    (job) => job.status === "active" && job.tasks.some((task) => task.status === "waiting"),
  );
  const upcomingJobs = jobs
    .filter((job) => job.status === "active" && job.dueDate >= now)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4);
  // 수정을 한 번도 안 쓴 일감까지 세면, 포함 수정 1회짜리 패키지는 만들자마자 "임박"이 뜬다.
  // 실제로 수정을 쓰기 시작한 일감만 센다.
  const nearRevisionLimit = jobs.filter((job) => {
    if (job.status !== "active") return false;
    const summary = getRevisionSummary(job);
    // 수정 0회 패키지는 used가 영원히 0이라, extraScope도 같이 봐야 임박을 놓치지 않는다.
    return (summary.used > 0 || summary.extraScope > 0) && summary.remaining <= 1;
  });
  const primaryAlert = alerts[0];
  const visibleQueue = showAllTasks ? queue : queue.slice(0, 6);

  const handleComplete = (item: QueueItem) => {
    toggleTask(item.job.id, item.task.id);
    setCompletedLabel(item.task.title);
    window.setTimeout(() => setCompletedLabel(null), 2600);
  };

  const handleResetDemo = () => {
    const confirmed = window.confirm(
      // 남는 것을 숨기면 "초기화했는데 왜 아직 한도에 걸리지?"가 된다. 남는 것도 이름으로 말한다.
      "이 브라우저에 저장된 일감과 수정 기록, 그리고 직접 만든 패키지와 옵션까지 모두 지울까요? 기본 패키지와 옵션은 보관해 둔 것까지 다시 살아나요. 지금까지 만든 일감 수와 체험·초대 코드 기간은 그대로 남아요. 이 작업은 되돌릴 수 없어요.",
    );
    if (confirmed) resetDemo();
  };

  return (
    <div className="pageSurface todayPage">
      <header className="pageHeader todayHeader">
        <div>
          <p className="todayDate">{todayHeading()}</p>
          <h1>오늘 할 일</h1>
          <p>급한 순서대로 꺼내뒀어요. 끝낸 일은 한 번만 눌러주세요.</p>
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

      <section className="todayBrief" aria-label="오늘 업무 요약">
        <div className="briefMessage">
          <span className="briefIcon"><BellRing size={18} /></span>
          <div>
            <strong>{primaryAlert ? primaryAlert.title : "놓치기 쉬운 일은 없어요"}</strong>
            <p>{primaryAlert ? (primaryAlert.kind === "revision" && !settings.privateNotificationDetails ? "새 수정요청이 들어왔어요. 상세에서 내용을 확인하세요." : primaryAlert.message) : "다음 마감과 고객 대기를 계속 계산할게요."}</p>
          </div>
        </div>
        <dl className="briefStats">
          <div><dt>오늘</dt><dd>{queue.length}</dd></div>
          <div><dt>고객 대기</dt><dd>{waitingJobs.length}</dd></div>
          <div><dt>수정 임박</dt><dd>{nearRevisionLimit.length}</dd></div>
        </dl>
      </section>

      <div className="dashboardGrid">
        <div className="dashboardPrimary">
          <section className="contentSection focusSection">
            <div className="sectionHeadingRow">
              <div>
                <h2>우선 처리</h2>
                <p>마감이 지난 일부터 보여줘요.</p>
              </div>
              <span className="sectionCount">{queue.length}개</span>
            </div>

            <div className="taskList">
              {queue.length > 0 ? (
                visibleQueue.map((item) => (
                  <QueueRow key={`${item.job.id}-${item.task.id}`} item={item} onComplete={handleComplete} />
                ))
              ) : (
                jobs.length === 0 ? (
                  <div className="clearState">
                    <PackageCheck size={24} />
                    <div>
                      <strong>첫 일감을 만들어 볼까요?</strong>
                      <span>고객·시작일·패키지·옵션만 고르면 마감과 할 일이 자동으로 준비돼요.</span>
                      {/* 첫 화면에서 갈 곳이 없으면 안내가 막다른 길이 된다. */}
                      <Link href="/jobs/new" className="clearStateCta">
                        첫 일감 만들기 <ArrowRight size={15} />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="clearState">
                    <CheckCircle2 size={24} />
                    <div><strong>급한 일은 모두 끝났어요</strong><span>마음 편히 다음 작업에 집중하세요.</span></div>
                  </div>
                )
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
              <div><h2>고객 답변 대기</h2><p>답이 오면 한 번 눌러 다시 작업 큐로 보내요.</p></div>
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
                        <span>{waitingTask?.title ?? "고객 답변 대기 중"}</span>
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
                return (
                  <Link href={`/jobs/${job.id}`} className="upcomingItem" key={job.id}>
                    <div className="upcomingTop"><span>{job.clientLabel}</span><strong>{getDday(job.dueDate)}</strong></div>
                    <p>{job.title}</p>
                    <div className="progressLine" aria-label={`${progress}% 완료`}><span style={{ width: `${progress}%` }} /></div>
                    <span className="progressCaption">{finished}/{job.tasks.length} 완료</span>
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

      {completedLabel && (
        <div className="actionToast" role="status">
          <CheckCircle2 size={19} />
          <span><strong>{completedLabel}</strong> 완료했어요</span>
          <button type="button" onClick={() => setCompletedLabel(null)}>닫기</button>
        </div>
      )}
    </div>
  );
}
