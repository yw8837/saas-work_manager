"use client";

import Link from "next/link";
import {
  AlarmClock,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  ListChecks,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  PackageCheck,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  TrendingUp,
  Undo2,
  UserRoundCheck,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { emptyJobListSearch, jobListReturnHref, jobListSearchSnapshot, subscribeJobListLocation } from "@/lib/jobs-list-location";
import { revisionPortalUrl } from "@/lib/client-share";
import { markFirstRun } from "@/lib/first-run";
import { localToday } from "@/lib/store";
import { ClientMessages } from "./client-messages";
import { SendToClientBanner } from "./send-to-client-banner";
import { StartChecklist } from "./start-checklist";
import { displayJobTitle, marginShortfall, marginWarningText, normalizeOrderSource, ORDER_SOURCE_LABELS, ORDER_SOURCES, pendingBriefQuestions, pendingIntakeLabels } from "@/lib/domain";
import { deploymentOrigin } from "@/lib/deployment-origin";
import { nativePlatform } from "@/lib/native/platform";
import {
  formatShortDate,
  formatWon,
  getDday,
  getRevisionSummary,
  useWorkspace,
  type JobLink,
} from "./workspace-provider";

const channelLabels = {
  kakao: "카카오톡",
  kmong: "크몽",
  soomgo: "숨고",
  instagram: "인스타그램",
  discord: "디스코드",
  phone: "전화",
  other: "기타",
} as const;

function formatTimelineDate(value: string) {
  const utc = new Date(value);
  const kst = new Date(utc.getTime() + 9 * 60 * 60 * 1000);
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const hour = String(kst.getUTCHours()).padStart(2, "0");
  const minute = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${month}월 ${day}일 ${hour}:${minute}`;
}

export function JobDetail({ jobId }: { jobId: string }) {
  const {
    jobs,
    settings,
    hydrated,
    runtimeMode,
    saveStatus,
    toggleTask,
    toggleIntake,
    toggleBriefQuestion,
    updateBriefNote,
    toggleJobWaiting,
    completeJob,
    setJobSource,
    deleteJob,
    setRevisionPortalEnabled,
    rotateRevisionPortalToken,
    recordRevision,
    revertRevision,
    completeRevision,
    markRevisionExtraScope,
    updateJobLinks,
    createAddon,
    confirmAddon,
    cancelAddon,
  } = useWorkspace();
  const router = useRouter();
  const locationSearch = useSyncExternalStore(subscribeJobListLocation, jobListSearchSnapshot, emptyJobListSearch);
  const listHref = jobListReturnHref(locationSearch);
  const job = jobs.find((item) => item.id === jobId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  // 휴대폰에서 금액·원가·남는 돈 칸은 '금액 보기'를 눌렀을 때만 보인다(데스크톱은 늘 6칸).
  const [moneyOpen, setMoneyOpen] = useState(false);
  const handleDeleteJob = () => {
    if (!job) return;
    if (!window.confirm(`'${job.clientLabel}' 일감을 삭제할까요? 관련 할 일·수정 기록도 함께 사라지고, 되돌릴 수 없어요.`)) return;
    deleteJob(job.id);
    router.push("/jobs");
  };
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionBody, setRevisionBody] = useState("");
  const [revisionFocusRequest, setRevisionFocusRequest] = useState(0);
  const revisionSectionRef = useRef<HTMLElement>(null);
  const revisionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [channel, setChannel] = useState<keyof typeof channelLabels>("kakao");
  const [copied, setCopied] = useState(false);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkDrafts, setLinkDrafts] = useState<JobLink[]>([]);
  const [linkError, setLinkError] = useState("");
  const [revertTargetId, setRevertTargetId] = useState<string | null>(null);
  const [revertReason, setRevertReason] = useState("");
  const [addonOpen, setAddonOpen] = useState(false);
  const [addonTitle, setAddonTitle] = useState("");
  const [addonAmount, setAddonAmount] = useState("0");
  const [addonCost, setAddonCost] = useState("0");
  const [addonDays, setAddonDays] = useState("0");
  const [addonTaskTitle, setAddonTaskTitle] = useState("");
  const [addonTaskDay, setAddonTaskDay] = useState("0");
  // 처리 결과는 화면 아래 알림 하나로 보인다(맨 아래 문단은 휴대폰에서 안 보임). 일감 완료만 '되돌리기'를 단다.
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error"; undo?: { linkWasOn: boolean } } | null>(null);
  const [sendBannerDismissed, setSendBannerDismissed] = useState(false);
  const sendBannerRequested = useMemo(() => {
    const params = new URLSearchParams(locationSearch);
    return params.get("created") === "1" || params.get("send") === "1";
  }, [locationSearch]);

  const revision = useMemo(() => (job ? getRevisionSummary(job) : null), [job]);
  const hydratedJobId = hydrated ? job?.id : undefined;
  useEffect(() => {
    if (hydratedJobId && window.location.hash === "#revisions") {
      revisionSectionRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, [hydratedJobId]);

  useEffect(() => {
    if (!revisionOpen || revisionFocusRequest === 0) return;

    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      revisionSectionRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
      revisionTextareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [revisionFocusRequest, revisionOpen]);

  useEffect(() => {
    // 오류는 읽고 닫을 때까지 두고, 처리 결과는 잠시 뒤 닫는다(되돌리기가 있으면 조금 더 길게).
    if (!notice || notice.tone === "error") return;
    const timer = window.setTimeout(() => setNotice(null), notice.undo ? 6000 : 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!hydrated) {
    return <div className="pageSurface missingJob" role="status" aria-live="polite"><p>일감을 불러오고 있어요.</p></div>;
  }

  if (!job || !revision) {
    return (
      <div className="pageSurface missingJob">
        <FileText size={30} />
        <h1>일감을 찾을 수 없어요</h1>
        <p>데이터를 초기화했거나 주소가 달라진 것 같아요.</p>
        <Link href="/jobs" className="primaryButton">일감 목록으로</Link>
      </div>
    );
  }

  const intakeItems = job.intakeItems ?? [];
  const intakeReceived = intakeItems.filter((item) => item.receivedAt).length;
  const pendingIntake = pendingIntakeLabels(job);
  const pendingQuestions = pendingBriefQuestions(job);
  const waitingTask = job.tasks.find((task) => task.status === "waiting");
  const doneTasks = job.tasks.filter((task) => task.status === "done").length;
  const progress = Math.round((doneTasks / Math.max(job.tasks.length, 1)) * 100);
  const delayed = job.status !== "completed" && job.dueDate < new Date().toISOString().slice(0, 10);
  const marginRate = job.amount > 0 ? Math.round((job.margin / job.amount) * 100) : null;
  // 한 건에 최소 남길 돈을 정했을 때만, 덜 남는 주문이면 '남는 돈(예상)' 칸 아래에 한 줄로 알린다.
  const marginShort = marginShortfall(job.margin, settings.minMarginPerJob);
  const portalEnabled = job.status === "active" && job.revisionPortalEnabled;
  const portalSynced = runtimeMode === "local" || saveStatus === "saved";
  const currentSource = normalizeOrderSource(job.source);
  const sourceLabel = currentSource ? ORDER_SOURCE_LABELS[currentSource] : undefined;
  const shownTitle = displayJobTitle(job);
  const dueDday = getDday(job.dueDate);
  // 저장 직후 안내 띠가 열려 있는 동안은 같은 문구가 두 벌 보이지 않게 '고객에게 보낼 말'을 숨긴다.
  const sendBannerOpen = sendBannerRequested && !sendBannerDismissed && job.status === "active";
  const notify = (text: string) => setNotice({ text, tone: "ok" });
  const notifyError = (error: unknown, fallback: string) =>
    setNotice({ text: error instanceof Error ? error.message : fallback, tone: "error" });

  // 일감 완료는 확인 창 없이 바로 하고, 화면 아래 알림의 '되돌리기'로 되돌린다(닫힌 고객 링크도 다시 연다).
  const handleCompleteJob = () => {
    if (job.status !== "active") {
      setNotice(null);
      completeJob(job.id);
      return;
    }
    completeJob(job.id);
    setNotice({
      text: portalEnabled ? "일감을 완료했어요. 고객 링크도 닫혔어요." : "일감을 완료했어요.",
      tone: "ok",
      undo: { linkWasOn: portalEnabled },
    });
  };

  const undoCompleteJob = (linkWasOn: boolean) => {
    setNotice(null);
    // 알림이 떠 있는 사이 이미 다시 진행했으면 또 바꾸지 않는다.
    if (job.status !== "completed") return;
    completeJob(job.id);
    if (linkWasOn) setRevisionPortalEnabled(job.id, true);
  };

  // 메신저·전화로 받은 요청을 적는다. 기본은 확인 대기, 이미 고쳤으면 '수정 완료로 기록'으로 바로 1회를 쓴다.
  const saveManualRevision = (completed: boolean) => {
    if (!revisionBody.trim()) return;
    try {
      recordRevision(job.id, revisionBody, channel, completed);
      setRevisionBody("");
      setRevisionOpen(false);
    } catch (error) {
      notifyError(error, "수정 요청을 기록하지 못했어요.");
    }
  };

  const handleRevision = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveManualRevision(false);
  };

  const handleCompleteRevision = (revisionId: string) => {
    try {
      completeRevision(job.id, revisionId);
      notify("수정 완료로 1회를 썼어요. 고객 링크에도 남은 횟수가 바로 반영돼요.");
    } catch (error) {
      notifyError(error, "수정 완료로 처리하지 못했어요.");
    }
  };

  const handleExtraScopeRevision = (revisionId: string) => {
    try {
      markRevisionExtraScope(job.id, revisionId);
      notify("추가 작업으로 분류했어요. 금액·기간은 아래 추가요청에 기록하세요.");
    } catch (error) {
      notifyError(error, "추가 작업으로 분류하지 못했어요.");
    }
  };

  const portalLink = revisionPortalUrl(
    nativePlatform() === "web" ? window.location.origin : deploymentOrigin(),
    job.revisionPortalToken,
  );

  const copyPortalLink = async () => {
    if (!portalEnabled) return;
    try {
      await navigator.clipboard.writeText(portalLink);
      markFirstRun("linkShared");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice({ text: `자동 복사가 막혔어요. 이 주소를 직접 복사해 주세요: ${portalLink}`, tone: "error" });
    }
  };

  const dismissSendBanner = () => {
    setSendBannerDismissed(true);
    // 새로고침해도 다시 뜨지 않게 주소에서 표시만 지운다. 목록 복귀 정보(list=)는 남긴다.
    const params = new URLSearchParams(window.location.search);
    params.delete("created");
    params.delete("send");
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  };

  const togglePortal = () => {
    if (job.status !== "active") return;
    const enabled = !job.revisionPortalEnabled;
    setRevisionPortalEnabled(job.id, enabled);
    setCopied(false);
    notify(runtimeMode === "hosted"
      ? enabled
        ? "링크를 켜는 중이에요. 상단에 저장 완료가 표시되면 공유할 수 있어요."
        : "링크를 끄는 중이에요. 상단에 저장 완료가 표시되면 기존 주소가 폐기돼요."
      : enabled
        ? "고객 수정 링크를 켰어요."
        : "고객 수정 링크를 껐어요. 기존 주소의 요청을 받지 않아요.");
  };

  const rotatePortalToken = () => {
    if (job.status !== "active") return;
    const confirmed = window.confirm("수정 링크를 재발급할까요? 기존 주소는 다시 사용할 수 없어요.");
    if (!confirmed) return;
    const nextToken = rotateRevisionPortalToken(job.id);
    if (!nextToken) return;
    setCopied(false);
    notify(runtimeMode === "hosted"
      ? "새 링크를 저장 중이에요. 상단에 저장 완료가 표시되면 기존 주소가 폐기돼요."
      : "새 수정 링크를 발급했어요. 기존 주소는 폐기됐어요.");
  };

  const openLinkEditor = () => {
    setLinkDrafts(job.links.map((link) => ({ ...link })));
    setLinkError("");
    setNotice(null);
    setLinkEditorOpen(true);
  };

  const addLinkDraft = (kind: JobLink["kind"], label: string) => {
    setLinkDrafts((items) => [...items, { id: `link_${Date.now()}_${items.length}`, label, url: "https://", kind }]);
  };

  const saveLinks = () => {
    const links = linkDrafts.map((link) => ({ ...link, label: link.label.trim(), url: link.url.trim() }));
    setLinkError("");
    for (const [index, link] of links.entries()) {
      if (!link.label) {
        setLinkError(`${index + 1}번 링크 이름을 입력해 주세요.`);
        return;
      }
      try {
        const parsed = new URL(link.url);
        if (!/^https?:\/\//i.test(link.url) || !["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
          throw new Error("invalid link");
        }
      } catch {
        setLinkError(`${index + 1}번 링크 주소를 확인해 주세요. https:// 또는 http://로 시작하는 전체 주소를 입력해 주세요.`);
        return;
      }
    }
    updateJobLinks(job.id, links);
    setLinkEditorOpen(false);
    notify("작업 링크를 반영했어요. 저장 여부는 상단에서 확인해 주세요.");
  };

  const submitRevert = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!revertTargetId) return;
    const usage = job.revisions.find((item) => item.id === revertTargetId)?.usage;
    try {
      revertRevision(job.id, revertTargetId, revertReason);
      setRevertTargetId(null);
      setRevertReason("");
      // 횟수가 돌아오는 것은 '수정 완료'로 센(used) 요청뿐이다. 추가 작업 요청은 원래 횟수를 쓰지 않았다.
      notify(usage === "pending"
        ? "요청을 반려했어요. 원문은 남기고 횟수는 쓰지 않았어요."
        : usage === "used"
          ? "수정 요청을 되돌렸어요. 원문은 그대로 두고 사용 횟수에서 뺐어요."
          : "추가 작업 요청을 되돌렸어요. 원문은 그대로 두었고 남은 횟수는 바뀌지 않아요.");
    } catch (error) {
      notifyError(error, "수정 요청을 되돌리지 못했어요.");
    }
  };

  const handleConfirmAddon = (addonId: string) => {
    // 확정은 금액·원가·마감·Todo를 바꾼다. 끝난 일감이 뒤늦게 흔들리지 않도록 취소 버튼과 같은 조건으로 막는다.
    if (job.status !== "active") return;
    try {
      confirmAddon(job.id, addonId);
      notify("추가요청을 확정해 합계·마감·할 일에 반영했어요.");
    } catch (error) {
      notifyError(error, "추가요청을 확정하지 못했어요.");
    }
  };

  const handleCancelAddon = (addonId: string, confirmed: boolean) => {
    if (
      confirmed &&
      !window.confirm("확정한 추가요청을 취소할까요? 금액·원가·마감일이 확정 전으로 돌아가고, 아직 시작하지 않은 할 일만 사라져요. 이미 처리한 할 일은 기록으로 남아요.")
    ) {
      return;
    }
    try {
      cancelAddon(job.id, addonId);
      notify(confirmed
        ? "추가요청을 취소했어요. 금액·원가·마감은 확정 전으로 돌아갔고, 이미 처리한 할 일은 그대로 남았어요."
        : "추가요청 초안을 취소했어요. 기록은 그대로 남아요.");
    } catch (error) {
      notifyError(error, "추가요청을 취소하지 못했어요.");
    }
  };

  const submitAddon = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!addonTitle.trim()) return;
    try {
      createAddon(job.id, {
        title: addonTitle,
        amountDelta: Math.max(0, Number.parseInt(addonAmount || "0", 10) || 0),
        estimatedCostDelta: Math.max(0, Number.parseInt(addonCost || "0", 10) || 0),
        durationDaysDelta: Math.max(0, Number.parseInt(addonDays || "0", 10) || 0),
        tasks: addonTaskTitle.trim()
          ? [{ taskKey: `addon-${Date.now()}`, title: addonTaskTitle.trim(), relativeDay: Math.max(0, Number.parseInt(addonTaskDay || "0", 10) || 0), order: 0 }]
          : [],
      });
      setAddonTitle("");
      setAddonAmount("0");
      setAddonCost("0");
      setAddonDays("0");
      setAddonTaskTitle("");
      setAddonTaskDay("0");
      setAddonOpen(false);
      notify("추가요청 초안을 만들었어요. 확정 전에는 합계에 반영되지 않아요.");
    } catch (error) {
      notifyError(error, "추가요청을 저장하지 못했어요.");
    }
  };

  return (
    <div className="pageSurface jobDetailPage">
      <header className="detailHeader">
        <div className="detailTitleLine">
          <Link href={listHref} className="iconButton backButton" aria-label="일감 목록으로 돌아가기">
            <ArrowLeft size={19} />
          </Link>
          <div>
            <div className="detailKickerLine">
              {/* 받은 곳: 눌러서 펼치고 하나 고르면 닫힌다(두 번). 완료한 일감에서도 바꿀 수 있다. */}
              <button
                type="button"
                className="jobSourceButton"
                data-empty={!sourceLabel}
                onClick={() => setSourceOpen((open) => !open)}
                aria-expanded={sourceOpen}
                aria-controls="job-source-choices"
                aria-label={sourceLabel ? `받은 곳 ${sourceLabel} 바꾸기` : "받은 곳 정하기"}
                data-testid="job-source"
              >
                {sourceLabel ?? "받은 곳"} <ChevronDown size={14} aria-hidden="true" />
              </button>
              <span>{job.packageSnapshot.name}</span>
              {job.status === "completed" ? (
                <span className="statusBadge completed"><CheckCircle2 size={14} /> 완료</span>
              ) : waitingTask ? (
                <span className="statusBadge waiting"><MessageSquareText size={14} /> 고객 대기</span>
              ) : (
                <span className={delayed ? "statusBadge delayed" : "statusBadge active"}>
                  {delayed && <AlarmClock size={14} />}{getDday(job.dueDate)}
                </span>
              )}
            </div>
            {sourceOpen && (
              <div id="job-source-choices" className="sourceChoices jobSourceChoices" role="radiogroup" aria-label="받은 곳">
                {ORDER_SOURCES.map((value) => {
                  const checked = currentSource === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      className="sourceChip"
                      onClick={() => {
                        setJobSource(job.id, checked ? undefined : value);
                        setSourceOpen(false);
                      }}
                      data-testid={`job-source-${value}`}
                    >
                      {checked && <Check size={14} aria-hidden="true" />}
                      {ORDER_SOURCE_LABELS[value]}
                    </button>
                  );
                })}
              </div>
            )}
            <h1>{job.clientLabel}</h1>
            {/* 자동 제목이 윗줄 패키지 이름과 같으면 두 번 보이지 않게 뺀다(사용자가 바꾼 제목은 그대로). */}
            {shownTitle !== job.packageSnapshot.name && <p>{shownTitle}</p>}
          </div>
        </div>
        <div className="detailHeaderActions">
          {job.links.map((link) => (
            <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="quietButton">
              {link.kind === "contact" ? <MessageCircle size={16} /> : <ExternalLink size={16} />}
              {link.label}
            </a>
          ))}
          <div className="detailMore">
            <button
              type="button"
              className="iconButton"
              aria-label="더보기"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={19} />
            </button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  className="detailMoreBackdrop"
                  aria-hidden="true"
                  tabIndex={-1}
                  onClick={() => setMenuOpen(false)}
                />
                <div className="detailMoreMenu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="detailMoreItem danger"
                    onClick={() => {
                      setMenuOpen(false);
                      handleDeleteJob();
                    }}
                  >
                    <Trash2 size={16} /> 일감 삭제
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 고객이 링크로 남긴 새 요청은 휴대폰에서도 첫 화면에 보이게 제목 바로 아래에 알린다. */}
      {revision.pending > 0 && (
        <a href="#revisions" className="pendingRequestStrip" data-testid="pending-request-strip">
          <MessageSquareText size={16} aria-hidden="true" />
          <span>고객 요청 {revision.pending}건이 확인을 기다려요</span>
          <span className="pendingRequestStripAction">보기</span>
        </a>
      )}

      {sendBannerOpen && (
        <SendToClientBanner
          link={portalLink}
          clientLabel={job.clientLabel}
          title={shownTitle}
          included={revision.included}
          remaining={revision.remaining}
          pendingIntake={pendingIntake}
          pendingQuestions={pendingQuestions}
          ready={portalEnabled && portalSynced}
          pendingMessage={portalEnabled ? "저장이 끝나면 보낼 수 있어요. 상단에 저장 완료가 표시될 때까지 잠시만 기다려 주세요." : "고객 수정 링크가 꺼져 있어요. 아래 고객 수정 요청 링크 카드에서 켜면 보낼 수 있어요."}
          localOnly={runtimeMode === "local"}
          onDismiss={dismissSendBanner}
        />
      )}

      {/* 휴대폰 첫 화면에는 사실 6칸 대신 이 한 줄만 보인다(데스크톱에서는 숨김). 금액은 '금액 보기'로 펼친다. */}
      <p className="jobFactLine" data-testid="job-fact-line">
        <span>
          {dueDday === "오늘 마감" ? dueDday : `${formatShortDate(job.dueDate)} 마감 ${dueDday}`} · 남은 수정 {revision.remaining}회 · 할 일 {doneTasks}/{job.tasks.length}
        </span>
        <button
          type="button"
          className="textButton"
          onClick={() => setMoneyOpen((open) => !open)}
          aria-expanded={moneyOpen}
          aria-controls="job-fact-rail"
          data-testid="job-money-toggle"
        >
          {moneyOpen ? "금액 접기" : "금액 보기"}
        </button>
      </p>

      <section id="job-fact-rail" className="jobFactRail" data-money-open={moneyOpen} aria-label="일감 핵심 정보">
        <div>
          <span className="factIcon"><CalendarDays size={18} /></span>
          <dl><dt>마감</dt><dd>{formatShortDate(job.dueDate)} <small>{dueDday}</small></dd></dl>
        </div>
        <div className="jobFactMoney">
          <span className="factIcon"><CircleDollarSign size={18} /></span>
          <dl><dt>계약 금액</dt><dd>{formatWon(job.amount)}</dd></dl>
        </div>
        <div className="jobFactMoney">
          <span className="factIcon"><Wallet size={18} /></span>
          <dl><dt>예상 원가</dt><dd data-testid="job-estimated-cost">{formatWon(job.estimatedCost)}</dd></dl>
        </div>
        <div className="jobFactMoney">
          <span className="factIcon"><TrendingUp size={18} /></span>
          <dl>
            <dt>남는 돈(예상)</dt>
            <dd data-testid="job-margin">
              {formatWon(job.margin)} <small>{marginRate === null ? "금액 없음" : `남는 비율 ${marginRate}%`}</small>
            </dd>
            {marginShort !== null && (
              <dd className="marginWarning" data-testid="job-margin-warning">
                <CircleAlert size={13} aria-hidden="true" />
                <span className="srOnly">주의: </span>
                {marginWarningText(job.margin, marginShort)}
              </dd>
            )}
          </dl>
        </div>
        <div>
          <span className="factIcon"><RotateCcw size={18} /></span>
          <dl><dt>남은 수정</dt><dd>{revision.remaining}회 <small>{revision.used}/{revision.included} 사용</small></dd></dl>
        </div>
        <div>
          <span className="factIcon"><ListChecks size={18} /></span>
          <dl><dt>진행률</dt><dd>{progress}% <small>{doneTasks}/{job.tasks.length} 완료</small></dd></dl>
        </div>
      </section>

      <div className="detailGrid">
        <div className="detailMain">
          {/* 안내 띠를 닫으면 지금 상황에 맞는 문구를 다시 복사할 수 있다. 링크 준비 여부는 저장 직후 안내와 같다. */}
          {!sendBannerOpen && <ClientMessages job={job} link={portalEnabled && portalSynced ? portalLink : null} today={localToday()} />}

          <section className="contentSection taskDetailSection">
            <div className="sectionHeadingRow">
              <div>
                <h2>작업 체크리스트</h2>
              </div>
              <span className="sectionCount">{doneTasks}/{job.tasks.length}</span>
            </div>
            <div className="detailProgress"><span style={{ width: `${progress}%` }} /></div>
            <div className="detailTaskList">
              {job.tasks.map((task, index) => (
                <div className="detailTaskRow" key={task.id} data-state={task.status}>
                  <button
                    type="button"
                    className="detailTaskCheck"
                    onClick={() => toggleTask(job.id, task.id)}
                    disabled={job.status !== "active"}
                    aria-label={`${task.title} ${task.status === "done" ? "완료 취소" : "완료 처리"}`}
                    aria-pressed={task.status === "done"}
                    data-testid={`task-toggle-${task.id}`}
                  >
                    {task.status === "done" ? <Check size={16} /> : <span>{index + 1}</span>}
                  </button>
                  <div>
                    <strong>{task.title}</strong>
                    <span>
                      {formatShortDate(task.dueDate)}
                      {task.status === "waiting" && <> · 고객 답변 대기 중</>}
                    </span>
                  </div>
                  {task.status === "waiting" ? (
                    <span className="taskStateLabel waiting"><MessageSquareText size={14} /> 대기</span>
                  ) : task.status === "done" ? (
                    <span className="taskStateLabel done"><CheckCircle2 size={14} /> 완료</span>
                  ) : (
                    <span className="taskStateLabel">{getDday(task.dueDate)}</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {intakeItems.length > 0 && (
            <section className="contentSection intakeSection" aria-labelledby="intake-title" data-testid="intake-section">
              <div className="sectionHeadingRow">
                <div>
                  <h2 id="intake-title">시작 전 받을 자료</h2>
                  <p className="sectionHint">{intakeReceived}/{intakeItems.length} 받음 · 아직 못 받은 것은 고객 링크와 카톡 문구에 들어가요</p>
                </div>
              </div>
              <ul className="intakeList">
                {intakeItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="intakeToggle"
                      data-received={Boolean(item.receivedAt)}
                      aria-pressed={Boolean(item.receivedAt)}
                      onClick={() => toggleIntake(job.id, item.id)}
                      disabled={job.status !== "active"}
                      data-testid={`intake-toggle-${item.id}`}
                    >
                      {item.receivedAt ? <CheckCircle2 size={16} /> : <span className="intakeCircle" aria-hidden="true" />}
                      <span>{item.label}</span>
                      {item.receivedAt && <small>받음</small>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <StartChecklist
            jobId={job.id}
            questions={job.briefQuestions ?? []}
            active={job.status === "active"}
            onToggle={toggleBriefQuestion}
            onNote={updateBriefNote}
          />

          <section id="revisions" className="contentSection jobRevisionSection" ref={revisionSectionRef}>
            <div className="sectionHeadingRow">
              <div>
                <h2>수정 요청 기록</h2>
              </div>
              <button
                type="button"
                className="compactButton emphasized"
                onClick={() => setRevisionOpen((value) => !value)}
                disabled={job.status !== "active"}
                data-testid="record-revision"
                aria-expanded={revisionOpen}
                aria-controls="revision-entry-form"
              >
                <RotateCcw size={15} /> 요청 직접 적기
              </button>
            </div>

            {revisionOpen && (
              <form id="revision-entry-form" className="revisionQuickForm" onSubmit={handleRevision}>
                <div className="revisionFormTop">
                  <label>
                    <span>요청 채널</span>
                    <span className="selectShell">
                      <select value={channel} onChange={(event) => setChannel(event.target.value as keyof typeof channelLabels)}>
                        {Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <ChevronDown size={15} />
                    </span>
                  </label>
                  <span className={revision.remaining === 0 ? "revisionImpact extra" : "revisionImpact"} data-testid="revision-impact">
                    {revision.remaining > 0 ? "확인 대기로 기록 · 고친 뒤 1회 사용" : "남은 수정 없음 · 기록 뒤 추가 작업으로"}
                  </span>
                </div>
                <label className="revisionTextField">
                  <span className="srOnly">수정 요청 내용</span>
                  <textarea
                    ref={revisionTextareaRef}
                    value={revisionBody}
                    onChange={(event) => setRevisionBody(event.target.value)}
                    placeholder="예: 메인 문구를 신제품 중심으로 교체"
                    rows={2}
                    required
                  />
                </label>
                <div className="revisionFormActions">
                  <button type="button" className="textOnlyButton" onClick={() => setRevisionOpen(false)}>취소</button>
                  <button
                    type="button"
                    className="compactButton"
                    onClick={() => saveManualRevision(true)}
                    disabled={revision.remaining === 0}
                    data-testid="record-revision-done"
                  >
                    <CheckCircle2 size={15} /> 수정 완료로 기록
                  </button>
                  <button type="submit" className="primaryButton compactSubmit"><Check size={16} /> 요청으로 기록</button>
                </div>
              </form>
            )}

            <div className="revisionLogList">
              {[...job.revisions].reverse().map((item) => {
                const reverted = Boolean(item.revertedAt);
                const pending = item.usage === "pending";
                // 끝난 일감의 기록은 흔들지 않는다. 진행 중이면 반려·되돌리기·완료·분류를 할 수 있다.
                const canRevert = job.status === "active" && !reverted;
                const canComplete = canRevert && item.usage !== "used";
                const revertLabel = pending ? "반려" : "되돌리기";
                return (
                  <article className="revisionLogRow" key={item.id} data-reverted={reverted}>
                    <span className={item.source === "public" ? "timelineDot customer" : "timelineDot manual"} />
                    <div className="revisionLogBody">
                      <span className="timelineMeta">
                        {item.source === "public" ? "고객 수정 링크" : channelLabels[item.channel ?? "other"]} · {formatTimelineDate(item.submittedAt)}
                      </span>
                      <p>{item.body}</p>
                      {reverted && (
                        <span className="revisionRevertNote" data-testid={`revert-note-${item.id}`}>
                          <Undo2 size={13} /> {pending ? "반려한 요청" : "되돌린 요청"}{item.revertReason ? ` · ${item.revertReason}` : " · 사유 없음"}
                        </span>
                      )}
                      {canRevert && revertTargetId !== item.id && (
                        <div className="revisionRowActions">
                          {canComplete && (
                            <button
                              type="button"
                              className="compactButton emphasized"
                              onClick={() => handleCompleteRevision(item.id)}
                              disabled={revision.remaining === 0}
                              title={revision.remaining === 0 ? "남은 포함 수정이 없어요. 추가 작업으로 처리하세요." : undefined}
                              data-testid={`complete-revision-${item.id}`}
                            >
                              <CheckCircle2 size={14} /> 수정 완료
                            </button>
                          )}
                          {pending && (
                            <button
                              type="button"
                              className="compactButton"
                              onClick={() => handleExtraScopeRevision(item.id)}
                              data-testid={`extra-revision-${item.id}`}
                            >
                              <Plus size={14} /> 추가 작업으로
                            </button>
                          )}
                          <button
                            type="button"
                            className="textOnlyButton revisionRevertButton"
                            onClick={() => {
                              setRevertTargetId(item.id);
                              setRevertReason("");
                            }}
                            data-testid={`revert-revision-${item.id}`}
                          >
                            <Undo2 size={13} /> {revertLabel}
                          </button>
                        </div>
                      )}
                      {canRevert && revertTargetId === item.id && (
                        <form className="revisionRevertForm" onSubmit={submitRevert}>
                          <input
                            aria-label={pending ? "반려 사유" : "되돌림 사유"}
                            value={revertReason}
                            onChange={(event) => setRevertReason(event.target.value)}
                            placeholder={pending ? "반려 이유 (선택) · 예: 질문이라 대화창으로 답함" : "되돌린 이유 (선택) · 예: 중복 접수"}
                            autoFocus
                          />
                          <button type="submit" className="compactButton emphasized" data-testid={`revert-submit-${item.id}`}>
                            <Undo2 size={14} /> {revertLabel}
                          </button>
                          <button type="button" className="textOnlyButton" onClick={() => setRevertTargetId(null)}>취소</button>
                        </form>
                      )}
                    </div>
                    <span
                      className={reverted
                        ? "usageBadge reverted"
                        : item.usage === "extra_scope" ? "usageBadge extra" : pending ? "usageBadge pending" : "usageBadge"}
                      data-testid={`revision-badge-${item.id}`}
                    >
                      {reverted
                        ? pending ? "반려" : "되돌림"
                        : item.usage === "extra_scope" ? "추가 작업" : pending ? "확인 대기" : `${item.sequence}회차`}
                    </span>
                  </article>
                );
              })}
              {job.revisions.length === 0 && (
                <div className="inlineEmpty revisionEmpty">아직 기록된 수정 요청이 없어요.</div>
              )}
            </div>
          </section>

          <section className="contentSection addonSection">
            <div className="sectionHeadingRow">
              <div>
                <h2>추가요청</h2>
              </div>
              <button type="button" className="compactButton emphasized" onClick={() => setAddonOpen((value) => !value)} disabled={job.status !== "active"} data-testid="open-addon">
                <Plus size={15} /> 추가요청 기록
              </button>
            </div>
            <p className="sectionExplain">초안으로 적어 두고, 고객이 동의하면 확정해요. 확정하면 금액·마감·할 일에 반영돼요.</p>
            {addonOpen && (
              <form className="addonForm" onSubmit={submitAddon}>
                <label><span>추가요청 내용</span><input required value={addonTitle} onChange={(event) => setAddonTitle(event.target.value)} placeholder="예: 이벤트 랜딩 페이지 1장" /></label>
                <div className="addonFieldPair"><label><span>추가금 (원)</span><input type="number" min="0" value={addonAmount} onChange={(event) => setAddonAmount(event.target.value)} /></label><label><span>추가 원가 (원)</span><input type="number" min="0" value={addonCost} onChange={(event) => setAddonCost(event.target.value)} /></label></div>
                <div className="addonFieldPair"><label><span>추가 기간 (일)</span><input type="number" min="0" value={addonDays} onChange={(event) => setAddonDays(event.target.value)} /></label></div>
                <div className="addonFieldPair"><label><span>추가 할 일 <small>선택</small></span><input value={addonTaskTitle} onChange={(event) => setAddonTaskTitle(event.target.value)} placeholder="예: 랜딩 페이지 제작" /></label><label><span>할 일 날짜 (시작 며칠 뒤)</span><input type="number" min="0" value={addonTaskDay} onChange={(event) => setAddonTaskDay(event.target.value)} /></label></div>
                <div className="revisionFormActions"><button type="button" className="textOnlyButton" onClick={() => setAddonOpen(false)}>취소</button><button type="submit" className="primaryButton compactSubmit"><Save size={16} /> 초안 기록</button></div>
              </form>
            )}
            <div className="addonList">
              {job.addons.length ? [...job.addons].reverse().map((addon) => (
                <article key={addon.id} className="addonRow" data-status={addon.status}>
                  <div><span>{addon.status === "confirmed" ? "확정됨" : addon.status === "cancelled" ? "취소됨" : "초안"}</span><strong>{addon.title}</strong><p>+{formatWon(addon.amountDelta)} · 원가 {formatWon(addon.estimatedCostDelta)} · +{addon.durationDaysDelta}일{addon.tasks.length ? ` · 할 일 ${addon.tasks.length}개` : ""}</p></div>
                  <div className="addonRowActions">
                    {addon.status === "draft" && job.status === "active" && <button type="button" className="compactButton emphasized" onClick={() => handleConfirmAddon(addon.id)} data-testid={`confirm-addon-${addon.id}`}><Check size={15} /> 확정</button>}
                    {addon.status !== "cancelled" && job.status === "active" && (
                      <button type="button" className="compactButton" onClick={() => handleCancelAddon(addon.id, addon.status === "confirmed")} data-testid={`cancel-addon-${addon.id}`}>
                        <Undo2 size={15} /> 취소
                      </button>
                    )}
                  </div>
                </article>
              )) : <p className="inlineEmpty">기존 범위를 넘는 요청만 여기에서 금액과 기간으로 기록하세요.</p>}
            </div>
          </section>
        </div>

        <aside className="detailAside">
          <section className="sideSection revisionMeterSection">
            <div className="sectionHeadingRow compact">
              <div><h2>수정 {revision.remaining}회 남음</h2></div>
              <span className="revisionFraction"><b>{revision.used}</b> / {revision.included}</span>
            </div>
            <div className="revisionMeter" aria-label={`수정 ${revision.used}회 사용, ${revision.remaining}회 남음`}>
              {Array.from({ length: revision.included }, (_, index) => <span key={index} data-used={index < revision.used} />)}
            </div>
            {revision.pending > 0 && (
              <p className="revisionPendingNote" data-testid="revision-pending-count">확인 대기 {revision.pending}건 · 고친 뒤 &lsquo;수정 완료&rsquo;를 누르면 1회를 써요</p>
            )}
            {/* 수정 횟수 규칙은 접기 하나에 모은다(고객 링크 구획의 설명도 여기로 옮김). */}
            <details className="revisionRules">
              <summary>수정 횟수는 이렇게 세요</summary>
              <p>고객 요청은 먼저 확인 대기로 들어와요. 고친 뒤 &lsquo;수정 완료&rsquo;를 누르면 1회를 써요. 질문·중복은 &lsquo;반려&rsquo;, 범위 밖은 &lsquo;추가 작업으로&rsquo;를 눌러요. 둘 다 횟수를 안 써요.</p>
            </details>
          </section>

          <section className="sideSection portalLinkSection">
            <h2>고객 수정 요청 링크</h2>
            <div className="portalStatus" data-enabled={portalEnabled} role="status" aria-live="polite">
              <span />
              {portalEnabled ? portalSynced ? "링크 켜짐" : "링크 동기화 중" : job.status === "completed" ? "일감 완료 · 링크 잠김" : portalSynced ? "링크 꺼짐" : "링크 동기화 중"}
            </div>
            <button
              type="button"
              className="copyLinkButton"
              onClick={copyPortalLink}
              disabled={!portalEnabled || !portalSynced}
              data-testid="copy-revision-portal"
              aria-label={portalEnabled ? "수정 요청 링크 복사" : "꺼진 수정 요청 링크"}
            >
              <Link2 size={16} />
              <span>.../r/{job.revisionPortalToken.slice(-6)}</span>
              <Copy size={16} />
            </button>
            {copied && <span className="copyFeedback" role="status"><Check size={14} /> 링크를 복사했어요</span>}
            <div className="portalControlActions">
              <button
                type="button"
                className="compactButton"
                onClick={togglePortal}
                disabled={job.status !== "active" || (runtimeMode === "hosted" && saveStatus !== "saved")}
                data-testid="toggle-revision-portal"
              >
                {job.revisionPortalEnabled ? "링크 끄기" : "링크 켜기"}
              </button>
              <button
                type="button"
                className="compactButton"
                onClick={rotatePortalToken}
                disabled={job.status !== "active" || (runtimeMode === "hosted" && saveStatus !== "saved")}
                data-testid="rotate-revision-portal"
              >
                <RotateCcw size={14} /> 링크 재발급
              </button>
            </div>
            <small>
              {job.status === "completed"
                ? "일감을 다시 진행한 뒤에만 링크를 켜거나 재발급할 수 있어요."
                : runtimeMode === "hosted"
                  ? "저장이 끝나면 링크에 반영돼요. 재발급하면 이전 주소는 못 써요."
                  : "지금은 이 브라우저에 저장하는 모드라 링크도 이 브라우저에서만 열려요. 고객에게 보내려면 로그인 모드가 필요해요."}
            </small>
          </section>

          <section className="sideSection linkManagerSection">
            <div className="sectionHeadingRow compact"><div><h2>작업 링크</h2></div><button type="button" className="textButton" onClick={openLinkEditor}>편집</button></div>
            <div className="linkShortcutGrid">
              {job.links.length ? job.links.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {link.label}</a>) : <p>아직 저장한 링크가 없어요.</p>}
            </div>
            {linkEditorOpen && (
              <div className="linkEditor">
                <div className="linkPresetButtons"><button type="button" onClick={() => addLinkDraft("contact", "카카오톡")}>카카오</button><button type="button" onClick={() => addLinkDraft("contact", "디스코드")}>디스코드</button><button type="button" onClick={() => addLinkDraft("work", "작업 사이트")}>작업 사이트</button><button type="button" onClick={() => addLinkDraft("figma", "Figma")}>Figma</button><button type="button" onClick={() => addLinkDraft("drive", "Drive")}>Drive</button></div>
                {linkDrafts.map((link, index) => (
                  <div className="linkDraftRow" key={link.id}><input aria-label={`링크 ${index + 1} 이름`} value={link.label} onChange={(event) => setLinkDrafts((items) => items.map((item) => item.id === link.id ? { ...item, label: event.target.value } : item))} placeholder="링크 이름" /><input aria-label={`링크 ${index + 1} 주소`} value={link.url} onChange={(event) => setLinkDrafts((items) => items.map((item) => item.id === link.id ? { ...item, url: event.target.value } : item))} placeholder="https://" /><button type="button" className="smallIconButton" aria-label={`${link.label || "링크"} 삭제`} onClick={() => setLinkDrafts((items) => items.filter((item) => item.id !== link.id))}>×</button></div>
                ))}
                {linkError && <p role="alert">{linkError}</p>}
                <div className="revisionFormActions"><button type="button" className="textOnlyButton" onClick={() => setLinkEditorOpen(false)}>취소</button><button type="button" className="primaryButton compactSubmit" onClick={saveLinks}><Save size={15} /> 링크 저장</button></div>
              </div>
            )}
          </section>

          <section className="sideSection snapshotSection">
            <PackageCheck size={19} />
            <div>
              <strong>{job.packageSnapshot.name}</strong>{" "}
              <span>{job.optionSnapshots.length ? job.optionSnapshots.map((item) => item.name).join(" · ") : "추가 옵션 없음"}</span>
            </div>
            <p>주문할 때 조건을 그대로 보관해요.</p>
          </section>
        </aside>
      </div>

      <div className="jobActionBar">
        <div className="actionBarInfo">
          <span className={delayed ? "actionBarStatus delayed" : "actionBarStatus"}><Clock3 size={15} /> {getDday(job.dueDate)}</span>
          <strong>{job.status === "completed" ? "일감 완료됨" : `다음: ${job.tasks.find((task) => task.status === "todo")?.title ?? "모든 작업 처리됨"}`}</strong>
        </div>
        <div className="actionBarButtons">
          <button type="button" className="quietButton" onClick={() => toggleJobWaiting(job.id)} disabled={job.status !== "active"} data-testid="toggle-waiting" aria-label={waitingTask ? "답변 받음" : "고객 대기"}>
            {waitingTask ? <UserRoundCheck size={17} /> : <MessageSquareText size={17} />}
            <span className="buttonLabelDesktop">{waitingTask ? "답변 받음" : "고객 대기"}</span>
            <span className="buttonLabelMobile">{waitingTask ? "답변" : "대기"}</span>
          </button>
          <button
            type="button"
            className="quietButton mobileRevisionButton"
            onClick={() => {
              setRevisionOpen(true);
              setRevisionFocusRequest((value) => value + 1);
            }}
            disabled={job.status !== "active"}
            aria-label="수정 기록"
            aria-controls="revision-entry-form"
            aria-expanded={revisionOpen}
          >
            <RotateCcw size={17} />
            <span className="buttonLabelDesktop">수정 기록</span>
            <span className="buttonLabelMobile">수정</span>
          </button>
          {/* 어두운 바 위 주 버튼은 흰 바탕으로 뒤집어 바와 구분한다. 할 일 하나가 아니라 일감 전체를 끝낸다고 휴대폰에서도 말한다. */}
          <button type="button" className="invertedButton" onClick={handleCompleteJob} data-testid="complete-job" aria-label={job.status === "completed" ? "다시 진행" : "일감 완료하기"}>
            {job.status === "completed" ? <Undo2 size={17} /> : <CheckCircle2 size={17} />}
            <span className="buttonLabelDesktop">{job.status === "completed" ? "다시 진행" : "일감 완료하기"}</span>
            <span className="buttonLabelMobile">{job.status === "completed" ? "다시 진행" : "일감 완료"}</span>
          </button>
        </div>
      </div>

      {/* 하단 바 바로 뒤에 둬서 '일감 완료' 다음 Tab이 '되돌리기'로 간다. 동작은 하나만(되돌리기 또는 닫기). */}
      {notice && (
        <div className="actionToast" role={notice.tone === "error" ? "alert" : "status"} data-tone={notice.tone} data-testid="job-toast">
          {notice.tone === "error" ? <CircleAlert size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
          <span>{notice.text}</span>
          {notice.undo ? (
            <button type="button" onClick={() => undoCompleteJob(notice.undo!.linkWasOn)}>되돌리기</button>
          ) : (
            <button type="button" onClick={() => setNotice(null)}>닫기</button>
          )}
        </div>
      )}
    </div>
  );
}
