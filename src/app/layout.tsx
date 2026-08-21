import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { WorkspaceProvider } from "@/components/workspace-provider";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@/styles/theme.css";

export const metadata: Metadata = {
  title: {
    default: "일감체크 · 본업만 하세요",
    template: "%s | 일감체크",
  },
  description: "패키지와 옵션만 고르면 마감, 할 일, 수정 횟수까지 한 번에 준비되는 프리랜서 일감 관리 도구",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/app-icon.svg", type: "image/svg+xml" },
      { url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // iOS 홈 화면은 SVG를 읽지 못해 PNG가 필요하다.
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "일감체크",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 홈 화면에서 실행할 때 노치 영역까지 배경이 이어지도록 한다.
  viewportFit: "cover",
  themeColor: "#181d26",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </body>
    </html>
  );
}
