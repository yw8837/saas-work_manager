import { classifyFcmResponse, deliverBatch, revisionMessage } from "./delivery.ts";

Deno.test("FCM acceptance and retry use the original lease, no revision mutation", async () => {
  const claim={request_id:"r",device_id:"d",lease_id:"l",token:"secret",platform:"ios",job_key:"j"};
  const outcomes:string[]=[];
  const stats=await deliverBatch(new Date(),10,{
    claim:async()=>[claim],current:async()=>true,send:async()=>classifyFcmResponse(429,{}),
    finish:async(c,result)=>{if(c.lease_id!=="l") throw new Error("lease changed"); outcomes.push(result);},
  });
  if(stats.retrying!==1 || outcomes[0]!=="retry") throw new Error("retry contract failed");
  const data=revisionMessage(claim).message.data;
  if(Object.keys(data).sort().join(",")!=="job_key,request_id,type") throw new Error("payload contains extra data");
});
