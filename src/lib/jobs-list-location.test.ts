import { expect, it } from "vitest";
import { jobListHref, jobListReturnHref, readJobListLocation } from "./jobs-list-location";

it("restores only a known jobs list query, never an external return address", () => {
  expect(jobListReturnHref("?list=https%3A%2F%2Fevil.test")).toBe("/jobs");
  const href = jobListHref({ filter: "waiting", query: "고객 하나" });
  expect(jobListReturnHref(`?list=${encodeURIComponent(href)}`)).toBe(href);
  expect(readJobListLocation("?filter=invalid&q=test")).toEqual({ filter: "all", query: "test" });
});

it("받은 곳 거르기도 주소(?source=)에 남고, 모르는 값은 버린다", () => {
  const href = jobListHref({ filter: "active", query: "", source: "kmong" });
  expect(href).toBe("/jobs?filter=active&source=kmong");
  expect(readJobListLocation("?source=kmong")).toEqual({ filter: "all", query: "", source: "kmong" });
  expect(readJobListLocation("?source=evil")).toEqual({ filter: "all", query: "" });
  expect(jobListReturnHref(`?list=${encodeURIComponent(href)}`)).toBe(href);
});
