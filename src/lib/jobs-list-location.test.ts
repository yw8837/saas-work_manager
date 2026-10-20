import { expect, it } from "vitest";
import { jobListHref, jobListReturnHref, readJobListLocation } from "./jobs-list-location";

it("restores only a known jobs list query, never an external return address", () => {
  expect(jobListReturnHref("?list=https%3A%2F%2Fevil.test")).toBe("/jobs");
  const href = jobListHref({ filter: "waiting", query: "고객 하나" });
  expect(jobListReturnHref(`?list=${encodeURIComponent(href)}`)).toBe(href);
  expect(readJobListLocation("?filter=invalid&q=test")).toEqual({ filter: "all", query: "test" });
});
