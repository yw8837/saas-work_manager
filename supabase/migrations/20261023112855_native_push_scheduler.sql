-- Hosted-only extensions. Unit SQL harness substitutes no-network stubs.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Cron executes as the migration owner; never expose a dispatch capability to
-- anon/authenticated/service_role or put a credential in cron.job.command.
create function ilgam_private.dispatch_native_push()
returns bigint language plpgsql security invoker set search_path='' as $$
declare v_url text; v_secret text;
begin
  -- No network traffic when there is no deliverable work.
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
  return net.http_post(
    url:=v_url||'/functions/v1/native-revision-push',
    headers:=jsonb_build_object('Content-Type','application/json','x-native-push-secret',v_secret),
    body:='{}'::jsonb,
    timeout_milliseconds:=10000
  );
end $$;
revoke all on function ilgam_private.dispatch_native_push() from public,anon,authenticated,service_role;
select cron.schedule('ilgam-native-revision-push','* * * * *','select ilgam_private.dispatch_native_push();');
