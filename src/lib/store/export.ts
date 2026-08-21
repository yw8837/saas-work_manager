import type { AppState } from "./seed";

export type WorkspaceExport = {
  schemaVersion: 1;
  product: "ilgamcheck";
  exportedAt: string;
  accountEmail: string | null;
  workspace: Omit<AppState, "jobs"> & {
    jobs: Array<Omit<AppState["jobs"][number], "revisionPortalToken">>;
  };
};

function withoutPortalToken(
  job: AppState["jobs"][number],
): Omit<AppState["jobs"][number], "revisionPortalToken"> {
  const exportedJob = { ...job } as Partial<AppState["jobs"][number]>;
  Reflect.deleteProperty(exportedJob, "revisionPortalToken");
  return exportedJob as Omit<AppState["jobs"][number], "revisionPortalToken">;
}

export function createWorkspaceExport(
  state: AppState,
  accountEmail: string | null,
  exportedAt = new Date().toISOString(),
): WorkspaceExport {
  return {
    schemaVersion: 1,
    product: "ilgamcheck",
    exportedAt,
    accountEmail,
    workspace: {
      ...state,
      jobs: state.jobs.map(withoutPortalToken),
    },
  };
}

export function serializeWorkspaceExport(
  state: AppState,
  accountEmail: string | null,
  exportedAt?: string,
): string {
  return JSON.stringify(createWorkspaceExport(state, accountEmail, exportedAt), null, 2);
}
