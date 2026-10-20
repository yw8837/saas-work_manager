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
  for (const migration of migrations) {
    try { await db.exec(await readFile(resolve("supabase/migrations", migration), "utf8")); }
    catch (error) { throw new Error(`Migration ${migration}: ${error.message}`, { cause: error }); }
  }
  await db.exec(await readFile(resolve("supabase/tests/native_revision_push.sql"), "utf8"));
  await db.exec(await readFile(resolve("supabase/tests/workspace_job_deletion.sql"), "utf8"));
  const access = await db.query(await readFile(resolve("supabase/tests/rpc_execution_surface.sql"), "utf8"));
  assert.equal(access.rows.length, 23);
  assert.ok(access.rows.every((row) => row.passed), JSON.stringify(access.rows.filter((row) => !row.passed)));
  console.log("PASS: native SQL contract, deletion regression, 23 RPC privilege checks (ephemeral PGlite).");
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  if (error.where) console.error(error.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
