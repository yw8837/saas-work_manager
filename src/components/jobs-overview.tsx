"use client";

import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ListFilter,
  MessageSquareText,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import {
  emptyJobListSearch, jobListHref, jobListSearchSnapshot, readJobListLocation,
  subscribeJobListLocation, updateJobListLocation,
} from "@/lib/jobs-list-location";
import {
  formatShortDate,
  formatWon,
  getDday,
  getRevisionSummary,
  useWorkspace,
} from "./workspace-provider";

export function JobsOverview() {
  const { jobs } = useWorkspace();
  const search = useSyncExternalStore(subscribeJobListLocation, jobListSearchSnapshot, emptyJobListSearch);
  const { filter, query } = readJobListLocation(search);
  const returnHref = jobListHref({ filter, query });

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko");
    return jobs.filter((job) => {
      const waiting = job.tasks.some((task) => task.status === "waiting");
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && job.status === "active" && !waiting) ||
        (filter === "waiting" && waiting) ||
        (filter === "completed" && job.status === "completed");
      const matchesQuery =
        !normalized ||
        job.clientLabel.toLocaleLowerCase("ko").includes(normalized) ||
        job.title.toLocaleLowerCase("ko").includes(normalized);
      return matchesFilter && matchesQuery;
    });
  }, [filter, jobs, query]);

  return (
    <div className="pageSurface jobsPage">
      <header className="pageHeader">
        <div>
          <span className="pageEyebrow">한눈에 찾고, 바로 처리하세요</span>
          <h1>일감</h1>
          <p>진행 중인 고객과 마감, 수정 잔여 횟수를 같이 봐요.</p>
        </div>
        <Link href="/jobs/new" className="primaryButton" data-testid="create-job-list">
          <Plus size={18} /> 새 일감
        </Link>
      </header>

      <div className="jobToolbar">
        <div className="jobFilters" role="group" aria-label="일감 상태 필터">
          <ListFilter size={16} aria-hidden="true" />
          {([
            ["all", "전체"],
            ["active", "진행"],
            ["waiting", "고객 대기"],
            ["completed", "완료"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              data-active={filter === value}
              aria-pressed={filter === value}
              onClick={() => updateJobListLocation({ filter: value, query })}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="searchField">
          <Search size={17} />
          <span className="srOnly">고객 또는 일감 검색</span>
          <input value={query} maxLength={200} onChange={(event) => updateJobListLocation({ filter, query: event.target.value })} placeholder="고객 또는 일감 검색" />
        </label>
      </div>

      <section className="jobTable" aria-label="일감 목록">
        <div className="jobTableHead">
          <span>고객·일감</span>
          <span>상태</span>
          <span>진행</span>
          <span>수정</span>
          <span>금액</span>
          <span aria-hidden="true" />
        </div>
        {filtered.map((job) => {
          const waiting = job.tasks.some((task) => task.status === "waiting");
          const done = job.tasks.filter((task) => task.status === "done").length;
          const progress = Math.round((done / Math.max(job.tasks.length, 1)) * 100);
          const revision = getRevisionSummary(job);
          return (
            <Link href={`/jobs/${job.id}?list=${encodeURIComponent(returnHref)}`} className="jobTableRow" key={job.id}>
              <div className="jobIdentity">
                <span className="jobInitial">{job.clientLabel.slice(0, 1)}</span>
                <div>
                  <strong>{job.clientLabel}</strong>
                  <span>{job.title}</span>
                </div>
              </div>
              <div className="jobStatusCell">
                {job.status === "completed" ? (
                  <span className="statusBadge completed"><CheckCircle2 size={14} /> 완료</span>
                ) : waiting ? (
                  <span className="statusBadge waiting"><MessageSquareText size={14} /> 고객 대기</span>
                ) : (
                  <span className={job.dueDate < new Date().toISOString().slice(0, 10) ? "statusBadge delayed" : "statusBadge active"}>
                    {job.dueDate < new Date().toISOString().slice(0, 10) && <AlarmClock size={14} />}
                    {getDday(job.dueDate)}
                  </span>
                )}
                <small>{formatShortDate(job.dueDate)} 마감</small>
              </div>
              <div className="tableProgress">
                <span><b>{done}</b> / {job.tasks.length}</span>
                <div className="progressLine"><span style={{ width: `${progress}%` }} /></div>
              </div>
              <div className="revisionCell">
                <strong>{revision.remaining}회</strong>
                <span>남음</span>
              </div>
              <div className="amountCell">{formatWon(job.amount)}</div>
              <ArrowRight className="rowArrow" size={17} />
            </Link>
          );
        })}
        {filtered.length === 0 && (
          jobs.length === 0 ? (
            <div className="jobEmpty">
              <BriefcaseBusiness size={24} />
              <strong>아직 등록한 일감이 없어요</strong>
              <span>고객·시작일·패키지·옵션만 고르면 금액과 마감, 할 일이 한 번에 만들어져요.</span>
              <Link href="/jobs/new" className="primaryButton">첫 일감 만들기</Link>
            </div>
          ) : (
            <div className="jobEmpty">
              <BriefcaseBusiness size={24} />
              <strong>조건에 맞는 일감이 없어요</strong>
              <span>검색어나 필터를 바꿔보세요.</span>
            </div>
          )
        )}
      </section>
    </div>
  );
}
