/**
 * 일감 화면 '고객에게 보낼 말'의 상황별 카톡 문구.
 * client-share.ts와 같은 원칙: 고객 이름 인사로 시작하고, 금액·원가·남는 돈·받은 곳·작업자 연락처는 넣지 않는다.
 * 링크는 켜져 있고 저장이 끝났을 때(link가 있을 때)만 넣는다. 완료한 일감은 고객 링크가 서버에서 막히니 넣지 않는다.
 */
import { clientShareMessage, greetingFor, startReminderMessage } from "./client-share";
import {
  displayJobTitle,
  getRevisionSummary,
  pendingBriefQuestions,
  pendingIntakeLabels,
  type Job,
} from "./domain";

export type MessageSituation = "revision-done" | "remaining" | "waiting" | "review" | "start" | "out-of-scope" | "delivery";

export const SITUATION_LABELS: Record<MessageSituation, string> = {
  "revision-done": "수정 반영 알림",
  remaining: "남은 것 요청",
  waiting: "답 기다림",
  review: "시안 확인 부탁",
  start: "시작 안내",
  "out-of-scope": "범위 밖 안내",
  delivery: "납품 안내",
};

/** 위가 우선이다. 첫 상황이 처음부터 골라져 있다. */
const SITUATION_ORDER: MessageSituation[] = ["revision-done", "remaining", "waiting", "review", "start", "out-of-scope", "delivery"];

/** ISO 시각의 이 기기 날짜(YYYY-MM-DD). `localToday()`와 같은 기준이다. */
function localDateOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * 지금 일감 상태에 맞는 상황만 우선순위대로 준다. `today`는 이 기기 날짜(`localToday()`).
 * 반려·되돌린 수정 요청은 세지 않는다. 시작 안내를 아직 안 보낸 진행 중 일감은 첫 연락이라 시작 안내가 맨 앞이다.
 * 보낸 기록이 없어도 고객이 링크로 요청을 남겼으면 이미 받은 것으로 본다(첫 실행 체크리스트와 같은 기준).
 */
export function availableSituations(job: Job, today: string): MessageSituation[] {
  const active = job.status === "active";
  const customerUsedLink = job.revisions.some((revision) => revision.source === "public");
  const liveRevisions = job.revisions.filter((revision) => !revision.revertedAt);
  const liveTasks = job.tasks.filter((task) => task.status !== "cancelled");
  const matches: Record<MessageSituation, boolean> = {
    // 오늘 '수정 완료'를 누른 진행 중 일감. 끝난 일감에는 더 고칠 부분을 묻지 않는다.
    "revision-done": active && liveRevisions.some(
      (revision) => revision.usage === "used" && Boolean(revision.completedAt) && localDateOf(revision.completedAt!) === today,
    ),
    remaining: active && (pendingIntakeLabels(job).length > 0 || pendingBriefQuestions(job).length > 0),
    waiting: active && job.tasks.some((task) => task.status === "waiting"),
    review: active,
    start: active,
    "out-of-scope": liveRevisions.some((revision) => revision.usage === "extra_scope") || job.addons.some((addon) => addon.status === "draft"),
    delivery: job.status === "completed" || (liveTasks.length > 0 && liveTasks.every((task) => task.status === "done")),
  };
  const order: MessageSituation[] = active && !job.startSharedAt && !customerUsedLink
    ? ["start", ...SITUATION_ORDER.filter((situation) => situation !== "start")]
    : SITUATION_ORDER;
  return order.filter((situation) => matches[situation]);
}

export function situationMessage(situation: MessageSituation, input: { job: Job; link: string | null }): string {
  const { job } = input;
  // 완료한 일감은 고객 링크가 서버에서 막히므로, 넘겨받아도 넣지 않는다.
  const link = job.status === "active" ? input.link : null;
  const revision = getRevisionSummary(job);
  const title = displayJobTitle(job).trim();
  const greeting = greetingFor(job.clientLabel);
  // 포함 수정을 다 쓴 주문에는 '링크에 남겨 주세요' 대신 추가 작업으로 따로 말한다고 쓴다.
  const allUsed = revision.included > 0 && revision.remaining <= 0;

  switch (situation) {
    case "revision-done": {
      const lines = [
        `요청하신 수정을 반영했어요. 포함 수정 ${revision.included}회 중 ${revision.used}회를 썼고, 남은 수정은 ${revision.remaining}회예요.`,
      ];
      if (allUsed) lines.push("다음 요청부터는 추가 작업으로 따로 말씀드릴게요.");
      else if (link) lines.push("확인해 보시고 더 고칠 부분은 아래 링크에 한 번에 남겨 주세요.", link);
      else lines.push("확인해 보시고 더 고칠 부분은 이 대화로 한 번에 말씀해 주세요.");
      return [greeting, ...lines].join("\n");
    }
    case "remaining":
      return startReminderMessage({ clientLabel: job.clientLabel, pendingIntake: pendingIntakeLabels(job), pendingQuestions: pendingBriefQuestions(job) });
    case "waiting":
      return [
        greeting,
        "혹시 앞서 여쭤본 내용 보셨을까요? 답을 주시면 바로 이어서 진행할게요.",
        "급한 건 아니니 편하실 때 알려 주세요.",
      ].join("\n");
    case "review": {
      const lines = ["작업한 것을 보내 드려요."];
      if (allUsed) {
        lines.push(`확인해 주세요. 포함 수정 ${revision.included}회를 모두 써서, 다음 요청부터는 추가 작업으로 따로 말씀드릴게요.`);
      } else {
        lines.push(link ? "확인해 보시고 고칠 부분은 아래 링크에 한 번에 남겨 주세요." : "확인해 보시고 고칠 부분은 이 대화로 한 번에 말씀해 주세요.");
        if (revision.included > 0) lines.push(`남은 포함 수정은 ${revision.remaining}회예요.`);
        if (link) lines.push(link);
      }
      return [greeting, ...lines].join("\n");
    }
    case "start":
      return clientShareMessage({
        clientLabel: job.clientLabel,
        title,
        included: revision.included,
        remaining: revision.remaining,
        link,
        pendingIntake: pendingIntakeLabels(job),
        pendingQuestions: pendingBriefQuestions(job),
      });
    case "out-of-scope":
      return [
        greeting,
        "말씀하신 내용은 처음 정한 작업 범위 밖이라 추가 작업으로 따로 진행돼요.",
        "진행을 원하시면 비용과 일정을 정리해 알려 드릴게요.",
      ].join("\n");
    case "delivery":
      return [
        greeting,
        `${title ? `${title} ` : ""}작업을 모두 마쳤어요. 최종 결과물은 이 대화로 보내 드릴게요.`,
        // 포함 수정이 남아 있으면 남은 횟수를 알린다. 다 썼거나 없으면 그대로 편하게 말하라고만 쓴다.
        revision.remaining > 0
          ? `맡겨 주셔서 감사합니다. 포함 수정이 ${revision.remaining}회 남아 있으니, 고칠 부분이 보이면 이 대화로 말씀해 주세요.`
          : "맡겨 주셔서 감사합니다. 더 필요한 게 생기면 이 대화로 편하게 말씀해 주세요.",
      ].join("\n");
  }
}
