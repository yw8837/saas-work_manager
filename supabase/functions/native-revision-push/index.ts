import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { importPKCS8, SignJWT } from "npm:jose@6.1.3";
import { classifyFcmResponse, deliverBatch, revisionMessage } from "./delivery.ts";
import { authorizeDispatch, validDispatchBody } from "./auth.ts";
// Tokens and keys remain on the server. Logs never contain request or token data.
Deno.serve(async (request: Request) => {
  if(request.method!=="POST") return new Response(null,{status:405});
  const nonce=await authorizeDispatch(request.headers,Deno.env.get("NATIVE_PUSH_DISPATCH_SECRET"),Deno.env.get("SUPABASE_URL")??"");
  if(!nonce) {
    return new Response(null,{status:401});
  }
  if(!await validDispatchBody(request)) return new Response(null,{status:400});
  try {
    const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const account=JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT")??"{}");
    if(!url || !key || typeof account.private_key!=="string"
      || typeof account.client_email!=="string" || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(account.client_email)
      || typeof account.project_id!=="string" || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(account.project_id)) {
      return Response.json({error:"push_not_configured"},{status:503});
    }
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:accepted,error:nonceError}=await db.rpc("consume_native_push_dispatch_nonce",{p_nonce:nonce});
    if(nonceError) throw new Error("dispatch replay check failed");
    if(accepted!==true) return new Response(null,{status:409});
    const jwt=await new SignJWT({scope:"https://www.googleapis.com/auth/firebase.messaging"})
      .setProtectedHeader({alg:"RS256",typ:"JWT"}).setIssuer(account.client_email)
      .setAudience("https://oauth2.googleapis.com/token").setIssuedAt().setExpirationTime("5m")
      .sign(await importPKCS8(account.private_key,"RS256"));
    const oauth=await fetch("https://oauth2.googleapis.com/token",{
      method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt}),
      signal:AbortSignal.timeout(8_000),
    });
    const access=await oauth.json();
    if(!oauth.ok || typeof access.access_token!=="string") throw new Error("credential exchange failed");
    const stats=await deliverBatch(new Date(),10,{
      async claim(limit) {
        const {data,error}=await db.rpc("claim_native_push_batch",{p_limit:limit});
        if(error) throw new Error("claim failed");
        return data??[];
      },
      async current(claim) {
        const {data,error}=await db.rpc("is_native_push_claim_current",{
          p_request_id:claim.request_id,p_device_id:claim.device_id,p_lease_id:claim.lease_id,p_token:claim.token,
        });
        if(error) throw new Error("binding check failed");
        return data===true;
      },
      async send(claim) {
        const result=await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,{
          method:"POST",headers:{Authorization:`Bearer ${access.access_token}`,"Content-Type":"application/json"},
          body:JSON.stringify(revisionMessage(claim)),signal:AbortSignal.timeout(8_000),
        });
        return classifyFcmResponse(result.status,await result.json().catch(()=>null));
      },
      async finish(claim,result) {
        const {error}=await db.rpc("finish_native_push_attempt",{
          p_request_id:claim.request_id,p_device_id:claim.device_id,p_lease_id:claim.lease_id,p_token:claim.token,p_result:result,
        });
        if(error) throw new Error("acknowledgement failed");
      },
    });
    return Response.json(stats);
  } catch {
    return Response.json({error:"push_delivery_failed"},{status:503});
  }
});
