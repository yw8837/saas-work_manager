import type { Metadata } from "next";
import { SettingsPanel } from "@/components/settings-panel";

// 루트 레이아웃의 template("%s | 일감체크")이 브랜드를 붙이므로 여기선 화면 이름만 둔다.
export const metadata: Metadata = { title: "설정" };

export default function SettingsPage() {
  return <SettingsPanel />;
}
