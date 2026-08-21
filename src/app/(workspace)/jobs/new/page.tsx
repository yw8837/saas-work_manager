import type { Metadata } from "next";
import { NewJobForm } from "@/components/new-job-form";

export const metadata: Metadata = { title: "새 일감" };

export default function NewJobPage() {
  return <NewJobForm />;
}
