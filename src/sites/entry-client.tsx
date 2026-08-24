import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@/styles/theme.css";
import { SiteShell } from "./site-shell";
import { loadSitesPublicEnvironment } from "./public-config-client";

const root = createRoot(document.getElementById("root")!);

function renderApplication() {
  root.render(<StrictMode><SiteShell /></StrictMode>);
}

function renderUnavailable() {
  root.render(
    <main className="runtimeUnavailable" role="alert">
      <strong>잠시 연결하지 못했어요.</strong>
      <p>인터넷 연결을 확인한 뒤 다시 시도해주세요.</p>
      <button type="button" onClick={() => window.location.reload()}>다시 시도</button>
    </main>,
  );
}

void loadSitesPublicEnvironment().then(renderApplication, renderUnavailable);
