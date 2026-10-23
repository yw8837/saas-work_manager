import { expect, it, vi } from "vitest";
import { deliverBatch, classifyFcmResponse, revisionMessage } from "../../../supabase/functions/native-revision-push/delivery";

const claim = { request_id:"request-1",device_id:"device-1",lease_id:"lease-1",token:"private-token",platform:"android",job_key:"job-1" };
it("sends only a current binding, records acceptance, and never modifies a workspace", async () => {
  const finish=vi.fn();
  const send=vi.fn().mockResolvedValue("sent");
  const stats=await deliverBatch(new Date(),10,{
    claim:async () => [claim],current:async () => true,send,finish,
  });
  expect(stats).toEqual({ sent:1,retrying:0,discarded:0 });
  expect(finish).toHaveBeenCalledWith(claim,"sent");
  const body=revisionMessage(claim);
  expect(body.message.notification.body).toBe("새 수정 요청이 도착했어요");
  expect(body.message.data).toEqual({ type:"revision",request_id:"request-1",job_key:"job-1" });
});
it("discards a revoked/changed device before contacting FCM",async () => {
  const send=vi.fn(), finish=vi.fn();
  expect(await deliverBatch(new Date(),10,{ claim:async()=>[claim],current:async()=>false,send,finish }))
    .toEqual({sent:0,retrying:0,discarded:1});
  expect(send).not.toHaveBeenCalled();
});
it("retries timeouts without changing revision counts, preserving the lease identity",async () => {
  const finish=vi.fn();
  expect(await deliverBatch(new Date(),10,{claim:async()=>[claim],current:async()=>true,send:async()=>{throw new Error("timeout");},finish}))
    .toEqual({sent:0,retrying:1,discarded:0});
  expect(finish).toHaveBeenCalledWith(claim,"retry");
});
it("requires a structured UNREGISTERED error before disabling a token", () => {
  expect(classifyFcmResponse(429,{})).toBe("retry");
  expect(classifyFcmResponse(503,{})).toBe("retry");
  expect(classifyFcmResponse(404,{})).toBe("discarded");
  expect(classifyFcmResponse(404,{error:{details:[{"@type":"type.googleapis.com/google.firebase.fcm.v1.FcmError",errorCode:"UNREGISTERED"}]}})).toBe("invalid");
  expect(classifyFcmResponse(200,{name:"projects/test/messages/1"})).toBe("sent");
});
it("does not hide an acknowledgement failure after FCM accepted a message",async () => {
  await expect(deliverBatch(new Date(),10,{
    claim:async()=>[claim],current:async()=>true,send:async()=>"sent",finish:async()=>{throw new Error("DB unavailable");},
  })).rejects.toThrow("DB unavailable");
});
