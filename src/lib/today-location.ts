export const todaySearchSnapshot = () => typeof window === "undefined" ? "" : window.location.search;
export const emptyTodaySearch = () => "";

export function subscribeTodayLocation(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  window.addEventListener("ilgam:today-scope", listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener("ilgam:today-scope", listener);
  };
}

export function updateTodayScope(jobId: string): void {
  const url = new URL(window.location.href);
  if (jobId) url.searchParams.set("job", jobId);
  else url.searchParams.delete("job");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  window.dispatchEvent(new Event("ilgam:today-scope"));
}
