import type { Metadata } from "next";
import { TodayDashboard } from "@/components/today-dashboard";

export const metadata: Metadata = { title: "오늘" };

export default function TodayPage() {
  return <TodayDashboard />;
}
