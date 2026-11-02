import { Route, Routes, useParams, useSearchParams } from "react-router-dom";

import { AppShell } from "@/components/app-shell";
import { BetaActivationGate } from "@/components/beta-activation-gate";
import { BetaApplyForm } from "@/components/beta-apply-form";
import { BetaConfirmView } from "@/components/beta-confirm-view";
import { BetaOpsApplications } from "@/components/beta-ops-applications";
import { BetaUnsubscribeView } from "@/components/beta-unsubscribe-view";
import { CustomerRevisionDemo } from "@/components/customer-revision-demo";
import { FeedbackPanel } from "@/components/feedback-panel";
import { JobDetail } from "@/components/job-detail";
import { JobsOverview } from "@/components/jobs-overview";
import { MarketingHome } from "@/components/marketing-home";
import { MonthlySummary } from "@/components/monthly-summary";
import { NewJobForm } from "@/components/new-job-form";
import { PackageManager } from "@/components/package-manager";
import { PolicyPage } from "@/components/policy-page";
import { PublicRevisionForm } from "@/components/public-revision-form";
import { SettingsPanel } from "@/components/settings-panel";
import { TodayDashboard } from "@/components/today-dashboard";
import { UserGuide } from "@/components/user-guide";
import { WorkspaceAuthGate } from "@/components/workspace-auth-gate";
import { POLICY_PUBLICATION_MANIFEST } from "@/lib/policies";

export { isStandaloneRoutePath, STANDALONE_ROUTE_PATHS } from "@/lib/standalone-routes";

export const SITE_ROUTE_PATHS = [
  "/",
  "/today",
  "/jobs",
  "/jobs/new",
  "/jobs/summary",
  "/jobs/:id",
  "/packages",
  "/settings",
  "/feedback",
  "/r/:token",
  "/privacy",
  "/terms",
  "/guide",
  "/demo/r",
  "/apply",
  "/apply/confirm/:token",
  "/u/:token",
  "/ops/applications",
] as const;

function BetaConfirmRoute() {
  const { token = "" } = useParams<{ token: string }>();
  return <BetaConfirmView token={token} />;
}

function BetaUnsubscribeRoute() {
  const { token = "" } = useParams<{ token: string }>();
  return <BetaUnsubscribeView token={token} />;
}

export function StandaloneRoutes() {
  return (
    <Routes>
      <Route path="/guide" element={<UserGuide />} />
      <Route path="/demo/r" element={<CustomerRevisionDemo />} />
      <Route path="/apply" element={<BetaApplyForm />} />
      <Route path="/apply/confirm/:token" element={<BetaConfirmRoute />} />
      <Route path="/u/:token" element={<BetaUnsubscribeRoute />} />
      <Route path="/ops/applications" element={<BetaOpsApplications />} />
    </Routes>
  );
}

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
      {/* 월별 정리는 `/jobs/:id`보다 먼저 둔다(일감 id로 읽히지 않게). */}
      <Route path="/jobs/summary" element={<WorkspaceRoute><MonthlySummary /></WorkspaceRoute>} />
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
