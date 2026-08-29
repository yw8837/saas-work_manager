"use client";

import Link from "next/link";
import {
  BellRing,
  Check,
  Clock3,
  Database,
  Download,
  LockKeyhole,
  LogOut,
  MessageSquareText,
  Send,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { serializeWorkspaceExport } from "@/lib/store";
import {
  getNotificationCapability,
  requestBrowserNotificationPermission,
  sendTestNotification,
  type BrowserNotificationState,
  type NotificationCapability,
} from "@/lib/notifications";
import { PLAN_LIMITS, PLAN_NAMES, PLAN_PRICES, TRIAL_DAYS, type Plan } from "@/lib/domain";
import { InstallAppCard } from "./install-app-card";
import { useWorkspace } from "./workspace-provider";

/** 무제한은 숫자 대신 글자로 보여준다. 숫자는 전부 PLAN_LIMITS에서 온다. */
function limitText(value: number, unit: string) {
  return Number.isFinite(value) ? `${value}${unit}` : "무제한";
}

function tierSummary(plan: Plan) {
  const limits = PLAN_LIMITS[plan];
  return [
    `동시 ${limitText(limits.activeJobs, "건")}`,
    `누적 ${limitText(limits.totalJobs, "건")}`,
    `패키지 ${limitText(limits.packages, "개")}`,
    `옵션 ${limitText(limits.options, "개")}`,
  ].join(" · ");
}

const testResultText = {
  shown: "테스트 알림을 보냈어요. 브라우저 알림 영역을 확인하세요.",
  "permission-required": "먼저 브라우저 알림 권한을 허용해주세요.",
  denied: "브라우저에서 알림 권한이 차단되어 있어요.",
  unsupported: "이 브라우저는 서비스 워커 알림을 지원하지 않아요.",
  "worker-unavailable": "알림 서비스 워커를 준비하지 못했어요. 새로고침 후 다시 시도하세요.",
} as const;

function permissionLabel(permission: BrowserNotificationState) {
  if (permission === "granted") return "허용됨";
  if (permission === "denied") return "차단됨";
  if (permission === "unsupported") return "미지원";
  return "권한 필요";
}

export function SettingsPanel() {
  const { packages, options, jobs, settings, activityDates, updateSettings, runtimeMode, userEmail, signInWithGoogle, signOut, deleteAccount, saveStatus, saveError, realtimeStatus, realtimeError, plan, planAccess, limits, activeJobCount, jobsCreatedTotal, trialStartedAt, betaAccess, activateInviteCode } = useWorkspace();
  const isPro = plan === "pro";
  const [inviteCode, setInviteCode] = useState("");
  const [inviteFeedback, setInviteFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [capability, setCapability] = useState<NotificationCapability | null>(null);
  const [feedback, setFeedback] = useState("");
  const [accountFeedback, setAccountFeedback] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [forceSignOutAvailable, setForceSignOutAvailable] = useState(false);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionPhrase, setDeletionPhrase] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setCapability(getNotificationCapability()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const requestPermission = async () => {
    const permission = await requestBrowserNotificationPermission();
    setCapability(getNotificationCapability());
    setFeedback(permission === "granted" ? "브라우저 알림 권한을 허용했어요." : `알림 권한 상태: ${permissionLabel(permission)}`);
  };

  const sendTest = async () => {
    const result = await sendTestNotification();
    setCapability(getNotificationCapability());
    setFeedback(testResultText[result]);
  };

  const handleSignOut = async (discardUnsaved = false) => {
    if (discardUnsaved && !window.confirm("이 기기의 미저장 변경을 버리고 로그아웃할까요? 서버에 저장되지 않은 내용은 복구할 수 없어요.")) return;
    setSigningOut(true);
    setAccountFeedback("");
    try {
      await signOut({ discardUnsaved });
      setForceSignOutAvailable(false);
    } catch (error) {
      setForceSignOutAvailable((error as { code?: string })?.code === "UNSAVED_WORKSPACE");
      setAccountFeedback(error instanceof Error ? `로그아웃 실패: ${error.message}` : "로그아웃하지 못했어요.");
    } finally {
      setSigningOut(false);
    }
  };

  const downloadWorkspace = () => {
    const exportedAt = new Date().toISOString();
    const payload = serializeWorkspaceExport(
      {
        version: 2,
        packages,
        options,
        jobs,
        settings,
        activityDates,
        jobsCreatedTotal,
        trialStartedAt,
        betaAccess,
        // 쓴 코드 목록은 내 데이터가 아니라 한도 관리용이라 내보내기에 담지 않는다.
        redeemedInviteCodes: [],
      },
      userEmail,
      exportedAt,
    );
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ilgamcheck-export-${exportedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setAccountFeedback("작업공간 JSON을 내려받았어요. 공개 수정링크의 비밀 토큰은 제외했어요.");
  };

  const [redeeming, setRedeeming] = useState(false);
  const redeemInviteCode = async () => {
    if (redeeming) return;
    setRedeeming(true);
    try {
      const result = await activateInviteCode(inviteCode);
      setInviteFeedback(result);
      if (result.ok) setInviteCode("");
    } finally {
      setRedeeming(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deletionPhrase !== "계정 삭제") return;
    setDeletingAccount(true);
    setAccountFeedback("");
    try {
      await deleteAccount();
      setAccountFeedback("계정과 서버 데이터를 삭제했어요.");
      setDeletionPhrase("");
      setDeletionOpen(false);
    } catch (error) {
      setAccountFeedback(error instanceof Error ? error.message : "계정을 삭제하지 못했어요.");
    } finally {
      setDeletingAccount(false);
    }
  };

  const planStatusText = planAccess.source === "trial"
    ? `${TRIAL_DAYS}일 무제한 체험 중 · ${planAccess.remainingDays}일 남음`
    : planAccess.source === "beta"
      ? `베타 이용 중 · ${planAccess.remainingDays}일 남음`
      : `${PLAN_NAMES.basic} ${PLAN_PRICES.basic.label} · ${PLAN_NAMES.pro} ${PLAN_PRICES.pro.label}`;

  // 승급이 끝났으면 조용히 사라지지 않고 왜 무료로 돌아왔는지 알려준다.
  const planExpiryNotice = planAccess.source !== "base"
    ? null
    : planAccess.betaExpired
      ? "베타 이용 기간이 끝나 무료 플랜으로 돌아왔어요."
      : planAccess.trialExpired
        ? `${TRIAL_DAYS}일 무제한 체험이 끝나 무료 플랜으로 돌아왔어요.`
        : null;

  return (
    <div className="pageSurface settingsPage">
      <header className="pageHeader">
        <div>
          <span className="pageEyebrow">놓치지 않도록, 과하지 않도록</span>
          <h1>설정</h1>
          <p>플랜과 알림, 앱 설치와 내 데이터를 여기서 관리해요.</p>
        </div>
      </header>

      <section className="contentSection planSection" id="plan" aria-labelledby="plan-title">
        <div className="sectionHeadingRow">
          <div><span className="sectionMiniLabel">요금제</span><h2 id="plan-title">플랜</h2></div>
          <Sparkles size={20} />
        </div>
        <div className="planCurrentRow">
          <span className={isPro ? "planBadge pro" : "planBadge"} data-testid="current-plan">{PLAN_NAMES[plan]}</span>
          <span className="planPrice" data-testid="plan-status">{planStatusText}</span>
        </div>

        <p className="planPrice" data-testid="plan-usage">
          지금 동시 진행 {activeJobCount}건 / {limitText(limits.activeJobs, "건")} · 지금까지 만든 일감 {jobsCreatedTotal}건 / {limitText(limits.totalJobs, "건")}
        </p>

        {planExpiryNotice && (
          <p className="settingsFeedback" role="status" data-testid="plan-expiry-notice">
            <Sparkles size={15} /> {planExpiryNotice}
          </p>
        )}

        <ul className="planPerks" data-testid="plan-tiers">
          {(["free", "basic", "pro"] as const).map((tier) => (
            <li className="planTierRow" key={tier} data-current={tier === plan}>
              <Check size={16} />
              <span>
                <strong>{PLAN_NAMES[tier]} · {PLAN_PRICES[tier].label}</strong>
                <br />
                {tierSummary(tier)}
              </span>
            </li>
          ))}
        </ul>
        <p className="planPrice">누적 일감 수는 완료하거나 지워도, 전체 초기화를 해도 줄지 않아요.</p>

        <form
          className="planInviteForm"
          onSubmit={(event) => { event.preventDefault(); redeemInviteCode(); }}
        >
          <label htmlFor="beta-invite-code">
            <span>베타 이용 코드</span>
            <input
              id="beta-invite-code"
              name="betaInviteCode"
              type="text"
              autoComplete="off"
              placeholder="받은 코드를 입력해주세요"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
            />
          </label>
          <button type="submit" className="quietButton" data-testid="redeem-invite" disabled={redeeming}>
            <Sparkles size={16} /> {redeeming ? "적용 중…" : "코드 적용"}
          </button>
        </form>
        {inviteFeedback && (
          <p className="settingsFeedback" role="status" data-testid="invite-feedback">
            <Check size={15} /> {inviteFeedback.message}
          </p>
        )}
        {planAccess.source === "beta" && planAccess.expiresAt && (
          <p className="planPrice" data-testid="beta-code-applied">
            베타 Pro 적용됨 · {new Date(planAccess.expiresAt).toLocaleDateString("ko-KR")}까지
          </p>
        )}
        <p className="planPrice">
          {runtimeMode === "hosted"
            ? "코드는 계정에 한 번 적용되며, 적용일부터 30일 동안 Pro를 이용할 수 있어요. 30일 Pro 이용 코드를 적용한 계정은 결제 오픈 후 Basic 정가 월 14,900원을 월 9,900원에 12개월 이용할 수 있어요."
            : "로컬 미리보기에서는 코드가 이 브라우저에만 저장돼요. 실제 서비스에서는 서버가 계정별로 확인합니다."}
        </p>

        <div className="browserTestActions">
          <button type="button" className="primaryButton" data-testid="upgrade-cta" disabled>
            <Sparkles size={16} /> {PLAN_NAMES.pro} 업그레이드 준비 중
          </button>
        </div>
        <p className="planPrice">아직 결제를 받지 않아요. 지금은 무료 플랜과 체험·베타 이용 코드로 쓸 수 있고, 결제가 열리면 이 자리에서 바로 업그레이드할 수 있어요.</p>
      </section>

      <InstallAppCard />

      <div className="settingsGrid">
        <section className="contentSection settingSection">
          <div className="sectionHeadingRow"><div><span className="sectionMiniLabel">오늘의 시작</span><h2>일일 브리핑</h2></div><BellRing size={20} /></div>
          <label className="settingRow"><span><strong>매일 브리핑 표시</strong><small>설정한 시간이 지나면 알림 목록에 오늘 처리·고객 대기·수정 요청 요약을 한 줄로 올려요.</small></span><input type="checkbox" checked={settings.morningDigestEnabled} onChange={(event) => updateSettings({ morningDigestEnabled: event.target.checked })} /></label>
          <label className="settingTime"><span>브리핑 시간</span><input type="time" value={settings.morningDigestTime} onChange={(event) => updateSettings({ morningDigestTime: event.target.value })} /></label>
        </section>

        <section className="contentSection settingSection">
          <div className="sectionHeadingRow"><div><span className="sectionMiniLabel">마감 기준</span><h2>마감 알림</h2></div><Clock3 size={20} /></div>
          <label className="settingRow"><span><strong>D-2 · D-1 · 당일 · 지연</strong><small>활성 일감의 자동 마감을 기준으로 계산해요.</small></span><input type="checkbox" checked={settings.deadlineAlertsEnabled} onChange={(event) => updateSettings({ deadlineAlertsEnabled: event.target.checked })} /></label>
          <label className="settingTime"><span>인앱 알림 시간</span><input type="time" value={settings.deadlineAlertTime} onChange={(event) => updateSettings({ deadlineAlertTime: event.target.value })} /></label>
        </section>

        <section className="contentSection settingSection">
          <div className="sectionHeadingRow"><div><span className="sectionMiniLabel">고객 답변</span><h2>대기 알림</h2></div><Smartphone size={20} /></div>
          <label className="settingRow"><span><strong>2일 · 5일째 다시 보기</strong><small>Todo를 고객 대기로 바꾼 시각을 기준으로 계산해요.</small></span><input type="checkbox" checked={settings.waitingAlertsEnabled} onChange={(event) => updateSettings({ waitingAlertsEnabled: event.target.checked })} /></label>
          <label className="settingTime"><span>인앱 알림 시간</span><input type="time" value={settings.waitingAlertTime} onChange={(event) => updateSettings({ waitingAlertTime: event.target.value })} /></label>
        </section>

        <section className="contentSection settingSection">
          <div className="sectionHeadingRow"><div><span className="sectionMiniLabel">수정 요청</span><h2>수정 알림</h2></div><Send size={20} /></div>
          <label className="settingRow"><span><strong>새 요청을 바로 표시</strong><small>고객 링크와 수동 기록 모두 같은 타임라인과 알림 큐에 남아요.</small></span><input type="checkbox" checked={settings.revisionAlertsEnabled} onChange={(event) => updateSettings({ revisionAlertsEnabled: event.target.checked })} /></label>
          <label className="settingRow"><span><strong>내용을 알림에서 표시</strong><small>공용 화면에서 보일 수 있으면 끄는 편이 안전해요.</small></span><input type="checkbox" checked={settings.privateNotificationDetails} onChange={(event) => updateSettings({ privateNotificationDetails: event.target.checked })} /></label>
        </section>
      </div>

      <section className="browserTestSection">
        <div><span className="sectionMiniLabel">현재 브라우저에서만 검사</span><h2>브라우저 테스트 알림</h2><p>권한과 표시만 확인합니다. 이 버튼은 예약 전송이나 다른 기기 전달을 증명하지 않아요.</p></div>
        <div className="browserTestActions">
          <span className={capability?.permission === "granted" ? "permissionBadge allowed" : "permissionBadge"}><ShieldAlert size={14} /> {capability ? permissionLabel(capability.permission) : "상태 확인 중"}</span>
          <button type="button" className="quietButton" onClick={requestPermission} disabled={capability?.permission === "granted" || capability?.permission === "unsupported"}>권한 요청</button>
          <button type="button" className="primaryButton" onClick={sendTest} data-testid="send-test-notification">테스트 알림</button>
        </div>
        {feedback && <p className="settingsFeedback" role="status"><Check size={15} /> {feedback}</p>}
      </section>

      <section className="accountStatusSection">
        <span className="accountStatusIcon"><Database size={20} /></span>
        <div>
          <span className="sectionMiniLabel">데이터 저장</span>
          <h2>{runtimeMode === "hosted" ? "Supabase 계정 저장" : "이 브라우저 로컬 저장"}</h2>
          <p>{runtimeMode === "hosted" ? `${userEmail ?? "현재 계정"} · ${saveStatus === "error" ? saveError ?? "저장 실패" : saveStatus === "saving" ? "변경사항 저장 중" : "최신 상태 저장됨"} · ${realtimeStatus === "connected" ? "실시간 연결됨" : realtimeStatus === "error" ? realtimeError ?? "실시간 연결 오류" : "실시간 연결 중"}` : "내 자료는 이 브라우저에만 남아요. 다른 기기에서는 보이지 않아요."}</p>
        </div>
        <div className="browserTestActions">
          <button type="button" className="quietButton" onClick={downloadWorkspace} data-testid="export-workspace"><Download size={16} /> 데이터 내보내기</button>
          {runtimeMode === "hosted" && <button type="button" className="quietButton" disabled={signingOut} onClick={() => void handleSignOut()}><LogOut size={16} /> {signingOut ? "로그아웃 중…" : "로그아웃"}</button>}
          {runtimeMode === "hosted" && forceSignOutAvailable && <button type="button" className="dangerButton" disabled={signingOut} onClick={() => void handleSignOut(true)}>미저장 변경 버리고 로그아웃</button>}
        </div>
      </section>
      {accountFeedback && <p className="settingsFeedback" role="status"><Check size={15} /> {accountFeedback}</p>}

      <section className="accountDangerSection" aria-labelledby="account-danger-title">
        <span className="accountDangerIcon"><TriangleAlert size={20} /></span>
        <div>
          <span className="sectionMiniLabel">위험 영역</span>
          <h2 id="account-danger-title">계정과 데이터 영구 삭제</h2>
          <p>
            {runtimeMode === "hosted"
              ? "삭제하면 작업공간·고객 수정요청 기록·로그인 계정을 복구할 수 없어요. 먼저 JSON 백업을 내려받아 보관하세요."
              : "이 기기에 저장하는 모드라 지울 서버 계정이 없어요. 내 자료는 이 브라우저에만 있어요."}
          </p>
        </div>
        <div className="browserTestActions">
          <button type="button" className="quietButton" onClick={downloadWorkspace}><Download size={16} /> JSON 백업</button>
          <button
            type="button"
            className="dangerButton"
            disabled={runtimeMode !== "hosted" || deletingAccount}
            onClick={() => setDeletionOpen(true)}
          >
            <Trash2 size={16} /> 계정 삭제 검토
          </button>
        </div>

        {deletionOpen && runtimeMode === "hosted" && (
          <div className="accountDeletionConfirm" role="group" aria-labelledby="account-delete-confirm-title">
            <div className="accountDeletionConfirmHead">
              <div>
                <strong id="account-delete-confirm-title">정말 영구 삭제할까요?</strong>
                <small>Google 본인 확인 뒤 아래 문구를 입력해야 삭제할 수 있어요.</small>
              </div>
              <button type="button" className="iconButton" aria-label="계정 삭제 닫기" onClick={() => setDeletionOpen(false)}><X size={17} /></button>
            </div>
            <button
              type="button"
              className="quietButton"
              disabled={deletingAccount}
              onClick={() => void signInWithGoogle("/settings")}
            >
              <LockKeyhole size={16} /> Google로 본인 확인
            </button>
            <label>
              <span>확인 문구 <strong>계정 삭제</strong> 입력</span>
              <input
                type="text"
                autoComplete="off"
                value={deletionPhrase}
                onChange={(event) => setDeletionPhrase(event.target.value)}
                disabled={deletingAccount}
              />
            </label>
            <button
              type="button"
              className="dangerButton accountDeleteFinal"
              disabled={deletingAccount || deletionPhrase !== "계정 삭제"}
              onClick={() => void handleDeleteAccount()}
            >
              <Trash2 size={16} /> {deletingAccount ? "영구 삭제 중…" : "계정과 모든 데이터 영구 삭제"}
            </button>
          </div>
        )}
      </section>

      <section className="accountStatusSection" id="feedback" aria-labelledby="feedback-invite-title">
        <span className="accountStatusIcon"><MessageSquareText size={20} /></span>
        <div>
          <span className="sectionMiniLabel">베타 의견</span>
          <h2 id="feedback-invite-title">불편한 점이나 필요한 기능을 알려주세요</h2>
          <p>개인정보는 받지 않아요. 고객명·금액·수정 요청 내용은 자동으로 보내지 않습니다.</p>
        </div>
        <div className="browserTestActions">
          <Link className="quietButton" href="/feedback">의견 보내기</Link>
          <Link className="quietButton" href="/feedback?mode=exit">그만두는 이유 알려주기</Link>
        </div>
      </section>

      <section className="blockedExternalSection" id="blocked-external">
        <div className="blockedMark"><LockKeyhole size={23} /></div>
        <div>
          <span className="sectionMiniLabel">아직 준비 중인 기능</span>
          <h2>{runtimeMode === "hosted" ? "잠금화면 알림과 결제는 아직 준비 중이에요." : "다른 기기에서 열리는 고객 링크와 잠금화면 알림은 아직 준비 중이에요."}</h2>
          <p>{runtimeMode === "hosted" ? "로그인과 계정별 저장, 고객 수정 링크는 지금 그대로 쓸 수 있어요. 앱을 열지 않아도 먼저 찾아가는 잠금화면 알림과 결제는 준비가 끝나면 안내해 드릴게요." : "지금은 이 브라우저에 저장하는 모드예요. 모든 기능을 바로 쓸 수 있지만, 고객에게 보낸 링크를 다른 기기에서 열거나 여러 기기에서 같은 자료를 보려면 로그인 모드가 필요해요. 준비가 끝나면 안내해 드릴게요."}</p>
        </div>
      </section>
    </div>
  );
}
