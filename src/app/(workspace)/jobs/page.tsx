import type { Metadata } from "next";
import { JobsOverview } from "@/components/jobs-overview";

export const metadata: Metadata = { title: "일감" };

export default function JobsPage() {
  return <JobsOverview />;
}
