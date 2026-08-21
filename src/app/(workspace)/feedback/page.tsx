import type { Metadata } from "next";
import { FeedbackPanel } from "@/components/feedback-panel";

export const metadata: Metadata = { title: "의견 보내기" };

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const { mode } = await searchParams;
  const requested = Array.isArray(mode) ? mode[0] : mode;
  return <FeedbackPanel mode={requested === "exit" ? "exit" : "general"} />;
}
