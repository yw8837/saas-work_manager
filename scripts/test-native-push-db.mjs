// Local, ephemeral PostgreSQL engine. No URL, credentials, or production connection.
// Covers SQL semantics/RLS; it does not replace Supabase integration or multi-process lock tests.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const db = await PGlite.create({ extensions: { pgcrypto } });
try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema extensions;
    grant usage on schema public,auth,extensions to anon,authenticated,service_role;
    create table auth.users (
      id uuid primary key, email text, raw_user_meta_data jsonb default '{}',
      raw_app_meta_data jsonb default '{}', created_at timestamptz default now()
    );
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant execute on functions to service_role;
  `);
  const migrations = (await readdir(resolve("supabase/migrations"))).filter((p) => p.endsWith(".sql")).sort();
  // PGlite does not ship hosted pg_cron/pg_net/Vault. These stubs validate SQL,
  // privileges and queue selection only; hosted cron/HTTP is checked separately.
  await db.exec(`
    create schema cron; create schema net; create schema vault;
    create table cron.job(jobid bigint,jobname text);
    create function cron.alter_job(job_id bigint,active boolean) returns void language sql as $$ select $$;
    create table net.http_request_queue(id bigint, headers jsonb);
    create table net._http_response(id bigint, content text);
    grant usage on schema net to public;
    grant all on net.http_request_queue, net._http_response to public;
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
    create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
      returns bigint language sql as $$ select 1::bigint $$;
  `);
  for (const migration of migrations) {
    let sql = await readFile(resolve("supabase/migrations", migration), "utf8");
    if (migration === "20261023112855_native_push_scheduler.sql") {
      sql = sql.replace(/^create extension if not exists pg_cron;$/m, "")
        .replace(/^create extension if not exists pg_net with schema extensions;$/m, "");
    }
    try { await db.exec(sql); }
    catch (error) { throw new Error(`Migration ${migration}: ${error.message}`, { cause: error }); }
  }
  const scheduler = await db.query(`
    select ilgam_private.dispatch_native_push() is null as empty_queue_skips_network,
      not has_function_privilege('anon','ilgam_private.dispatch_native_push()','execute')
      and not has_function_privilege('authenticated','ilgam_private.dispatch_native_push()','execute')
      and not has_function_privilege('service_role','ilgam_private.dispatch_native_push()','execute') as private_only;
  `);
  assert.deepEqual(scheduler.rows, [{ empty_queue_skips_network: true, private_only: true }]);
  const nonce = '00000000-0000-4000-8000-000000000001';
  assert.equal((await db.query('select public.consume_native_push_dispatch_nonce($1) as accepted',[nonce])).rows[0].accepted,true);
  assert.equal((await db.query('select public.consume_native_push_dispatch_nonce($1) as accepted',[nonce])).rows[0].accepted,false);
  const nonceAcl=await db.query(`select
    not has_function_privilege('anon','public.consume_native_push_dispatch_nonce(uuid)','execute') as anon_denied,
    not has_function_privilege('authenticated','public.consume_native_push_dispatch_nonce(uuid)','execute') as auth_denied,
    has_function_privilege('service_role','public.consume_native_push_dispatch_nonce(uuid)','execute') as server_only;`);
  assert.deepEqual(nonceAcl.rows,[{anon_denied:true,auth_denied:true,server_only:true}]);
  await db.exec(await readFile(resolve("supabase/tests/native_revision_push.sql"), "utf8"));
  await db.exec(await readFile(resolve("supabase/tests/workspace_job_deletion.sql"), "utf8"));
  const access = await db.query(await readFile(resolve("supabase/tests/rpc_execution_surface.sql"), "utf8"));
  assert.equal(access.rows.length, 24);
  assert.ok(access.rows.every((row) => row.passed), JSON.stringify(access.rows.filter((row) => !row.passed)));
  console.log("PASS: native SQL contract, deletion regression, 24 RPC privilege checks (ephemeral PGlite).");
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  if (error.where) console.error(error.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
