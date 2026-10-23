/** Short-lived signed dispatch. The permanent secret never enters pg_net's queue. */
export async function authorizeDispatch(headers: Headers, secret: string | undefined, audience: string, nowSeconds=Math.floor(Date.now()/1000)): Promise<string|null> {
  const stamp=headers.get("x-native-push-time")??"";
  const nonce=headers.get("x-native-push-nonce")??"";
  const signature=headers.get("x-native-push-signature")??"";
  if(!secret || !/^[a-f0-9]{64}$/.test(secret) || !/^https:\/\/[a-z]{20}\.supabase\.co$/.test(audience) || !/^\d{10}$/.test(stamp)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(nonce)
    || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const age=nowSeconds-Number(stamp);
  if(!Number.isFinite(age) || age < -30 || age > 90) return null;
  const text=new TextEncoder();
  const message=`ilgam-native-push-v1\n${audience}\nPOST\n/functions/v1/native-revision-push\n44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a\n${stamp}\n${nonce}`;
  const key=await crypto.subtle.importKey("raw",text.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const bytes=Uint8Array.from(signature.match(/../g)!,x=>parseInt(x,16));
  return await crypto.subtle.verify("HMAC",key,bytes,text.encode(message)) ? nonce : null;
}
export async function validDispatchBody(request: Request): Promise<boolean> {
  const reader=request.body?.getReader();
  if(!reader) return false;
  let bytes='';
  let timedOut=false;
  const timer=setTimeout(()=>{ timedOut=true; void reader.cancel().catch(()=>{}); },5000);
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if(done) return !timedOut && bytes==='{}';
      if(value.length+bytes.length>2) return false;
      for(const byte of value) bytes+=String.fromCharCode(byte);
    }
  } catch { return false; }
  finally { clearTimeout(timer); void reader.cancel().catch(()=>{}); }
}
