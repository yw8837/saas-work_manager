"use client";

import { useState, useSyncExternalStore } from "react";
import { enableNativePush, disableNativePush, nativePushStatus, subscribeNativePush } from "@/lib/native/push";

const statusText = {
  disabled: "꺼짐",
  enabling: "등록 중",
  enabled: "기기 등록됨",
  denied: "권한 차단됨",
  unavailable: "연결 확인 필요",
};
export function NativePushSettings() {
  const status = useSyncExternalStore(subscribeNativePush, nativePushStatus, () => "disabled" as const);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const toggle = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (status === "enabled") {
        await disableNativePush();
        setMessage("이 기기의 수정 요청 알림을 껐어요.");
      } else {
        const result = await enableNativePush();
        setMessage(result === "enabled"
          ? "알림을 받을 기기를 등록했어요. 절전 모드와 네트워크 상태에 따라 전달이 늦어질 수 있어요."
          : result === "denied"
            ? "휴대폰 설정에서 일감체크 알림을 허용한 뒤 다시 눌러주세요."
            : "알림 기기를 등록하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해주세요.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알림 설정을 변경하지 못했어요.");
    } finally { setBusy(false); }
  };
  return (
    <section className="browserTestSection" aria-labelledby="native-push-title">
      <div>
        <span className="sectionMiniLabel">이 휴대폰에서 받기</span>
        <h2 id="native-push-title">고객 수정 요청 알림</h2>
        <p>고객 링크로 새 요청이 접수되면 알려드려요. 고객 이름과 요청 내용은 잠금화면에 표시하지 않아요.</p>
        <p>알림을 열어도 수정 횟수가 다시 차감되지는 않아요. 마감·브리핑은 앱 안에서 확인해주세요.</p>
      </div>
      <div className="browserTestActions">
        <span className="permissionBadge">{statusText[status]}</span>
        <button type="button" className="quietButton" disabled={busy || status === "enabling"} onClick={() => void toggle()}>
          {busy ? "처리 중…" : status === "enabled" ? "이 기기 알림 끄기" : "이 기기에서 알림 받기"}
        </button>
      </div>
      {message && <p className="settingsFeedback" role="status">{message}</p>}
    </section>
  );
}
