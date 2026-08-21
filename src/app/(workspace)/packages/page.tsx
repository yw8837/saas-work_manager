import type { Metadata } from "next";
import { PackageManager } from "@/components/package-manager";

// 루트 레이아웃의 template("%s | 일감체크")이 브랜드를 붙이므로 여기선 화면 이름만 둔다.
export const metadata: Metadata = { title: "패키지·옵션" };

export default function PackagesPage() {
  return <PackageManager />;
}
