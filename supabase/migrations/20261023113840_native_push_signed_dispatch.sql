-- Managed pg_net tables are owned by supabase_admin; postgres cannot revoke
-- their PUBLIC defaults. Do not enqueue permanent credentials at all.
create table ilgam_private.native_dispatch_nonces (
  nonce uuid primary key,
  expires_at timestamptz not null default (clock_timestamp()+interval '5 minutes')
);
revoke all on table ilgam_private.native_dispatch_nonces from public,anon,authenticated,service_role;
create function public.consume_native_push_dispatch_nonce(p_nonce uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare inserted integer;
begin
  if p_nonce is null then return false; end if;
  delete from ilgam_private.native_dispatch_nonces where expires_at<clock_timestamp()-interval '1 minute';
  insert into ilgam_private.native_dispatch_nonces(nonce) values(p_nonce) on conflict do nothing;
  get diagnostics inserted=row_count;
  return inserted=1;
end $$;
revoke all on function public.consume_native_push_dispatch_nonce(uuid) from public,anon,authenticated;
grant execute on function public.consume_native_push_dispatch_nonce(uuid) to service_role;

create or replace function ilgam_private.dispatch_native_push()
returns bigint language plpgsql security invoker set search_path='' as $$
declare v_url text; v_secret text; v_stamp text; v_nonce text; v_message text; v_signature text;
begin
  if not exists (
    select 1 from public.native_revision_outbox o
    join public.native_push_devices d on d.owner_id=o.owner_id and d.enabled
    join public.native_push_attempts a on a.request_id=o.request_id and a.device_id=d.id
    where a.attempts<5 and (
      (a.status='pending' and a.next_attempt_at<=clock_timestamp())
      or (a.status='sending' and a.lease_until<clock_timestamp())
    )
  ) then return null; end if;
  select decrypted_secret into strict v_url from vault.decrypted_secrets where name='ilgam_native_project_url';
  select decrypted_secret into strict v_secret from vault.decrypted_secrets where name='ilgam_native_dispatch_secret';
  if v_url !~ '^https://[a-z]{20}[.]supabase[.]co$' or v_secret !~ '^[a-f0-9]{64}$' then
    raise exception 'native_dispatch_config_invalid';
  end if;
  v_stamp:=floor(extract(epoch from clock_timestamp()))::bigint::text;
  v_nonce:=gen_random_uuid()::text;
  v_message:=E'ilgam-native-push-v1\n'||v_url||E'\nPOST\n/functions/v1/native-revision-push\n44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a\n'||v_stamp||E'\n'||v_nonce;
  v_signature:=encode(extensions.hmac(v_message,v_secret,'sha256'),'hex');
  return net.http_post(
    url:=v_url||'/functions/v1/native-revision-push',
    headers:=jsonb_build_object('Content-Type','application/json','x-native-push-time',v_stamp,
      'x-native-push-nonce',v_nonce,'x-native-push-signature',v_signature),
    body:='{}'::jsonb, timeout_milliseconds:=120000
  );
end $$;
revoke all on function ilgam_private.dispatch_native_push() from public,anon,authenticated,service_role;
-- Enable only after the matching Edge verifier has been deployed and probed.
select cron.alter_job((select jobid from cron.job where jobname='ilgam-native-revision-push'),active:=false);
