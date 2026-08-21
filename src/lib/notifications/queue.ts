import type { InAppAlert, Job } from "@/lib/domain";
import type { AppSettings } from "@/lib/store";

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function localTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function dayDistance(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.slice(0, 10).split("-").map(Number);
  const [toYear, toMonth, toDay] = to.slice(0, 10).split("-").map(Number);
  const fromDate = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toDate = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((toDate - fromDate) / 86_400_000);
}

function timeFor(date: string, time: string): string {
  return `${date}T${time === "즉시" ? "09:00" : time}:00+09:00`;
}

export function deriveInAppAlerts(
  jobs: Job[],
  settings: AppSettings,
  referenceDate = localToday(),
  referenceTime = localTime(),
): InAppAlert[] {
  const alerts: InAppAlert[] = [];
  const activeJobs = jobs.filter((job) => job.status === "active");

  /**
   * 설정한 브리핑 시각이 지난 뒤에만 오늘치 요약을 한 줄로 올린다.
   * 일감이 하나도 없으면 0건 브리핑은 소음이라 만들지 않는다.
   */
  if (settings.morningDigestEnabled && activeJobs.length > 0 && referenceTime >= settings.morningDigestTime) {
    const dueToday = activeJobs.reduce(
      (total, job) => total + job.tasks.filter((task) => task.status === "todo" && task.dueDate <= referenceDate).length,
      0,
    );
    const waitingJobs = activeJobs.filter((job) => job.tasks.some((task) => task.status === "waiting")).length;
    const openRevisions = activeJobs.reduce(
      (total, job) =>
        total + job.revisions.filter((revision) => revision.status === "new" || revision.status === "extra_scope").length,
      0,
    );
    alerts.push({
      id: `digest:${referenceDate}`,
      kind: "digest",
      jobId: "",
      title: "오늘의 브리핑",
      message: `오늘 처리 ${dueToday}건 · 고객 대기 ${waitingJobs}건 · 수정 요청 ${openRevisions}건`,
      occurredAt: timeFor(referenceDate, settings.morningDigestTime),
      severity: "info",
    });
  }

  if (settings.deadlineAlertsEnabled) {
    for (const job of activeJobs) {
      const days = dayDistance(referenceDate, job.dueDate);
      if (days < 0) {
        alerts.push({
          id: `deadline-overdue:${job.id}`,
          kind: "deadline",
          jobId: job.id,
          title: `${job.clientLabel} 마감이 지났어요`,
          message: `${Math.abs(days)}일 지연 · ${job.title}`,
          occurredAt: timeFor(referenceDate, settings.deadlineAlertTime),
          severity: "urgent",
        });
      } else if (settings.deadlineOffsets.includes(days)) {
        const label = days === 0 ? "오늘 마감" : `D-${days}`;
        alerts.push({
          id: `deadline:${job.id}:${days}`,
          kind: "deadline",
          jobId: job.id,
          title: `${job.clientLabel} ${label}`,
          message: `${job.title} · ${job.dueDate.slice(5).replace("-", "/")} 마감`,
          occurredAt: timeFor(referenceDate, settings.deadlineAlertTime),
          severity: days === 0 ? "urgent" : "attention",
        });
      }
    }
  }

  if (settings.waitingAlertsEnabled) {
    for (const job of activeJobs) {
      const waitingTask = job.tasks.find((task) => task.status === "waiting");
      if (!waitingTask?.waitingSince) continue;
      const waitingDays = Math.max(1, dayDistance(waitingTask.waitingSince, referenceDate));
      const isFiveDayOrMore = settings.waitingOffsets.includes(5) && waitingDays >= 5;
      const isConfiguredDay = settings.waitingOffsets.includes(waitingDays);
      if (!isConfiguredDay && !isFiveDayOrMore) continue;
      const high = waitingDays >= 5;
      alerts.push({
        id: `waiting:${job.id}:${high ? "5plus" : waitingDays}`,
        kind: "waiting",
        jobId: job.id,
        taskId: waitingTask.id,
        title: `${job.clientLabel} 답변 대기 ${waitingDays}일째`,
        message: `${waitingTask.title} · 연락하거나 답변 받음으로 처리하세요.`,
        occurredAt: timeFor(referenceDate, settings.waitingAlertTime),
        severity: high ? "urgent" : "attention",
      });
    }
  }

  if (settings.revisionAlertsEnabled) {
    for (const job of activeJobs) {
      for (const revision of job.revisions.filter((item) => item.status === "new" || item.status === "extra_scope")) {
        alerts.push({
          id: `revision:${revision.id}`,
          kind: "revision",
          jobId: job.id,
          revisionId: revision.id,
          title: revision.usage === "extra_scope" ? `${job.clientLabel} 추가 작업 검토` : `${job.clientLabel} 새 수정요청`,
          message: revision.body,
          occurredAt: revision.submittedAt,
          severity: revision.usage === "extra_scope" ? "attention" : "info",
        });
      }
    }
  }

  const severityOrder = { urgent: 0, attention: 1, info: 2 } as const;
  return alerts.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.occurredAt.localeCompare(a.occurredAt),
  );
}
