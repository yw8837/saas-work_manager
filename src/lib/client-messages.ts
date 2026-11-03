/**
 * 일감 화면 '고객에게 보낼 말'의 상황별 카톡 문구.
 * client-share.ts와 같은 원칙: 고객 이름 인사로 시작하고, 금액·원가·남는 돈·받은 곳·작업자 연락처는 넣지 않는다.
 * 예외는 '추가 작업 안내' 하나다. 범위 밖 요청을 돈으로 바꾸려고 고객 동의를 받는 문구라, 작업자가 추가요청에 적은
 * 추가 금액·추가 기간만 넣는다(계약 금액·원가·남는 돈은 여기에도 넣지 않는다).
 * 링크는 켜져 있고 저장이 끝났을 때(link가 있을 때)만 넣는다. 완료한 일감은 고객 링크가 서버에서 막히니 넣지 않는다.
 */
import { clientShareMessage, greetingFor, startReminderMessage } from "./client-share";
import {
  type Addon,
  displayJobTitle,
  getRevisionSummary,
  pendingBriefQuestions,
  pendingIntakeLabels,
  type Job,
} from "./domain";

export type MessageSituation = "revision-done" | "remaining" | "waiting" | "review" | "start" | "addon" | "out-of-scope" | "delivery";

export const SITUATION_LABELS: Record<MessageSituation, string> = {
  "revision-done": "수정 반영 알림",
  remaining: "남은 것 요청",
  waiting: "답 기다림",
  review: "시안 확인 부탁",
  start: "시작 안내",
  addon: "추가 작업 안내",
  "out-of-scope": "범위 밖 안내",
  delivery: "납품 안내",
};

/** 위가 우선이다. 첫 상황이 처음부터 골라져 있다(아래 `availableSituations`가 상황에 따라 맨 앞으로 올리는 것이 있다). */
const SITUATION_ORDER: MessageSituation[] = ["revision-done", "remaining", "waiting", "review", "start", "addon", "out-of-scope", "delivery"];

function moveToFront(order: MessageSituation[], situation: MessageSituation): MessageSituation[] {
  return [situation, ...order.filter((item) => item !== situation)];
}

/** 추가 작업 안내에 넣을 추가요청: 초안이 있으면 초안 전부(만든 순서), 없으면 가장 최근에 확정한 것 하나. */
function addonsToAnnounce(job: Job): Addon[] {
  const drafts = job.addons.filter((addon) => addon.status === "draft");
  if (drafts.length > 0) return drafts;
  const confirmed = job.addons.filter((addon) => addon.status === "confirmed");
  return confirmed.length > 0 ? [confirmed[confirmed.length - 1]] : [];
}

function addonLine(addon: Addon): string {
  const amount = addon.amountDelta > 0 ? `추가 비용 ${new Intl.NumberFormat("ko-KR").format(addon.amountDelta)}원` : "추가 비용 없음";
  const days = addon.durationDaysDelta > 0 ? `기간 ${addon.durationDaysDelta}일 추가` : "마감은 그대로";
  // 요청 원문(문장)을 그대로 쓴 제목도 자연스럽게 이어지게 끝 마침표는 뗀다.
  return `- ${addon.title.trim().replace(/[.。]+$/, "")} (${amount}, ${days})`;
}

/** ISO 시각의 이 기기 날짜(YYYY-MM-DD). `localToday()`와 같은 기준이다. */
function localDateOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * 시작 안내를 이미 보낸 것으로 볼 일감인가. 보낸 기록(`startSharedAt`)이 없어도(그 칸이 생기기 전에 만든 일감 포함)
 * 이미 진행된 흔적이 하나라도 있으면 고객은 안내를 받은 것이다: 받은 자료, 답 받은 질문, 끝낸 할 일,
 * 수정 기록(고객 링크·직접 적은 것·반려한 것 모두), 추가요청.
 */
function startAlreadyShared(job: Job): boolean {
  return Boolean(job.startSharedAt)
    || (job.intakeItems ?? []).some((item) => Boolean(item.receivedAt))
    || (job.briefQuestions ?? []).some((question) => Boolean(question.answeredAt))
    || job.tasks.some((task) => task.status === "done")
    || job.revisions.length > 0
    || job.addons.length > 0;
}

/**
 * 지금 일감 상태에 맞는 상황만 우선순위대로 준다. `today`는 이 기기 날짜(`localToday()`).
 * 반려·되돌린 수정 요청은 세지 않는다. 시작 안내를 아직 안 보낸 진행 중 일감은 첫 연락이라 시작 안내가 맨 앞이다.
 * 보낸 기록이 없어도 진행된 흔적이 있으면 이미 보낸 것으로 본다(`startAlreadyShared`).
 * 고객 동의를 기다리는 추가요청 초안이 있으면 '추가 작업 안내'가 맨 앞이다.
 * 납품 안내는 완료 전에도 끝에 있고, 일감을 완료했거나 할 일을 다 끝냈으면 맨 앞이다(이게 가장 우선).
 */
export function availableSituations(job: Job, today: string): MessageSituation[] {
  const active = job.status === "active";
  const liveRevisions = job.revisions.filter((revision) => !revision.revertedAt);
  const liveTasks = job.tasks.filter((task) => task.status !== "cancelled");
  // '추가 작업으로'에서 만든 추가요청(취소 안 함)이 연결된 요청은 금액을 정했으니 '추가 작업 안내'로 보낸다.
  const pricedRevisionIds = new Set(
    job.addons.filter((addon) => addon.status !== "cancelled" && addon.sourceRevisionId).map((addon) => addon.sourceRevisionId),
  );
  const matches: Record<MessageSituation, boolean> = {
    // 오늘 '수정 완료'를 누른 진행 중 일감. 끝난 일감에는 더 고칠 부분을 묻지 않는다.
    "revision-done": active && liveRevisions.some(
      (revision) => revision.usage === "used" && Boolean(revision.completedAt) && localDateOf(revision.completedAt!) === today,
    ),
    remaining: active && (pendingIntakeLabels(job).length > 0 || pendingBriefQuestions(job).length > 0),
    waiting: active && job.tasks.some((task) => task.status === "waiting"),
    review: active,
    start: active,
    addon: job.addons.some((addon) => addon.status !== "cancelled"),
    // 금액·기간을 정한 추가요청이 생기면 그 문구('추가 작업 안내')로 보낸다. 여기는 아직 금액을 안 정한 범위 밖 요청만.
    "out-of-scope": liveRevisions.some((revision) => revision.usage === "extra_scope" && !pricedRevisionIds.has(revision.id)),
    delivery: active || job.status === "completed",
  };
  const deliveryFirst = job.status === "completed" || (liveTasks.length > 0 && liveTasks.every((task) => task.status === "done"));
  let order = SITUATION_ORDER;
  if (job.addons.some((addon) => addon.status === "draft")) order = moveToFront(order, "addon");
  if (active && !startAlreadyShared(job)) order = moveToFront(order, "start");
  if (deliveryFirst) order = moveToFront(order, "delivery");
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
        dueDate: job.dueDate,
        link,
        pendingIntake: pendingIntakeLabels(job),
        pendingQuestions: pendingBriefQuestions(job),
      });
    case "addon": {
      const addons = addonsToAnnounce(job);
      // 알릴 추가요청이 없으면(목록에 안 나오는 경우) 범위 밖 안내와 같은 말을 쓴다.
      if (addons.length === 0) return situationMessage("out-of-scope", input);
      return [
        greeting,
        "말씀하신 내용은 처음 정한 범위 밖이라 추가 작업으로 안내드려요.",
        ...addons.map(addonLine),
        "진행할까요? 괜찮으시면 이 대화로 답 주세요.",
      ].join("\n");
    }
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
