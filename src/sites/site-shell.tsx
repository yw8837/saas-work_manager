import { BrowserRouter } from "react-router-dom";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { AppRoutes } from "./routes";

export function SiteShell() {
  return (
    <BrowserRouter>
      <WorkspaceProvider><AppRoutes /></WorkspaceProvider>
    </BrowserRouter>
  );
}
