import { BrowserRouter, useLocation } from "react-router-dom";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { AppRoutes, StandaloneRoutes, isStandaloneRoutePath } from "./routes";

function ShellRoutes() {
  const { pathname } = useLocation();
  if (isStandaloneRoutePath(pathname)) return <StandaloneRoutes />;
  return <WorkspaceProvider><AppRoutes /></WorkspaceProvider>;
}

export function SiteShell() {
  return (
    <BrowserRouter>
      <ShellRoutes />
    </BrowserRouter>
  );
}
