import { expect, it } from "vitest";
import { parseRevisionNotification } from "./push-contract";

const payload = { type: "revision", request_id: "e65d2c61-899e-4214-86fb-4a057d07c497", job_key: "job_123" };
it("parses only bounded revision IDs, not a navigation target or business mutation", () => {
  expect(parseRevisionNotification(payload)).toEqual({ requestId: payload.request_id, jobKey: "job_123" });
  for (const invalid of [null, [], {}, { ...payload, job_key: "https://evil.test" }, { ...payload, request_id: "bad" }, { ...payload, type: "delete" }]) {
    expect(parseRevisionNotification(invalid)).toBeNull();
  }
});
