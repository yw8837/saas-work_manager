import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@/styles/theme.css";
import { SiteShell } from "./site-shell";

createRoot(document.getElementById("root")!).render(
  <StrictMode><SiteShell /></StrictMode>,
);
