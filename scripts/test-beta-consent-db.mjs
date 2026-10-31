// 베타 신청·광고 동의·수신거부·처리결과 통지 DB 규칙 시험.
// 로컬 임시 PostgreSQL(PGlite)에 모든 migration을 적용하고 실제 SQL을 실행한다. 운영 DB 연결·비밀값 없음.
// 가상 주소(example.invalid)만 쓴다. 시험 이름의 [시험표 N]은 시험계획 v2 시험표 N번째 줄이다.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const OPERATOR = "00000000-0000-4000-8000-0000000000a1";
const STRANGER = "00000000-0000-4000-8000-0000000000b2";
const VERSION = "beta-apply-v1-2026-11-01";

const db = await PGlite.create({ extensions: { pgcrypto } });
const results = [];

async function setup() {
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
    -- Supabase 기본 ACL처럼 새 표·함수 권한을 anon·authenticated에도 준다.
    -- migration이 이 권한을 명시적으로 빼는지까지 시험하려는 것이다.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
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
  const migrations = (await readdir(resolve("supabase/migrations"))).filter((p) => p.endsWith(".sql")).sort();
  for (const migration of migrations) {
    let sql = await readFile(resolve("supabase/migrations", migration), "utf8");
    if (migration === "20261023112855_native_push_scheduler.sql") {
      sql = sql.replace(/^create extension if not exists pg_cron;$/m, "")
        .replace(/^create extension if not exists pg_net with schema extensions;$/m, "");
    }
    try { await db.exec(sql); }
    catch (error) { throw new Error(`Migration ${migration}: ${error.message}`, { cause: error }); }
  }
  await db.exec(`
    insert into auth.users(id, email) values
      ('${OPERATOR}', 'operator@example.invalid'),
      ('${STRANGER}', 'stranger@example.invalid');
    insert into public.beta_operator_accounts(user_id) values ('${OPERATOR}');
  `);
}

/** 역할(anon·authenticated)과 로그인 사용자를 바꿔 SQL을 실행한다. 끝나면 원래 역할로 돌아간다. */
async function as(role, sub, sql, params = []) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function apply(email, overrides = {}) {
  const input = {
    workType: "web", sellsPackages: true, concurrentJobs: "2-3", channels: ["kmong"],
    participation: "beta", privacy: true, ad: false, version: VERSION, ...overrides,
  };
  const { rows } = await as("anon", null, `select * from public.submit_beta_application($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
    email, input.workType, input.sellsPackages, input.concurrentJobs, input.channels,
    input.participation, input.privacy, input.ad, input.version,
  ]);
  return rows[0];
}

async function opsApplications() {
  return (await as("authenticated", OPERATOR, "select * from public.beta_ops_list_applications()")).rows;
}

async function opsNotices() {
  return (await as("authenticated", OPERATOR, "select * from public.beta_ops_list_notices()")).rows;
}

async function latestApplication(email) {
  return (await opsApplications()).find((row) => row.email === email);
}

async function confirm(token) {
  return (await as("anon", null, "select * from public.confirm_beta_email($1)", [token])).rows[0];
}

async function unsubscribe(token) {
  return (await as("anon", null, "select * from public.unsubscribe_beta_ads($1)", [token])).rows[0];
}

async function rejects(promise, message) {
  await assert.rejects(promise, (error) => error.message.includes(message));
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

try {
  await setup();

  await check("[권한] 표는 anon·authenticated가 직접 읽거나 쓰지 못한다", async () => {
    for (const table of [
      "beta_operator_accounts", "beta_applications", "beta_application_links", "beta_unsubscribe_tokens",
      "beta_ad_consent_events", "beta_ad_suppressions", "beta_public_call_counters",
      "beta_deletion_requests", "beta_ad_exclusions",
    ]) {
      for (const role of ["anon", "authenticated"]) {
        for (const privilege of ["select", "insert", "update", "delete"]) {
          const { rows } = await db.query(`select has_table_privilege($1, $2, $3) as allowed`, [role, `public.${table}`, privilege]);
          assert.equal(rows[0].allowed, false, `${role} ${privilege} ${table}`);
        }
      }
    }
    await rejects(as("anon", null, "select * from public.beta_applications"), "permission denied");
  });

  await check("[권한] 운영자 RPC는 anon이 실행할 수 없고, 운영자 표에 없는 로그인 계정은 not_operator", async () => {
    await rejects(as("anon", null, "select * from public.beta_ops_list_applications()"), "permission denied");
    await rejects(as("authenticated", STRANGER, "select * from public.beta_ops_list_applications()"), "not_operator");
    await rejects(as("authenticated", STRANGER, "select public.beta_ops_purge_expired()"), "not_operator");
    await rejects(as("authenticated", null, "select * from public.beta_ops_list_notices()"), "not_operator");
    const helper = await db.query(`select
      has_function_privilege('anon','ilgam_private.beta_ad_status(text)','execute') as anon_status,
      has_function_privilege('authenticated','ilgam_private.beta_take_call(text,integer,integer)','execute') as auth_take`);
    assert.deepEqual(helper.rows[0], { anon_status: false, auth_take: false });
    // 내부 도우미(ilgam_private.beta_*)는 전부 anon·authenticated가 실행할 수 없다.
    const helpers = await db.query(`
      select p.oid::regprocedure::text as signature,
        has_function_privilege('anon', p.oid, 'execute') as anon_allowed,
        has_function_privilege('authenticated', p.oid, 'execute') as auth_allowed
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'ilgam_private' and p.proname like 'beta\\_%'
      order by 1`);
    assert.equal(helpers.rows.length, 9, helpers.rows.map((row) => row.signature).join(", "));
    assert.ok(helpers.rows.every((row) => !row.anon_allowed && !row.auth_allowed), JSON.stringify(helpers.rows));
  });

  await check("[시험표 3] 필수 동의를 거부하면 제출할 수 없다", async () => {
    await rejects(apply("test03-a@example.invalid", { privacy: false }), "privacy_consent_required");
    assert.equal(await latestApplication("test03-a@example.invalid"), undefined);
  });

  await check("[시험표 3] 선택 항목(주문 받는 곳)을 비우고 광고에 동의하지 않아도 신청된다", async () => {
    const result = await apply("test03-b@example.invalid", { channels: [], ad: false });
    assert.equal(result.status, "received");
    assert.equal(result.ad_event_kind, null);
    const row = await latestApplication("test03-b@example.invalid");
    assert.deepEqual(row.order_channels, []);
    assert.equal(row.ad_status, "none");
  });

  await check("[시험표 3] 잘못된 입력(주소 형식·선택지·문구 판본)은 저장하지 않는다", async () => {
    await rejects(apply("not-an-email"), "invalid_beta_application");
    await rejects(apply("test03-c@example.invalid", { concurrentJobs: "5" }), "invalid_beta_application");
    await rejects(apply("test03-c@example.invalid", { channels: ["instagram"] }), "invalid_beta_application");
    await rejects(apply("test03-c@example.invalid", { version: "made-up" }), "invalid_beta_application");
    assert.equal(await latestApplication("test03-c@example.invalid"), undefined);
  });

  await check("[시험표 1·2] 참여 희망 3 × 광고 2 × 적격/미충족 12사례: 판정, 통지 기록, 광고 대상", async () => {
    let index = 0;
    for (const participation of ["interview", "beta", "both"]) {
      for (const ad of [true, false]) {
        for (const eligibleCase of [true, false]) {
          index += 1;
          const email = `test-route${String(index).padStart(2, "0")}@example.invalid`;
          // 미충족 사례는 번갈아 '패키지 판매 아니오'와 '동시 1건'으로 만든다.
          const overrides = eligibleCase
            ? { sellsPackages: true, concurrentJobs: index % 2 ? "2-3" : "4+" }
            : index % 2 ? { sellsPackages: false, concurrentJobs: "4+" } : { sellsPackages: true, concurrentJobs: "1" };
          const result = await apply(email, { participation, ad, workType: index % 3 ? "design" : "other", ...overrides });
          assert.equal(result.status, "received");
          // 광고 동의 의사표시는 적격 여부와 상관없이 처리결과 통지 대상이다.
          assert.equal(result.ad_event_kind, ad ? "consent" : null);
          const row = await latestApplication(email);
          assert.equal(row.eligible, eligibleCase, email);
          assert.equal(row.participation, participation);
          if (ad) {
            const { rows } = await db.query(
              "select application.confirm_token from public.beta_application_links application join public.beta_applications a on a.id = application.application_id where a.email = $1",
              [email],
            );
            assert.equal((await confirm(rows[0].confirm_token)).status, "confirmed");
          }
          const confirmed = await latestApplication(email);
          // 광고 대상은 적격 + 광고 동의 + 주소 확인일 때만. 미충족이면 동의해도 대상이 아니다(D1 기본 동작).
          assert.equal(confirmed.ad_target, ad && eligibleCase, `${email} ad_target`);
          assert.equal(confirmed.ad_status, ad ? "active" : "none");
        }
      }
    }
    const notices = await opsNotices();
    const routeNotices = notices.filter((notice) => notice.kind === "consent" && notice.source === "apply_form");
    assert.ok(routeNotices.length >= 6);
  });

  await check("[시험표 2] 적격이어도 미선정으로 결과 안내를 보내면 광고 대상에서 빠지고 1개월 뒤 정리 대상이 된다", async () => {
    await apply("test02-selected@example.invalid", { ad: true });
    const before = await latestApplication("test02-selected@example.invalid");
    await confirm(before.confirm_token);
    assert.equal((await latestApplication("test02-selected@example.invalid")).ad_target, true);
    const { rows } = await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'result_sent','not_selected') as purge_after", [before.id]);
    const after = await latestApplication("test02-selected@example.invalid");
    assert.equal(after.ad_target, false);
    assert.equal(after.outcome, "not_selected");
    const diff = await db.query("select $2::timestamptz + interval '1 month' = $1::timestamptz as ok", [rows[0].purge_after, after.result_sent_at]);
    assert.equal(diff.rows[0].ok, true);
  });

  await check("[시험표 2] 미충족 신청은 결과를 '조건과 맞지 않음'으로만 기록할 수 있다", async () => {
    await apply("test02-unmatched@example.invalid", { sellsPackages: false });
    const row = await latestApplication("test02-unmatched@example.invalid");
    await rejects(as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'result_sent','beta')", [row.id]), "invalid_outcome");
    await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'result_sent','not_matched')", [row.id]);
    assert.equal((await latestApplication("test02-unmatched@example.invalid")).outcome, "not_matched");
  });

  await check("[보관] 인터뷰만 6개월·베타 종료 후 6개월로 정리 예정일을 계산하고, 지난 것만 정리한다", async () => {
    await apply("test-keep-interview@example.invalid", { participation: "interview" });
    await apply("test-keep-beta@example.invalid", { participation: "both" });
    const interview = await latestApplication("test-keep-interview@example.invalid");
    const beta = await latestApplication("test-keep-beta@example.invalid");
    await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'result_sent','interview')", [interview.id]);
    assert.equal((await latestApplication("test-keep-interview@example.invalid")).purge_after, null);
    const done = await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'interview_done',null) as at", [interview.id]);
    const interviewAfter = await latestApplication("test-keep-interview@example.invalid");
    assert.equal(
      (await db.query("select $2::timestamptz + interval '6 months' = $1::timestamptz as ok", [done.rows[0].at, interviewAfter.interview_done_at])).rows[0].ok,
      true,
    );
    await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'result_sent','beta')", [beta.id]);
    await rejects(as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'interview_done',null)", [beta.id]), "invalid_milestone");
    await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'beta_ended',null)", [beta.id]);
    assert.notEqual((await latestApplication("test-keep-beta@example.invalid")).purge_after, null);

    // 기한이 지난 한 건만 만든다(시간을 앞당기는 대신 기한을 과거로 옮긴다).
    await db.query("update public.beta_applications set purge_after = now() - interval '1 day' where email = 'test-keep-interview@example.invalid'");
    const purged = await as("authenticated", OPERATOR, "select public.beta_ops_purge_expired() as count");
    assert.equal(purged.rows[0].count, 1);
    assert.equal(await latestApplication("test-keep-interview@example.invalid"), undefined);
    assert.ok(await latestApplication("test-keep-beta@example.invalid"));
  });

  await check("[시험표 4] 신규 미동의 / 기존 동의 유지 / 철회 후 재신청: 체크하지 않은 재신청은 상태를 덮어쓰지 않는다", async () => {
    const email = "test04@example.invalid";
    await apply(email, { ad: false });
    assert.equal((await latestApplication(email)).ad_status, "none");

    await apply(email, { ad: true });
    const consented = await latestApplication(email);
    assert.equal(consented.ad_status, "pending");
    await confirm(consented.confirm_token);
    assert.equal((await latestApplication(email)).ad_status, "active");

    // 기존 동의 + 이번에는 체크 안 함 → 동의 유지(철회로 보지 않는다).
    await apply(email, { ad: false });
    assert.equal((await latestApplication(email)).ad_status, "active");

    const withdrawn = await unsubscribe(consented.unsubscribe_token);
    assert.equal(withdrawn.status, "withdrawn");
    assert.equal((await latestApplication(email)).ad_status, "withdrawn");

    // 철회 뒤 체크 없이 재신청 → 철회 그대로.
    await db.exec("delete from public.beta_public_call_counters");
    await apply(email, { ad: false });
    assert.equal((await latestApplication(email)).ad_status, "withdrawn");
    // 철회 뒤에 옛 확인 링크를 다시 눌러도 동의가 되살아나지 않는다.
    assert.equal((await confirm(consented.confirm_token)).ad_active, false);
    assert.equal((await latestApplication(email)).ad_status, "withdrawn");

    // 새로 체크해야만 동의(확인 대기)로, 주소 확인 뒤에야 유효로 돌아온다.
    await apply(email, { ad: true });
    const renewed = await latestApplication(email);
    assert.equal(renewed.ad_status, "pending");
    assert.equal(renewed.suppressed, true);
    assert.equal(renewed.ad_target, false);
    const result = await confirm(renewed.confirm_token);
    assert.deepEqual(result, { status: "confirmed", ad_active: true });
    const restored = await latestApplication(email);
    assert.equal(restored.ad_status, "active");
    assert.equal(restored.suppressed, false);
    assert.equal(restored.ad_target, true);

    // 이미 유효한 사람이 다시 체크해도 '확인 대기'로 내려가지 않는다.
    await db.exec("delete from public.beta_public_call_counters");
    assert.equal((await apply(email, { ad: true })).ad_event_kind, "consent");
    assert.equal((await latestApplication(email)).ad_status, "active");
  });

  await check("[시험표 5] 동의·거부·철회마다 통지 기록 1건: 의사표시 시각, 화면 표시 시각, 14일 마감, 이메일 통지 표시", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const consentEmail = "test05-consent@example.invalid";
    const submitted = await apply(consentEmail, { ad: true });
    assert.equal(submitted.ad_event_kind, "consent");
    assert.equal(
      (await db.query("select $2::timestamptz + interval '14 days' = $1::timestamptz as ok", [submitted.ad_notice_due_at, submitted.ad_event_at])).rows[0].ok,
      true,
    );
    const consentRow = await latestApplication(consentEmail);
    // 아직 동의한 적 없는 주소의 수신거부 = 거부.
    const refuseEmail = "test05-refuse@example.invalid";
    await apply(refuseEmail, { ad: false });
    const refuseRow = await latestApplication(refuseEmail);
    const refused = await unsubscribe(refuseRow.unsubscribe_token);
    assert.equal(refused.status, "refused");
    const withdrawn = await unsubscribe(consentRow.unsubscribe_token);
    assert.equal(withdrawn.status, "withdrawn");

    const notices = await opsNotices();
    const mine = notices.filter((notice) => [consentRow.id, refuseRow.id].includes(notice.application_id));
    assert.deepEqual(mine.map((notice) => notice.kind).sort(), ["consent", "refuse", "withdraw"]);
    for (const notice of mine) {
      assert.ok(notice.occurred_at instanceof Date);
      assert.ok(notice.notice_shown_at instanceof Date, "화면 표시 시각");
      assert.equal(notice.notice_due_at.getTime() - notice.occurred_at.getTime(), 14 * 24 * 3600 * 1000);
      assert.equal(notice.notice_emailed_at, null);
    }
    const target = mine.find((notice) => notice.kind === "withdraw");
    const marked = await as("authenticated", OPERATOR, "select public.beta_ops_mark_notice_emailed($1) as at", [target.event_id]);
    const again = await as("authenticated", OPERATOR, "select public.beta_ops_mark_notice_emailed($1) as at", [target.event_id]);
    assert.equal(marked.rows[0].at.getTime(), again.rows[0].at.getTime(), "두 번 눌러도 처음 시각을 유지");
    // 체크하지 않은 신청은 의사표시가 아니라서 통지 기록이 생기지 않는다.
    const unchecked = await apply("test05-none@example.invalid", { ad: false });
    assert.equal(unchecked.ad_event_kind, null);
  });

  await check("[시험표 6] 로그인하지 않은 상태(anon)로 수신거부가 추가 개인정보 없이 처리된다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    await apply("test06@example.invalid", { ad: true });
    const row = await latestApplication("test06@example.invalid");
    const result = await unsubscribe(row.unsubscribe_token);
    assert.deepEqual(Object.keys(result).sort(), ["event_at", "event_kind", "notice_state", "status"]);
    assert.equal(result.notice_state, "email_pending");
    assert.equal(result.status, "withdrawn");
    assert.ok(!JSON.stringify(result).includes("example.invalid"), "응답에 주소가 없다");
  });

  await check("[시험표 7] 수신거부 직후 다음 광고 대상 목록에서 바로 빠진다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test07@example.invalid";
    await apply(email, { ad: true });
    const row = await latestApplication(email);
    await confirm(row.confirm_token);
    assert.equal((await latestApplication(email)).ad_target, true);
    await unsubscribe(row.unsubscribe_token);
    const after = await latestApplication(email);
    assert.equal(after.ad_target, false);
    assert.equal(after.suppressed, true);
    // 운영 연락 목록(신청 정보)은 그대로 남는다. 운영 안내는 목적에 따라 따로 보낸다.
    assert.equal(after.email, email);
  });

  await check("[시험표 8] 같은 링크 재클릭은 같은 결과, 무효·형식 오류 링크는 오류 없이 invalid, 만료된 확인 링크는 expired", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test08@example.invalid";
    await apply(email, { ad: true });
    const row = await latestApplication(email);
    const first = await unsubscribe(row.unsubscribe_token);
    const second = await unsubscribe(row.unsubscribe_token);
    assert.equal(first.status, "withdrawn");
    assert.equal(second.status, "already");
    assert.equal(second.event_kind, first.event_kind);
    assert.equal(second.event_at.getTime(), first.event_at.getTime());
    const events = await db.query("select count(*)::int as n from public.beta_ad_consent_events where kind='withdraw' and application_id is null and email_hash = (select email_hash from public.beta_applications where email = $1 limit 1)", [email]);
    assert.equal(events.rows[0].n, 1, "재클릭으로 이력이 두 번 쌓이지 않는다");

    for (const token of ["", "short", "x".repeat(43), "a".repeat(43) + "<script>", "' or 1=1 --".padEnd(50, "a")]) {
      assert.equal((await unsubscribe(token)).status, "invalid", token);
      assert.equal((await confirm(token)).status, "invalid", token);
    }

    await apply("test08-expired@example.invalid", { ad: true });
    const expired = await latestApplication("test08-expired@example.invalid");
    await db.query("update public.beta_applications set confirm_expires_at = now() - interval '1 second' where id = $1", [expired.id]);
    assert.deepEqual(await confirm(expired.confirm_token), { status: "expired", ad_active: false });
    assert.equal((await latestApplication("test08-expired@example.invalid")).ad_status, "pending");

    await apply("test08-twice@example.invalid", { ad: true });
    const twice = await latestApplication("test08-twice@example.invalid");
    assert.deepEqual(await confirm(twice.confirm_token), { status: "confirmed", ad_active: true });
    assert.deepEqual(await confirm(twice.confirm_token), { status: "already_confirmed", ad_active: true });
  });

  await check("[시험표 9] 링크를 여는 것만으로는 처리되지 않는다: 토큰으로 상태를 읽는 공개 함수가 없다", async () => {
    const { rows } = await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proname like '%beta%')
        and has_function_privilege('anon', p.oid, 'execute')
      order by 1`);
    // 공개 함수는 처리 3개뿐이고, 각각 버튼을 눌렀을 때만 부른다(화면은 GET에서 부르지 않는다).
    assert.deepEqual(rows.map((row) => row.proname), ["confirm_beta_email", "submit_beta_application", "unsubscribe_beta_ads"]);
  });

  await check("[시험표 10] 삭제 요청: 같은 주소의 신청 정보는 지우고, 발송금지 해시와 동의·철회 증빙은 남기고, 다른 사람은 그대로", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test10@example.invalid";
    await apply(email, { ad: true, participation: "interview" });
    await apply(email, { ad: false, participation: "beta" });
    await apply("test10-other@example.invalid", { ad: true });
    const row = await latestApplication(email);
    const result = await as("authenticated", OPERATOR, "select * from public.beta_ops_delete_application($1)", [row.id]);
    assert.equal(result.rows[0].deleted_count, 2);
    assert.ok(result.rows[0].withdraw_event_id, "광고 동의가 있었으면 철회로 기록");
    assert.equal((await opsApplications()).filter((item) => item.email === email).length, 0);
    const leftovers = await db.query(`
      select
        (select count(*)::int from public.beta_application_links l where not exists (select 1 from public.beta_applications a where a.id = l.application_id)) as orphan_links,
        (select count(*)::int from public.beta_ad_suppressions where email_hash = encode(extensions.digest('ilgamcheck-beta-ad:' || $1, 'sha256'), 'hex')) as suppressed,
        (select count(*)::int from public.beta_ad_consent_events where email_hash = encode(extensions.digest('ilgamcheck-beta-ad:' || $1, 'sha256'), 'hex')) as evidence,
        (select count(*)::int from public.beta_ad_suppressions s where s.email_hash = $1) as raw_address_rows`, [email]);
    assert.deepEqual(leftovers.rows[0], { orphan_links: 0, suppressed: 1, evidence: 2, raw_address_rows: 0 });
    assert.ok(await latestApplication("test10-other@example.invalid"), "다른 신청자는 지우지 않는다");
    // 이미 보낸 메일의 수신거부 링크는 지운 뒤에도 오류 없이 '이미 처리됨'으로 안내된다.
    assert.equal((await unsubscribe(row.unsubscribe_token)).status, "already");
    // 지운 신청의 통지 기록은 신청과 끊기지만, 통지를 보낼 때까지는 삭제 요청 기록의 주소로 보낼 수 있다(리뷰 6).
    const notice = (await opsNotices()).find((item) => item.event_id === result.rows[0].withdraw_event_id);
    assert.equal(notice.application_id, null);
    assert.equal(notice.source, "deletion_request");
    assert.equal(notice.recipient_email, email);
  });

  await check("[시험표 11] 수신자 대체 ①: A·B가 잇달아 신청해도 링크·상태가 각자 레코드에만 묶인다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    await apply("test-a@example.invalid", { ad: true, participation: "interview" });
    await apply("test-b@example.invalid", { ad: true, participation: "beta" });
    const a = await latestApplication("test-a@example.invalid");
    const b = await latestApplication("test-b@example.invalid");
    assert.notEqual(a.confirm_token, b.confirm_token);
    assert.notEqual(a.unsubscribe_token, b.unsubscribe_token);
    await confirm(a.confirm_token);
    assert.equal((await latestApplication("test-a@example.invalid")).ad_status, "active");
    assert.equal((await latestApplication("test-b@example.invalid")).ad_status, "pending", "A의 확인이 B를 바꾸지 않는다");
    await unsubscribe(b.unsubscribe_token);
    assert.equal((await latestApplication("test-a@example.invalid")).ad_status, "active", "B의 수신거부가 A를 바꾸지 않는다");
    assert.equal((await latestApplication("test-b@example.invalid")).ad_status, "withdrawn");
  });

  await check("[시험표 12] 수신자 대체 ②: 남의 주소로 광고 동의해도 확인 전에는 유효가 아니고, 신청 응답에 확인 토큰이 없다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const result = await apply("test-c@example.invalid", { ad: true });
    assert.deepEqual(Object.keys(result).sort(), ["ad_event_at", "ad_event_kind", "ad_notice_due_at", "status"]);
    const row = await latestApplication("test-c@example.invalid");
    assert.ok(!JSON.stringify(result).includes(row.confirm_token));
    assert.equal(row.ad_status, "pending");
    assert.equal(row.ad_target, false);
    assert.equal(row.email_confirmed_at, null);
    // 주소 주인은 확인하지 않고 바로 거부할 수 있다(추가 개인정보 없이).
    assert.equal((await unsubscribe(row.unsubscribe_token)).status, "withdrawn");
    assert.equal((await latestApplication("test-c@example.invalid")).ad_target, false);
    // 거부한 뒤 (아직 누르지 않았던) 확인 링크를 눌러도 동의가 되살아나지 않는다.
    assert.deepEqual(await confirm(row.confirm_token), { status: "confirmed", ad_active: false });
    const after = await latestApplication("test-c@example.invalid");
    assert.equal(after.ad_status, "withdrawn");
    assert.equal(after.suppressed, true);
    assert.equal(after.ad_target, false);
  });

  await check("[호출 제한] 같은 주소는 시간당 3건까지, 넘으면 저장하지 않고 rate_limited", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test-rate@example.invalid";
    for (let index = 0; index < 3; index += 1) assert.equal((await apply(email)).status, "received");
    assert.equal((await apply(email)).status, "rate_limited");
    assert.equal((await opsApplications()).filter((row) => row.email === email).length, 3);
  });

  const callsIn = async (bucket) => (await db.query(
    "select coalesce(sum(calls), 0)::int as calls from public.beta_public_call_counters where bucket = $1",
    [bucket],
  )).rows[0].calls;

  await check("[리뷰 2] 주소별 한도에 걸린 신청은 전체 신청 한도를 쓰지 않는다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test-r2-apply@example.invalid";
    for (let index = 0; index < 3; index += 1) assert.equal((await apply(email)).status, "received");
    for (let index = 0; index < 20; index += 1) assert.equal((await apply(email)).status, "rate_limited");
    assert.equal(await callsIn("apply:all:hour"), 3);
  });

  await check("[리뷰 2] 형식만 맞는 무효 토큰을 많이 보내도 정상 주소 확인·수신거부는 막히지 않는다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    await apply("test-r2-link@example.invalid", { ad: true });
    const row = await latestApplication("test-r2-link@example.invalid");
    for (let index = 0; index < 130; index += 1) {
      const fake = `fake${index}`.padEnd(43, "z");
      assert.equal((await unsubscribe(fake)).status, "invalid");
      assert.equal((await confirm(fake)).status, "invalid");
    }
    assert.deepEqual(await confirm(row.confirm_token), { status: "confirmed", ad_active: true });
    assert.equal((await unsubscribe(row.unsubscribe_token)).status, "withdrawn");
  });

  await check("[리뷰 2] 같은 링크를 분당 10번 넘게 누르면 그 링크만 rate_limited, 다른 링크는 그대로", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    await apply("test-r2-hot@example.invalid", { ad: true });
    await apply("test-r2-cold@example.invalid", { ad: true });
    const hot = await latestApplication("test-r2-hot@example.invalid");
    const cold = await latestApplication("test-r2-cold@example.invalid");
    const statuses = [];
    for (let index = 0; index < 11; index += 1) statuses.push((await unsubscribe(hot.unsubscribe_token)).status);
    assert.deepEqual(statuses, ["withdrawn", ...Array(9).fill("already"), "rate_limited"]);
    assert.equal((await unsubscribe(cold.unsubscribe_token)).status, "withdrawn");
  });

  await check("[리뷰 5] 같은 주소가 다시 신청해 새 신청이 미선정이면 과거 적격 신청이 있어도 광고 대상이 아니다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test-r5@example.invalid";
    await apply(email, { ad: true });
    await confirm((await latestApplication(email)).confirm_token);
    assert.equal((await latestApplication(email)).ad_target, true);
    await apply(email, { ad: false });
    const rows = (await opsApplications()).filter((row) => row.email === email);
    assert.equal(rows.length, 2);
    const newest = rows.reduce((a, b) => (a.created_at > b.created_at ? a : b));
    await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'result_sent','not_selected')", [newest.id]);
    const after = (await opsApplications()).filter((row) => row.email === email);
    assert.deepEqual(after.map((row) => row.ad_target), [false, false]);
  });

  await check("[리뷰 5] 최근 신청이 미충족이면 과거 적격 신청이 있어도 광고 대상이 아니다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test-r5-unmatched@example.invalid";
    await apply(email, { ad: true });
    await confirm((await latestApplication(email)).confirm_token);
    await apply(email, { ad: false, sellsPackages: false });
    const after = (await opsApplications()).filter((row) => row.email === email);
    assert.deepEqual(after.map((row) => row.ad_target), [false, false]);
  });

  await check("[리뷰 6] 삭제 요청 전 못 보낸 통지는 삭제 뒤에도 받는 주소가 남고, 통지를 다 보낸 뒤에야 삭제 결과 안내를 끝내며 그때 주소를 지운다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test-r6@example.invalid";
    await apply(email, { ad: true });
    const row = await latestApplication(email);
    const result = await as("authenticated", OPERATOR, "select * from public.beta_ops_delete_application($1)", [row.id]);
    assert.ok(result.rows[0].deletion_id, "삭제 요청 기록 id");
    assert.equal((await opsApplications()).filter((item) => item.email === email).length, 0);

    const pending = (await opsNotices()).filter((notice) => notice.recipient_email === email);
    assert.deepEqual(pending.map((notice) => notice.kind).sort(), ["consent", "withdraw"]);
    assert.ok(pending.every((notice) => notice.notice_emailed_at === null));

    const listDeletions = async () => (await as("authenticated", OPERATOR, "select * from public.beta_ops_list_deletions()")).rows
      .filter((item) => item.id === result.rows[0].deletion_id);
    assert.equal((await listDeletions())[0].email, email);
    await rejects(
      as("authenticated", OPERATOR, "select public.beta_ops_mark_deletion_emailed($1)", [result.rows[0].deletion_id]),
      "notices_pending",
    );
    for (const notice of pending) {
      await as("authenticated", OPERATOR, "select public.beta_ops_mark_notice_emailed($1)", [notice.event_id]);
    }
    await as("authenticated", OPERATOR, "select public.beta_ops_mark_deletion_emailed($1)", [result.rows[0].deletion_id]);
    const done = (await listDeletions())[0];
    assert.equal(done.email, null, "삭제 결과 안내를 보낸 뒤에는 주소를 남기지 않는다");
    assert.ok(done.result_emailed_at instanceof Date);
    const raw = await db.query("select count(*)::int as n from public.beta_deletion_requests where email is not null and id = $1", [result.rows[0].deletion_id]);
    assert.equal(raw.rows[0].n, 0);
    await rejects(as("anon", null, "select * from public.beta_ops_list_deletions()"), "permission denied");
  });

  await check("[리뷰 6] 보유기간이 지나도 그 주소로 보내지 않은 통지가 남아 있으면 정리하지 않고, 통지를 보낸 뒤 정리한다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test-r6-purge@example.invalid";
    await apply(email, { ad: true, sellsPackages: false });
    const row = await latestApplication(email);
    await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'result_sent','not_matched')", [row.id]);
    await db.query("update public.beta_applications set purge_after = now() - interval '1 day' where id = $1", [row.id]);
    assert.equal((await as("authenticated", OPERATOR, "select public.beta_ops_purge_expired() as count")).rows[0].count, 0);
    assert.ok(await latestApplication(email));
    const notice = (await opsNotices()).find((item) => item.recipient_email === email);
    await as("authenticated", OPERATOR, "select public.beta_ops_mark_notice_emailed($1)", [notice.event_id]);
    assert.equal((await as("authenticated", OPERATOR, "select public.beta_ops_purge_expired() as count")).rows[0].count, 1);
    assert.equal(await latestApplication(email), undefined);
  });

  const markAllNoticesFor = async (email) => {
    for (const notice of (await opsNotices()).filter((item) => item.recipient_email === email && !item.notice_emailed_at)) {
      await as("authenticated", OPERATOR, "select public.beta_ops_mark_notice_emailed($1)", [notice.event_id]);
    }
  };
  const expireAndPurge = async (applicationId) => {
    await db.query("update public.beta_applications set purge_after = now() - interval '1 day' where id = $1", [applicationId]);
    return (await as("authenticated", OPERATOR, "select public.beta_ops_purge_expired() as count")).rows[0].count;
  };

  await check("[재검토 1] 같은 주소의 새 신청을 미선정 안내한 뒤 그 신청을 보유기간 정리해도, 남은 과거 적격 신청은 광고 대상이 되지 않는다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test-rc1-a@example.invalid";
    await apply(email, { ad: true });
    await confirm((await latestApplication(email)).confirm_token);
    await apply(email, { ad: false });
    const rows = (await opsApplications()).filter((row) => row.email === email);
    const newest = rows.reduce((a, b) => (a.created_at > b.created_at ? a : b));
    await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'result_sent','not_selected')", [newest.id]);
    await markAllNoticesFor(email);
    assert.equal(await expireAndPurge(newest.id), 1);
    const remaining = (await opsApplications()).filter((row) => row.email === email);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].ad_target, false, "미선정 정리 뒤에도 광고 제외 유지");
  });

  await check("[재검토 1] 미선정 신청을 모두 정리한 뒤 같은 주소가 다시 적격으로 신청해도(광고 체크 없음·있음) 이번 모집 광고 대상이 아니다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test-rc1-b@example.invalid";
    await apply(email, { ad: true });
    const first = await latestApplication(email);
    await confirm(first.confirm_token);
    await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'result_sent','not_selected')", [first.id]);
    await markAllNoticesFor(email);
    assert.equal(await expireAndPurge(first.id), 1);
    assert.equal(await latestApplication(email), undefined);

    await apply(email, { ad: false });
    const noAd = await latestApplication(email);
    assert.equal(noAd.ad_status, "active", "동의 이력은 그대로");
    assert.equal(noAd.ad_target, false, "광고 체크 없이 재신청");

    await apply(email, { ad: true });
    const withAd = (await opsApplications()).filter((row) => row.email === email).reduce((a, b) => (a.created_at > b.created_at ? a : b));
    await confirm(withAd.confirm_token);
    const after = (await opsApplications()).filter((row) => row.email === email);
    assert.deepEqual(after.map((row) => row.ad_target), [false, false], "광고 체크하고 재신청");
    // 광고 제외 근거는 주소 원문 없이 해시로만 남는다.
    const raw = await db.query("select count(*)::int as n from public.beta_ad_exclusions where email_hash = $1", [email]);
    assert.equal(raw.rows[0].n, 0);
    const hashed = await db.query(
      "select count(*)::int as n from public.beta_ad_exclusions where email_hash = encode(extensions.digest('ilgamcheck-beta-ad:' || $1, 'sha256'), 'hex')",
      [email],
    );
    assert.equal(hashed.rows[0].n, 1);
  });

  await check("[재검토 2] 전체 신청 한도가 찬 뒤 새 주소로 거절되는 요청은 카운터 행을 새로 만들지 않는다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    await db.exec(`insert into public.beta_public_call_counters (bucket, window_start, calls)
      values ('apply:all:hour', to_timestamp(floor(extract(epoch from clock_timestamp()) / 3600) * 3600), 300)`);
    const before = (await db.query("select count(*)::int as n from public.beta_public_call_counters")).rows[0].n;
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await apply(`test-rc2-${index}@example.invalid`)).status, "rate_limited");
    }
    const after = (await db.query("select count(*)::int as n from public.beta_public_call_counters")).rows[0].n;
    assert.equal(after, before, "거절된 요청이 주소별 카운터 행을 만들었다");
    assert.equal((await opsApplications()).filter((row) => row.email.startsWith("test-rc2-")).length, 0);
  });

  await check("[재검토 2] 주소별 한도에 걸린 요청은 여전히 전체 예산을 쓰지 않고, 통과한 요청만 주소별·전체 카운터를 함께 센다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test-rc2-same@example.invalid";
    for (let index = 0; index < 3; index += 1) assert.equal((await apply(email)).status, "received");
    for (let index = 0; index < 5; index += 1) assert.equal((await apply(email)).status, "rate_limited");
    assert.equal(await callsIn("apply:all:hour"), 3);
    const perEmail = await db.query("select coalesce(sum(calls), 0)::int as n from public.beta_public_call_counters where bucket like 'apply:%:hour' and bucket <> 'apply:all:hour'");
    assert.equal(perEmail.rows[0].n, 3);
  });

  await check("[재검토 3] 보유기간 정리 뒤 옛 수신거부 링크로 철회하면 처리는 되고, 통지 기록은 '화면 통지함·이메일 주소 없음(정리됨)'으로 정확히 남는다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test-rc3@example.invalid";
    await apply(email, { ad: true });
    const row = await latestApplication(email);
    await confirm(row.confirm_token);
    await markAllNoticesFor(email);
    await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'result_sent','beta')", [row.id]);
    await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'beta_ended',null)", [row.id]);
    assert.equal(await expireAndPurge(row.id), 1);

    const result = await unsubscribe(row.unsubscribe_token);
    assert.equal(result.status, "withdrawn");
    assert.equal(result.notice_state, "screen_only", "이메일로 따로 알릴 주소가 없음을 화면에 알린다");
    const notice = (await opsNotices()).find((item) => item.kind === "withdraw" && item.occurred_at.getTime() === result.event_at.getTime());
    assert.equal(notice.recipient_email, null);
    assert.equal(notice.email_unavailable, true);
    assert.ok(notice.notice_shown_at instanceof Date, "화면 통지 시각");
    assert.equal(notice.notice_emailed_at, null);
    // 주소를 새로 남기지 않는다.
    const kept = await db.query("select count(*)::int as n from public.beta_deletion_requests where email = $1", [email]);
    assert.equal(kept.rows[0].n, 0);
    // 화면 통지만 가능한 건은 정리·삭제 완료를 막는 '보내야 할 통지'로 세지 않는다.
    await apply(email, { ad: false });
    const again = await latestApplication(email);
    await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'result_sent','not_selected')", [again.id]);
    assert.equal(await expireAndPurge(again.id), 1);
    // 두 번째 클릭도 같은 결과.
    const second = await unsubscribe(row.unsubscribe_token);
    assert.equal(second.status, "already");
    assert.equal(second.notice_state, "screen_only");
  });

  await check("[재검토2 1] 통지까지 끝난 옛 수신거부 링크를 정리 뒤 다시 누르면 already·통지 완료(emailed)로 답하고 새 통지를 만들지 않는다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test-rc21@example.invalid";
    await apply(email, { ad: true });
    const row = await latestApplication(email);
    await confirm(row.confirm_token);
    const first = await unsubscribe(row.unsubscribe_token);
    assert.equal(first.status, "withdrawn");
    assert.equal(first.notice_state, "email_pending", "새 철회는 메일로 보낼 예정");
    // 통지를 보내기 전 재클릭: 이미 처리됨, 새 발송 약속 없음(메일은 처음 처리 때 정한 대로).
    const beforeEmailed = await unsubscribe(row.unsubscribe_token);
    assert.equal(beforeEmailed.status, "already");
    assert.equal(beforeEmailed.notice_state, "email_pending");
    await markAllNoticesFor(email);
    await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'result_sent','beta')", [row.id]);
    await as("authenticated", OPERATOR, "select public.beta_ops_record_milestone($1,'beta_ended',null)", [row.id]);
    assert.equal(await expireAndPurge(row.id), 1);
    const eventsBefore = (await db.query("select count(*)::int as n from public.beta_ad_consent_events")).rows[0].n;
    const again = await unsubscribe(row.unsubscribe_token);
    assert.equal(again.status, "already");
    assert.equal(again.notice_state, "emailed", "이미 메일로 통지를 마친 건");
    assert.equal(again.event_at.getTime(), first.event_at.getTime());
    assert.equal((await db.query("select count(*)::int as n from public.beta_ad_consent_events")).rows[0].n, eventsBefore);
  });

  /** 트랜잭션 안에서 SQL을 실행한 뒤 이 세션이 쥔 advisory 잠금 키를 읽고 되돌린다(트랜잭션 잠금은 끝까지 유지된다). */
  const advisoryKeysDuring = async (role, sub, sql, params = []) => {
    await db.exec("begin");
    try {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [sub ?? ""]);
      await db.exec("savepoint probe");
      try {
        await db.query(sql, params);
        await db.exec("release savepoint probe");
      } catch {
        // 실패하면 그 안에서 잡은 잠금도 풀리므로, 아래 비교에서 키가 없어 시험이 실패한다.
        await db.exec("rollback to savepoint probe");
      }
      await db.exec("reset role");
      const { rows } = await db.query(
        "select classid::bigint as c, objid::bigint as o from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() order by 1, 2",
      );
      return rows.map((row) => `${row.c}:${row.o}`);
    } finally {
      await db.exec("rollback");
    }
  };
  const expectedKey = async (email) => advisoryKeysDuring("postgres", null,
    "select ilgam_private.beta_lock_email(encode(extensions.digest('ilgamcheck-beta-ad:' || $1, 'sha256'), 'hex'))", [email]);

  await check("[재검토2 2] 신청·확인·수신거부·삭제 요청·삭제 안내 완료·보유기간 정리가 같은 이메일에 같은 잠금 키를 쓴다", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const email = "test-rc22@example.invalid";
    const key = await expectedKey(email);
    assert.equal(key.length, 1);
    assert.deepEqual(await advisoryKeysDuring("anon", null,
      "select * from public.submit_beta_application($1,'web',true,'2-3','{}','beta',true,true,'beta-apply-v1-2026-11-01')", [email]), key, "신청");
    await apply(email, { ad: true });
    const row = await latestApplication(email);
    assert.deepEqual(await advisoryKeysDuring("anon", null, "select * from public.confirm_beta_email($1)", [row.confirm_token]), key, "주소 확인");
    assert.deepEqual(await advisoryKeysDuring("anon", null, "select * from public.unsubscribe_beta_ads($1)", [row.unsubscribe_token]), key, "수신거부");
    assert.deepEqual(await advisoryKeysDuring("authenticated", OPERATOR, "select * from public.beta_ops_delete_application($1)", [row.id]), key, "삭제 요청");
    await db.query("update public.beta_applications set purge_after = now() - interval '1 day' where id = $1", [row.id]);
    assert.deepEqual(await advisoryKeysDuring("authenticated", OPERATOR, "select public.beta_ops_purge_expired()"), key, "보유기간 정리");
    const deletion = await as("authenticated", OPERATOR, "select * from public.beta_ops_delete_application($1)", [row.id]);
    // 통지가 남아 있으면 함수가 거부하고(저장점과 함께 잠금도 풀린다) 키를 볼 수 없으니, 통지를 먼저 보낸 것으로 표시한다.
    await markAllNoticesFor(email);
    assert.deepEqual(await advisoryKeysDuring("authenticated", OPERATOR, "select public.beta_ops_mark_deletion_emailed($1)", [deletion.rows[0].deletion_id]), key, "삭제 안내 완료");
  });

  await check("[재검토2 2] 보유기간 정리는 잠금을 이메일 해시 순서로 잡는다(여러 주소를 한 번에 정리해도 순서가 한 가지)", async () => {
    await db.exec("delete from public.beta_public_call_counters");
    const emails = ["test-rc22-z@example.invalid", "test-rc22-a@example.invalid", "test-rc22-m@example.invalid"];
    for (const email of emails) await apply(email, { ad: false });
    const ids = [];
    for (const email of emails) ids.push((await latestApplication(email)).id);
    await db.query("update public.beta_applications set purge_after = now() - interval '1 day' where id = any($1::uuid[])", [ids]);
    const source = await readFile(resolve("supabase/migrations/20261101090000_beta_application_consent.sql"), "utf8");
    const purge = source.slice(source.indexOf("create function public.beta_ops_purge_expired()"));
    assert.match(purge.slice(0, 2000), /order by [a-z_.]*email_hash/);
    assert.match(purge.slice(0, 2000), /beta_lock_email\(/);
    const keys = await advisoryKeysDuring("authenticated", OPERATOR, "select public.beta_ops_purge_expired()");
    assert.ok(keys.length >= 3, "정리할 주소마다 잠금");
    assert.equal(await expireAndPurge(ids[0]), 3);
  });

  const failed = results.filter((result) => !result.ok);
  if (failed.length) {
    console.error(`FAIL: ${failed.length}/${results.length} beta consent DB checks failed.`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${results.length} beta consent DB checks (ephemeral PGlite).`);
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  if (error.where) console.error(error.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
