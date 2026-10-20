"use client";
import { useEffect, useState } from "react";
import { loadNativeOfflineSnapshot, type OfflineSnapshot } from "@/lib/native/offline";
import styles from "./native-offline-workspace.module.css";

export function NativeOfflineWorkspace() {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void loadNativeOfflineSnapshot().then((saved) => { if (active) setSnapshot(saved); });
    return () => { active = false; };
  }, []);
  return (
    <main className={styles.page}>
      <header>
        <p className={styles.label}>일감체크 · 읽기 전용</p>
        <h1>연결을 기다리고 있어요</h1>
        <p>마지막으로 서버에서 확인한 내용이에요. 새 요청과 변경 사항은 연결 후 확인해주세요.</p>
        <button className="primaryButton" onClick={() => window.location.reload()}>연결 다시 확인</button>
      </header>
      {snapshot === undefined ? <p role="status">이 기기의 저장본을 확인하고 있어요.</p> : snapshot ? (
        <>
          <p role="status">확인 시각: {new Date(snapshot.confirmedAt).toLocaleString("ko-KR")}<br />
            진행 일감 {snapshot.totalJobs}건{snapshot.totalJobs > 30 ? " 중 마감이 빠른 30건" : ""}</p>
          <section aria-label="마지막으로 확인한 일감" className={styles.list}>
            {snapshot.jobs.map((job) => (
              <article key={job.id} className={styles.job}>
                <h2>{job.clientLabel}</h2>
                <p>{job.title}</p>
                <p>마감 {job.dueDate} · 완료 {job.doneTasks}/{job.totalTasks} · 수정 {job.remainingRevisions}회 남음</p>
                {job.tasks.length > 0 && <details><summary>남은 할 일 · 최대 5개</summary>
                  <ul>{job.tasks.map((task, index) => <li key={index}>{task}</li>)}</ul>
                </details>}
              </article>
            ))}
            {snapshot.jobs.length === 0 && <p>저장본에 진행 중인 일감이 없어요.</p>}
          </section>
        </>
      ) : <p role="status">이 기기에서 확인할 수 있는 저장본이 없어요. 인터넷에 연결한 뒤 다시 시도해주세요.</p>}
    </main>
  );
}
