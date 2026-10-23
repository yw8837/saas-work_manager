export type JobListFilter = "all" | "active" | "waiting" | "completed";
export type JobListLocation = { filter: JobListFilter; query: string };

export function readJobListLocation(search: string): JobListLocation {
  const params = new URLSearchParams(search);
  const raw = params.get("filter");
  const filter = raw === "active" || raw === "waiting" || raw === "completed" ? raw : "all";
  return { filter, query: (params.get("q") ?? "").slice(0, 200) };
}

export function jobListHref(location: JobListLocation): string {
  const params = new URLSearchParams();
  if (location.filter !== "all") params.set("filter", location.filter);
  if (location.query) params.set("q", location.query.slice(0, 200));
  return `/jobs${params.size ? `?${params}` : ""}`;
}

export function jobListReturnHref(detailSearch: string): string {
  const value = new URLSearchParams(detailSearch).get("list");
  if (!value?.startsWith("/jobs?")) return "/jobs";
  return jobListHref(readJobListLocation(value.slice(5)));
}

export const jobListSearchSnapshot = () => typeof window === "undefined" ? "" : window.location.search;
export const emptyJobListSearch = () => "";
export function subscribeJobListLocation(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  window.addEventListener("ilgam:job-list", listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener("ilgam:job-list", listener);
  };
}
export function updateJobListLocation(value: JobListLocation): void {
  window.history.replaceState(window.history.state, "", jobListHref(value));
  window.dispatchEvent(new Event("ilgam:job-list"));
}
