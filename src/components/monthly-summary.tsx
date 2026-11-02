"use client";

import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { displayJobTitle, orderSourceLabel } from "@/lib/domain";
import {
  dateKeyOf,
  monthKeyOf,
  monthlySummary,
  shiftMonth,
  summaryCsv,
  summaryCsvFileName,
  type SummaryCsvRange,
} from "@/lib/summary/monthly";
import { formatShortDate, formatWon, useWorkspace } from "./workspace-provider";

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function monthNumber(month: string) {
  return Number(month.slice(5, 7));
}

/**
 * 월별 정리: 완료한 달 기준으로 매출·예상 원가·남는 돈을 숫자 줄로 보여 주고 표 파일(CSV)로 내려받는다.
 * 세금 계산이나 신고는 하지 않는다(화면 맨 위 안내). 달 경계는 이 기기의 시간대로 나눈다.
 */
export function MonthlySummary({ timeZone = browserTimeZone() }: { timeZone?: string }) {
  const { jobs } = useWorkspace();
  const [currentMonth] = useState(() => monthKeyOf(new Date().toISOString(), timeZone));
  const [month, setMonth] = useState(currentMonth);
  const [downloaded, setDownloaded] = useState<{ fileName: string } | null>(null);
  const summary = monthlySummary(jobs, month, timeZone);
  const year = month.slice(0, 4);
  const monthLabel = `${monthNumber(month)}월`;

  useEffect(() => {
    if (!downloaded) return;
    const timer = window.setTimeout(() => setDownloaded(null), 6000);
    return () => window.clearTimeout(timer);
  }, [downloaded]);

  const download = (range: SummaryCsvRange) => {
    const fileName = summaryCsvFileName(range);
    const url = URL.createObjectURL(new Blob([summaryCsv(jobs, range, timeZone)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloaded({ fileName });
  };

  return (
    <div className="pageSurface monthlySummaryPage">
      <header className="formPageHeader">
        <div className="formTitleLine">
          <Link href="/jobs" className="iconButton backButton" aria-label="일감 목록으로 돌아가기">
            <ArrowLeft size={19} />
          </Link>
          <div>
            <h1>월별 정리</h1>
            <p>세금 신고 때 참고하려고 모은 정리예요. 세금 계산이나 신고는 하지 않아요.</p>
          </div>
        </div>
      </header>

      <div className="summaryMonthNav">
        <button
          type="button"
          className="iconButton"
          aria-label="이전 달"
          onClick={() => setMonth(shiftMonth(month, -1))}
          data-testid="summary-prev-month"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 aria-live="polite" data-testid="summary-month-title">{year}년 {monthLabel}</h2>
        <button
          type="button"
          className="iconButton"
          aria-label="다음 달"
          disabled={month >= currentMonth}
          onClick={() => setMonth(shiftMonth(month, 1))}
          data-testid="summary-next-month"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <section className="summarySection" aria-label={`${monthLabel} 합계`}>
        <dl className="summaryTotals">
          <div><dt>완료 주문</dt><dd data-testid="summary-total-count">{summary.totals.count}건</dd></div>
          <div><dt>주문 금액 합계</dt><dd data-testid="summary-total-amount">{formatWon(summary.totals.amount)}</dd></div>
          <div><dt>예상 원가</dt><dd data-testid="summary-total-cost">{formatWon(summary.totals.estimatedCost)}</dd></div>
          <div><dt>남는 돈(예상)</dt><dd data-testid="summary-total-margin">{formatWon(summary.totals.margin)}</dd></div>
        </dl>
        <p className="summaryInProgress" data-testid="summary-in-progress">
          진행 중 {summary.inProgress.count}건 · {formatWon(summary.inProgress.amount)} (합계에 안 넣음)
        </p>
        <div className="summaryDownloads">
          <button
            type="button"
            className="secondaryButton"
            onClick={() => download({ kind: "month", month })}
            data-testid="summary-download-month"
          >
            <Download size={16} /> {monthLabel} 내려받기
          </button>
          <button
            type="button"
            className="secondaryButton"
            onClick={() => download({ kind: "year", year })}
            data-testid="summary-download-year"
          >
            <Download size={16} /> {year}년 전체 내려받기
          </button>
        </div>
      </section>

      {summary.bySource.length > 0 && (
        <section className="summarySection" aria-labelledby="summary-source-title">
          <h3 id="summary-source-title">받은 곳별</h3>
          <ul className="summarySourceList">
            {summary.bySource.map((item) => (
              <li key={item.source} data-testid={`summary-source-${item.source}`}>
                <span>{item.label}</span>
                <span>{item.count}건</span>
                <strong>{formatWon(item.amount)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="summarySection" aria-labelledby="summary-rows-title">
        <h3 id="summary-rows-title">{monthLabel}에 완료한 주문</h3>
        {summary.rows.length > 0 ? (
          <ul className="summaryRows">
            {summary.rows.map(({ job, completedAt, completedAtEstimated }) => {
              const source = orderSourceLabel(job.source);
              return (
                <li key={job.id}>
                  <Link href={`/jobs/${job.id}`} className="summaryRow" data-testid={`summary-row-${job.id}`}>
                    <span className="summaryRowMain">
                      <small>
                        {formatShortDate(dateKeyOf(completedAt, timeZone))} 완료
                        {completedAtEstimated && " · 완료 시각 기록 전"}
                      </small>
                      <strong>{job.clientLabel}</strong>
                      <span>{displayJobTitle(job)}{source ? ` · ${source}` : ""}</span>
                    </span>
                    <span className="summaryRowAmount">{formatWon(job.amount)}</span>
                    <ChevronRight className="rowArrow" size={17} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="jobEmpty summaryEmpty">
            <FileText size={24} aria-hidden="true" />
            <strong>{monthLabel}에 완료한 주문이 없어요</strong>
            <span>일감을 완료하면 여기에 모여요.</span>
            <Link href="/jobs?filter=active" className="secondaryButton">진행 중 일감 보기</Link>
          </div>
        )}
      </section>

      <p className="summaryFootnote">금액은 주문 조건과 확정한 추가요청 기준이에요.</p>

      {downloaded && (
        <div className="actionToast" role="status">
          <Download size={18} aria-hidden="true" />
          <span>{downloaded.fileName}를 내려받았어요</span>
          <button type="button" onClick={() => setDownloaded(null)}>닫기</button>
        </div>
      )}
    </div>
  );
}
