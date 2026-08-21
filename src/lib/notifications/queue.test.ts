import { describe, expect, it } from "vitest";
import { composeJob, recordRevision, updateTaskStatus, type PackageTemplate } from "@/lib/domain";
import { deriveInAppAlerts } from "./queue";
import type { AppSettings } from "@/lib/store";

const settings: AppSettings = {
  morningDigestEnabled: true,
  morningDigestTime: "09:00",
  deadlineAlertsEnabled: true,
  deadlineAlertTime: "09:00",
  deadlineOffsets: [2, 1, 0],
  waitingAlertsEnabled: true,
  waitingAlertTime: "10:00",
  waitingOffsets: [2, 5],
  revisionAlertsEnabled: true,
  revisionAlertTime: "즉시",
  privateNotificationDetails: true,
};

const template: PackageTemplate = {
  id: "pkg_alert",
  name: "알림 패키지",
  price: 100_000,
  estimatedCost: 0,
  durationDays: 2,
  revisionLimit: 1,
  tasks: [{ taskKey: "brief", title: "브리프 확인", relativeDay: 0, order: 0 }],
};

describe("deriveInAppAlerts", () => {
  it("D-2 마감, 2일 고객대기, 새 수정요청을 실제 일감 상태에서 계산한다", () => {
    const dueSoon = composeJob({ jobId: "due-soon", clientLabel: "마감 고객", startDate: "2026-08-15", package: template });
    let waiting = composeJob({ jobId: "waiting", clientLabel: "대기 고객", startDate: "2026-08-01", package: template });
    waiting = updateTaskStatus(waiting, waiting.tasks[0].id, "waiting", "2026-08-13T01:00:00.000Z");
    let revision = composeJob({ jobId: "revision", clientLabel: "수정 고객", startDate: "2026-08-01", package: template });
    revision = recordRevision(revision, { source: "public", body: "메인 문구를 바꿔주세요.", submittedAt: "2026-08-15T01:00:00.000Z" }).job;

    const alerts = deriveInAppAlerts([dueSoon, waiting, revision], settings, "2026-08-15", "08:00");

    expect(alerts.map((alert) => alert.kind)).toEqual(expect.arrayContaining(["deadline", "waiting", "revision"]));
    expect(alerts.find((alert) => alert.jobId === dueSoon.id && alert.kind === "deadline")?.title).toContain("D-2");
    expect(alerts.find((alert) => alert.kind === "waiting")?.title).toContain("2일째");
    expect(alerts.find((alert) => alert.kind === "revision")?.message).toBe("메인 문구를 바꿔주세요.");
  });

  it("종류별 토글을 끄면 해당 알림은 큐에서 제외한다", () => {
    const job = composeJob({ jobId: "due-off", clientLabel: "알림 끔", startDate: "2026-08-15", package: template });
    // 브리핑 시각(09:00) 전 시점을 넘겨 마감 알림만 남는지 그대로 확인한다.
    const alerts = deriveInAppAlerts([job], { ...settings, deadlineAlertsEnabled: false }, "2026-08-15", "08:00");
    expect(alerts).toHaveLength(0);
  });
});

describe("매일 브리핑", () => {
  const digestOnly: AppSettings = {
    ...settings,
    deadlineAlertsEnabled: false,
    waitingAlertsEnabled: false,
    revisionAlertsEnabled: false,
  };

  function digestJobs() {
    // 오늘(2026-08-15) 기한인 할 일 1개 + 고객 대기 1개 + 새 수정요청 1개.
    const today = composeJob({ jobId: "digest-today", clientLabel: "오늘 고객", startDate: "2026-08-15", package: template });
    let waiting = composeJob({ jobId: "digest-waiting", clientLabel: "대기 고객", startDate: "2026-08-01", package: template });
    waiting = updateTaskStatus(waiting, waiting.tasks[0].id, "waiting", "2026-08-14T01:00:00.000Z");
    let revision = composeJob({ jobId: "digest-revision", clientLabel: "수정 고객", startDate: "2026-08-01", package: template });
    revision = recordRevision(revision, { source: "public", body: "문구 교체", submittedAt: "2026-08-15T01:00:00.000Z" }).job;
    return [today, waiting, revision];
  }

  it("브리핑 시각이 지나면 오늘 처리·고객 대기·수정 요청 요약을 큐에 올린다", () => {
    const alerts = deriveInAppAlerts(digestJobs(), digestOnly, "2026-08-15", "09:30");
    const digest = alerts.find((alert) => alert.kind === "digest");

    expect(digest).toBeDefined();
    expect(digest?.title).toBe("오늘의 브리핑");
    expect(digest?.message).toBe("오늘 처리 2건 · 고객 대기 1건 · 수정 요청 1건");
    expect(digest?.occurredAt).toBe("2026-08-15T09:00:00+09:00");
  });

  it("아직 브리핑 시각 전이면 큐에 올리지 않는다", () => {
    const alerts = deriveInAppAlerts(digestJobs(), digestOnly, "2026-08-15", "08:59");
    expect(alerts.find((alert) => alert.kind === "digest")).toBeUndefined();
  });

  it("토글을 끄면 시각이 지나도 브리핑을 만들지 않는다", () => {
    const alerts = deriveInAppAlerts(
      digestJobs(),
      { ...digestOnly, morningDigestEnabled: false },
      "2026-08-15",
      "23:00",
    );
    expect(alerts).toHaveLength(0);
  });

  it("활성 일감이 없으면 0건 브리핑으로 소음을 만들지 않는다", () => {
    const alerts = deriveInAppAlerts([], digestOnly, "2026-08-15", "09:30");
    expect(alerts).toHaveLength(0);
  });
});
