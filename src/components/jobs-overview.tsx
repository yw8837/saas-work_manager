"use client";

import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  BriefcaseBusiness,
  CalendarRange,
  Check,
  CheckCircle2,
  ListFilter,
  MessageSquareText,
  Plus,
  Search,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { displayJobTitle, normalizeOrderSource, ORDER_SOURCE_LABELS, ORDER_SOURCES, orderSourceLabel } from "@/lib/domain";
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
  const { filter, query, source } = readJobListLocation(search);
  const notice = new URLSearchParams(search).get("notice");
  const returnHref = jobListHref({ filter, query, source });

  // 상태·검색 거르기를 지난 일감. 받은 곳 거르기 숫자도 이것으로 세서 보이는 목록과 숫자가 맞게 한다.
  // 일감 수가 많지 않아 렌더마다 거른다(받은 곳 거르기가 이 결과를 다시 쓰므로 수동 메모는 두지 않음).
  const normalized = query.trim().toLocaleLowerCase("ko");
  const matched = jobs.filter((job) => {
    const waiting = job.tasks.some((task) => task.status === "waiting");
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && job.status === "active" && !waiting) ||
      (filter === "waiting" && waiting) ||
      (filter === "completed" && job.status === "completed");
    const matchesQuery =
      !normalized ||
      job.clientLabel.toLocaleLowerCase("ko").includes(normalized) ||
      job.title.toLocaleLowerCase("ko").includes(normalized) ||
      Boolean(orderSourceLabel(job.source)?.includes(normalized));
    return matchesFilter && matchesQuery;
  });
  const sourceCounts = ORDER_SOURCES.map((value) => ({
    value,
    count: matched.filter((job) => normalizeOrderSource(job.source) === value).length,
  }));
  const filtered = source ? matched.filter((job) => normalizeOrderSource(job.source) === source) : matched;
  // 받은 곳이 두 군데 이상일 때만 거르기 줄을 보인다. 거르는 중이면 풀 수 있게 그 칩은 남긴다.
  const showSourceFilters = sourceCounts.filter((item) => item.count > 0).length >= 2 || Boolean(source);
  const sourceChips = sourceCounts.filter((item) => item.count > 0 || item.value === source);

  return (
    <div className="pageSurface jobsPage">
      <header className="pageHeader">
        <div>
          <h1>일감</h1>
          <p>진행 중인 고객과 마감, 수정 잔여 횟수를 같이 봐요.</p>
        </div>
        <div className="pageHeaderActions">
          <Link href="/jobs/summary" className="secondaryButton" data-testid="open-monthly-summary">
            <CalendarRange size={18} /> 월별 정리
          </Link>
          <Link href="/jobs/new" className="primaryButton" data-testid="create-job-list">
            <Plus size={18} /> 새 일감
          </Link>
        </div>
      </header>
      {notice === "revision-unavailable" && (
        <p role="status">삭제되었거나 현재 계정에서 볼 수 없는 수정 요청이에요. 일감 목록을 확인해주세요.</p>
      )}
      {notice === "revision-connection" && (
        <p role="status">연결 문제로 수정 요청을 확인하지 못했어요. 연결을 확인한 뒤 알림을 다시 눌러주세요.</p>
      )}

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
              onClick={() => updateJobListLocation({ filter: value, query, source })}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="searchField">
          <Search size={17} />
          <span className="srOnly">고객 또는 일감 검색</span>
          <input value={query} maxLength={200} onChange={(event) => updateJobListLocation({ filter, query: event.target.value, source })} placeholder="고객 또는 일감 검색" />
        </label>
      </div>
      {showSourceFilters && (
        <div className="sourceFilters" role="group" aria-label="받은 곳 거르기">
          {sourceChips.map(({ value, count }) => {
            const pressed = source === value;
            return (
              <button
                key={value}
                type="button"
                className="sourceChip"
                aria-pressed={pressed}
                onClick={() => updateJobListLocation({ filter, query, ...(pressed ? {} : { source: value }) })}
                data-testid={`source-filter-${value}`}
              >
                {pressed && <Check size={14} aria-hidden="true" />}
                {ORDER_SOURCE_LABELS[value]} {count}
              </button>
            );
          })}
        </div>
      )}

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
          const rowSource = orderSourceLabel(job.source);
          return (
            <Link href={`/jobs/${job.id}?list=${encodeURIComponent(returnHref)}`} className="jobTableRow" key={job.id}>
              <div className="jobIdentity">
                <span className="jobInitial">{job.clientLabel.slice(0, 1)}</span>
                <div>
                  <strong>{job.clientLabel}</strong>
                  <span>
                    {displayJobTitle(job)}
                    {rowSource && <span className="jobRowSource" data-testid={`job-row-source-${job.id}`}> · {rowSource}</span>}
                  </span>
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
          ) : source ? (
            <div className="jobEmpty">
              <BriefcaseBusiness size={24} />
              <strong>{ORDER_SOURCE_LABELS[source]}에서 받은 일감이 없어요</strong>
              <button type="button" className="secondaryButton" onClick={() => updateJobListLocation({ filter, query })}>거르기 풀기</button>
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
