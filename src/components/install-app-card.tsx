"use client";

import { Download, Share, SquarePlus, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * 브라우저가 설치 가능해지면 쏘는 이벤트. 표준 타입이 아직 없어 최소한만 적는다.
 * iOS Safari는 이 이벤트를 지원하지 않아 별도 안내가 필요하다.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = "unknown" | "installed" | "promptable" | "ios-manual" | "unavailable";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    ("standalone" in window.navigator &&
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // 아이패드는 데스크톱 UA를 쓰기도 해서 터치 지원까지 함께 본다.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
}

export function InstallAppCard() {
  const [state, setState] = useState<InstallState>("unknown");
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [message, setMessage] = useState("");
  // 같은 프레임에 두 번 눌리면 setDeferred(null)이 아직 반영되지 않아 prompt()가 두 번 불린다.
  // 두 번째 호출은 InvalidStateError로 거절되므로 렌더를 기다리지 않는 ref로 먼저 잠근다.
  const installingRef = useRef(false);

  useEffect(() => {
    // 설치 여부는 window를 봐야 알 수 있어 서버 렌더 뒤에 판정한다.
    // 이 앱의 다른 화면과 같은 방식으로 렌더가 끝난 뒤로 미룬다.
    const timer = window.setTimeout(() => {
      if (isStandalone()) {
        setState("installed");
        return;
      }
      setState(isIos() ? "ios-manual" : "unavailable");
    }, 0);

    const onPrompt = (event: Event) => {
      // 기본 미니 배너를 막고 우리 버튼으로 안내한다.
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
      setState("promptable");
    };
    const onInstalled = () => {
      setDeferred(null);
      setState("installed");
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    const pending = deferred;
    if (!pending || installingRef.current) return;
    installingRef.current = true;
    setMessage("");
    try {
      await pending.prompt();
      const choice = await pending.userChoice;
      setDeferred(null);
      if (choice.outcome === "accepted") {
        setState("installed");
      } else {
        setState("unavailable");
        setMessage("설치를 취소했어요. 브라우저 메뉴에서 언제든 다시 설치할 수 있어요.");
      }
    } catch {
      setMessage("설치 창을 열지 못했어요. 크롬·엣지 주소창의 설치 아이콘이나 브라우저 메뉴의 '앱으로 설치'를 이용해주세요.");
    } finally {
      installingRef.current = false;
    }
  };

  if (state === "unknown") return null;

  return (
    <section className="contentSection installCard" aria-labelledby="install-title">
      <div className="sectionHeadingRow">
        <div>
          <span className="sectionMiniLabel">앱으로 쓰기</span>
          <h2 id="install-title">홈 화면에 추가</h2>
        </div>
        <Smartphone size={20} />
      </div>

      {state === "installed" && (
        <p className="installBody">
          앱으로 실행 중이에요. 홈 화면 아이콘으로 주소창 없이 바로 열려요. 다만 인터넷이 끊긴 상태에서는 화면을 새로 불러오지
          못하니, 연결됐을 때 열어주세요.
        </p>
      )}

      {state === "promptable" && (
        <>
          <p className="installBody">
            설치하면 홈 화면 아이콘으로 바로 열리고, 주소창 없이 앱처럼 써요. 용량은 거의 들지 않아요.
          </p>
          <div className="browserTestActions">
            <button type="button" className="primaryButton" onClick={() => void install()} data-testid="install-app">
              <Download size={16} /> 앱으로 설치
            </button>
          </div>
          {message && (
            <p className="installBody" role="status" data-testid="install-message">
              {message}
            </p>
          )}
        </>
      )}

      {state === "ios-manual" && (
        <>
          <p className="installBody">아이폰·아이패드는 사파리에서 두 번만 누르면 앱처럼 쓸 수 있어요.</p>
          <ol className="installSteps">
            <li>
              <Share size={16} /> 사파리 아래쪽 <strong>공유</strong> 버튼을 누르세요.
            </li>
            <li>
              <SquarePlus size={16} /> <strong>홈 화면에 추가</strong>를 고르고 <strong>추가</strong>를 누르세요.
            </li>
          </ol>
        </>
      )}

      {state === "unavailable" && (
        <p className="installBody">
          {message ||
            "이 브라우저에서는 설치 버튼이 안 보일 수 있어요. 크롬·엣지 주소창의 설치 아이콘이나 브라우저 메뉴의 '앱으로 설치'를 이용하세요."}
        </p>
      )}
    </section>
  );
}
