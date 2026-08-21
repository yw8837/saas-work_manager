import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "202608140001_initial.sql"),
  "utf8"
);

const tables = [
  "profiles",
  "service_packages",
  "package_tasks",
  "service_options",
  "option_tasks",
  "jobs",
  "job_options",
  "job_tasks",
  "revision_portals",
  "revision_requests",
  "revision_events",
  "addon_requests",
  "activity_events",
  "notification_preferences",
  "job_notification_settings",
  "push_subscriptions",
  "notification_deliveries",
  "notification_delivery_items",
  "notification_attempts"
];

describe("Supabase migration security contract", () => {
  it("creates every core table and enables RLS through a loop or explicit statement", () => {
    const rlsLoops = [...migration.matchAll(
      /foreach table_name in array array\[([\s\S]*?)\]\s*loop[\s\S]*?enable row level security/g
    )].map((match) => match[1]);

    for (const table of tables) {
      expect(migration).toContain(`create table public.${table}`);
      const loopProtected = rlsLoops.some((loop) => loop.includes(`'${table}'`));
      const explicitProtected = migration.includes(`alter table public.${table} enable row level security`);
      expect(loopProtected || explicitProtected, `${table} must have RLS`).toBe(true);
    }
  });

  it("keeps anonymous access behind the narrow revision RPC", () => {
    expect(migration).not.toMatch(/create policy[\s\S]{0,200}\bto anon\b/i);
    expect(migration).toContain(
      "grant execute on function public.submit_revision_request(text, text, text, uuid, text) to anon, authenticated"
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, extensions");
  });

  it("atomically rate-limits each public portal before accepting a new request", () => {
    const submitRpc = migration.slice(
      migration.indexOf("create or replace function public.submit_revision_request"),
      migration.indexOf("create or replace function public.submit_manual_revision_request")
    );

    expect(submitRpc).toContain("for update of rp");
    expect(submitRpc).toContain("v_portal.last_submission_at > now() - interval '15 seconds'");
    expect(submitRpc).toContain("v_daily_submission_count >= 40");
    expect(submitRpc).toContain("date_trunc('day', now() at time zone 'UTC')");
    expect(migration).toContain("revision_requests_portal_submitted_idx");

    const idempotentReturn = submitRpc.indexOf("if found then");
    const minimumInterval = submitRpc.indexOf("submission rate limit exceeded");
    expect(idempotentReturn).toBeGreaterThan(-1);
    expect(minimumInterval).toBeGreaterThan(idempotentReturn);
  });

  it("matches deterministic package and option composition rules", () => {
    expect(migration).toMatch(
      /create table public\.package_tasks[\s\S]*?task_key text not null[\s\S]*?unique \(package_id, task_key\)/
    );
    expect(migration).toContain(
      "relative_due_days integer not null default 0 check (relative_due_days between 0 and 3650)"
    );
    expect(migration).toContain("price_delta_krw integer not null default 0 check (price_delta_krw >= 0)");
    expect(migration).toContain(
      "duration_delta_days integer not null default 0 check (duration_delta_days between 0 and 3650)"
    );
    expect(migration).toContain(
      "revision_delta integer not null default 0 check (revision_delta between 0 and 999)"
    );

    const optionTasks = migration.slice(
      migration.indexOf("create table public.option_tasks"),
      migration.indexOf("create table public.jobs")
    );
    expect(optionTasks).toContain("task_key text check");
    expect(optionTasks).toContain("target_task_key text check");
    expect(optionTasks).toContain("action = 'add' and task_key is not null and target_task_key is null");
    expect(optionTasks).toContain("action = 'remove' and task_key is null and target_task_key is not null");
    expect(optionTasks).toContain("option_tasks_one_effect_per_key_idx");
    expect(optionTasks).toContain("foreign key (option_id, owner_id)");
  });

  it("keeps revision evidence immutable and the event ledger RPC-only", () => {
    const loopStart = migration.indexOf("foreach table_name in array");
    const loopEnd = migration.indexOf("] loop", loopStart);
    const ownerAllLoop = migration.slice(loopStart, loopEnd);

    expect(ownerAllLoop).not.toContain("'revision_requests'");
    expect(migration).toContain("create policy revision_requests_owner_select");
    expect(migration).toContain(
      "revoke insert, update, delete on table public.revision_requests from anon, authenticated"
    );
    expect(migration).toContain("create trigger revision_requests_protect_evidence");
    expect(migration).toContain("new.body is distinct from old.body");

    expect(migration).toContain("create policy revision_events_owner_select");
    expect(migration).not.toContain("create policy revision_events_owner_insert");
    expect(migration).toContain(
      "revoke insert, update, delete on table public.revision_events from anon, authenticated"
    );
  });

  it("binds one idempotent revert to the matching use event", () => {
    expect(migration).toContain("target_event_id uuid");
    expect(migration).toContain("idempotency_key uuid not null");
    expect(migration).toContain("unique (owner_id, idempotency_key)");
    expect(migration).toContain("revision_events_one_use_per_request_idx");
    expect(migration).toContain("revision_events_one_revert_per_use_idx");
    expect(migration).toContain("create trigger revision_events_validate_chain");
    expect(migration).toContain("revert must target the matching use event");
    expect(migration).toContain("create or replace function public.revert_revision_request");
    expect(migration).toContain(
      "grant execute on function public.revert_revision_request(uuid, text, uuid) to authenticated"
    );
  });

  it("protects server-owned job fields and scopes public idempotency to one portal job", () => {
    const runtimeWriteBoundary = migration.slice(
      migration.indexOf("'jobs', 'job_options', 'job_tasks', 'revision_portals', 'addon_requests'"),
      migration.indexOf("-- Revision evidence")
    );
    expect(runtimeWriteBoundary).toContain(
      "revoke insert, update, delete on table public.%I from anon, authenticated"
    );
    expect(migration).not.toContain(") on table public.jobs to authenticated");
    expect(migration).toContain("create or replace function public.create_job_from_templates");
    expect(migration).toContain("v_total_price := v_package.price_krw::bigint + v_price_delta");
    expect(migration).toContain("v_total_duration := v_package.duration_days::bigint + v_duration_delta");
    expect(migration).toContain("v_total_revision := v_package.revision_limit::bigint + v_revision_delta");
    expect(migration).toContain("creation_request_hash text not null");
    expect(migration).toContain(
      "grant execute on function public.create_job_from_templates(uuid, uuid[], text, date, text, text, text, text, uuid) to authenticated"
    );
    expect(migration).toMatch(
      /create table public\.revision_requests[\s\S]*?foreign key \(job_id, owner_id\) references public\.jobs\(id, owner_id\) on delete restrict/
    );
    expect(migration.match(/v_request\.portal_id is distinct from v_portal\.id/g)).toHaveLength(2);
    expect(migration.match(/v_request\.job_id <> v_portal\.job_id/g)).toHaveLength(2);
  });

  it("keeps runtime mutation and activity history behind owner RPCs", () => {
    expect(migration).not.toContain("create policy activity_events_owner_insert");
    expect(migration).toContain(
      "revoke insert, update, delete on table public.activity_events from anon, authenticated"
    );

    for (const rpc of [
      "set_job_status",
      "set_job_task_status",
      "update_job_links",
      "append_owner_note",
      "rotate_revision_portal",
      "set_revision_portal_enabled",
      "submit_manual_revision_request",
      "create_addon_request",
      "set_addon_status"
    ]) {
      expect(migration).toContain(`create or replace function public.${rpc}`);
      expect(migration).toContain(`revoke all on function public.${rpc}(`);
    }

    expect(migration).toContain("v_owner_id uuid := auth.uid()");
    expect(migration).toContain("'job_created', 'system'");
    expect(migration).not.toMatch(/jsonb_build_object\([^)]*actor/i);
  });
});
