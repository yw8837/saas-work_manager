import { authorizeDispatch, validDispatchBody } from "./auth.ts";
const secret="a".repeat(64);
const nonce="00000000-0000-4000-8000-000000000001";
const stamp=1792755600;
const audience='https://evhkpgxacpweelnmjmqh.supabase.co';
async function signed(overrides: Record<string,string>={}) {
  const message=`ilgam-native-push-v1\n${audience}\nPOST\n/functions/v1/native-revision-push\n44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a\n${stamp}\n${nonce}`;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message)));
  return new Headers({"x-native-push-time":String(stamp),"x-native-push-nonce":nonce,
    "x-native-push-signature":Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join(""),...overrides});
}
Deno.test("signed dispatch accepts only authentic, recent, well-formed requests",async()=>{
  if(await authorizeDispatch(await signed(),secret,audience,stamp)!==nonce) throw new Error("valid signature rejected");
  if(await authorizeDispatch(await signed(),secret,'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',stamp)!==null) throw new Error('cross-project accepted');
  for(const [headers,key,now] of [
    [await signed(),secret,stamp+91], [await signed(),secret,stamp-31],
    [await signed(),"b".repeat(64),stamp], [await signed(),undefined,stamp],
    [await signed({"x-native-push-time":String(stamp+1)}),secret,stamp],
    [await signed({"x-native-push-signature":"0".repeat(64)}),secret,stamp],
    [await signed({"x-native-push-nonce":"bad"}),secret,stamp],
    [new Headers({"x-native-push-secret":secret}),secret,stamp],
  ] as const) if(await authorizeDispatch(headers,key,audience,now)!==null) throw new Error("invalid signature accepted");
});
Deno.test('dispatch body is exactly the signed empty JSON object',async()=>{
  for(const body of ['{}','{"x":1}','','{ }','{}extra']) {
    const accepted=await validDispatchBody(new Request('https://example.test',{method:'POST',body}));
    if(accepted!==(body==='{}')) throw new Error('body binding failed');
  }
});
