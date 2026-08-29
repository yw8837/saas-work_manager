import { Route, Routes, useParams, useSearchParams } from "react-router-dom";

import { AppShell } from "@/components/app-shell";
import { BetaActivationGate } from "@/components/beta-activation-gate";
import { FeedbackPanel } from "@/components/feedback-panel";
import { JobDetail } from "@/components/job-detail";
import { JobsOverview } from "@/components/jobs-overview";
import { MarketingHome } from "@/components/marketing-home";
import { NewJobForm } from "@/components/new-job-form";
import { PackageManager } from "@/components/package-manager";
import { PolicyPage } from "@/components/policy-page";
import { PublicRevisionForm } from "@/components/public-revision-form";
import { SettingsPanel } from "@/components/settings-panel";
import { TodayDashboard } from "@/components/today-dashboard";
import { WorkspaceAuthGate } from "@/components/workspace-auth-gate";
import { POLICY_PUBLICATION_MANIFEST } from "@/lib/policies";

export const SITE_ROUTE_PATHS = [
  "/",
  "/today",
  "/jobs",
  "/jobs/new",
  "/jobs/:id",
  "/packages",
  "/settings",
  "/feedback",
  "/r/:token",
  "/privacy",
  "/terms",
] as const;

function WorkspaceRoute({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceAuthGate>
      <BetaActivationGate><AppShell>{children}</AppShell></BetaActivationGate>
    </WorkspaceAuthGate>
  );
}

function JobDetailRoute() {
  const { id = "" } = useParams<{ id: string }>();
  return <WorkspaceRoute><JobDetail jobId={id} /></WorkspaceRoute>;
}

function FeedbackRoute() {
  const [params] = useSearchParams();
  return <WorkspaceRoute><FeedbackPanel mode={params.get("mode") === "exit" ? "exit" : "general"} /></WorkspaceRoute>;
}

function RevisionRoute() {
  const { token = "" } = useParams<{ token: string }>();
  return <PublicRevisionForm token={token} />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<MarketingHome />} />
      <Route path="/today" element={<WorkspaceRoute><TodayDashboard /></WorkspaceRoute>} />
      <Route path="/jobs" element={<WorkspaceRoute><JobsOverview /></WorkspaceRoute>} />
      <Route path="/jobs/new" element={<WorkspaceRoute><NewJobForm /></WorkspaceRoute>} />
      <Route path="/jobs/:id" element={<JobDetailRoute />} />
      <Route path="/packages" element={<WorkspaceRoute><PackageManager /></WorkspaceRoute>} />
      <Route path="/settings" element={<WorkspaceRoute><SettingsPanel /></WorkspaceRoute>} />
      <Route path="/feedback" element={<FeedbackRoute />} />
      <Route path="/r/:token" element={<RevisionRoute />} />
      <Route path="/privacy" element={<PolicyPage document={POLICY_PUBLICATION_MANIFEST.documents.privacy} />} />
      <Route path="/terms" element={<PolicyPage document={POLICY_PUBLICATION_MANIFEST.documents.terms} />} />
      <Route path="*" element={<MarketingHome />} />
    </Routes>
  );
}
