import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PLAN_LIMITS, type Plan } from "./entitlements";

/**
 * 한도는 두 곳에 산다: 이 앱(entitlements.ts)과 DB(plan_limits 테이블).
 * 어긋나면 화면에서는 만들 수 있는데 저장이 거부되는 최악의 경험이 나온다.
 * 마이그레이션의 seed 값을 직접 읽어 대조한다.
 */
const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/202608200007_plan_entitlements.sql",
);
const BASIC_MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/202608230008_basic_plan.sql",
);

type Row = { activeJobs: number; totalJobs: number; packages: number; options: number };

/** insert ... values ('free', 2, 10, 5, 10) 형태를 읽는다. null은 무제한(Infinity). */
function parseSeededLimits(sql: string): Record<string, Row> {
  const rows: Record<string, Row> = {};
  const pattern = /\('(free|solo|basic|pro)',\s*(\d+|null),\s*(\d+|null),\s*(\d+|null),\s*(\d+|null)\)/g;
  const toLimit = (value: string) => (value === "null" ? Infinity : Number(value));

  for (const match of sql.matchAll(pattern)) {
    rows[match[1]] = {
      activeJobs: toLimit(match[2]),
      totalJobs: toLimit(match[3]),
      packages: toLimit(match[4]),
      options: toLimit(match[5]),
    };
  }
  return rows;
}

describe("플랜 한도는 앱과 DB가 같아야 한다", () => {
  const legacy = parseSeededLimits(readFileSync(MIGRATION, "utf8"));
  const basicMigration = existsSync(BASIC_MIGRATION)
    ? parseSeededLimits(readFileSync(BASIC_MIGRATION, "utf8"))
    : {};
  const seeded = { ...legacy, ...basicMigration };
  delete seeded.solo;

  it("최종 migration 상태가 세 플랜을 모두 심는다", () => {
    expect(Object.keys(seeded).sort()).toEqual(["basic", "free", "pro"]);
  });

  it.each(["free", "basic", "pro"] as Plan[])("%s 한도가 코드와 DB에서 일치한다", (plan) => {
    const app = PLAN_LIMITS[plan];
    const db = seeded[plan];
    expect(db).toBeDefined();
    expect(db.activeJobs).toBe(app.activeJobs);
    expect(db.totalJobs).toBe(app.totalJobs);
    expect(db.packages).toBe(app.packages);
    expect(db.options).toBe(app.options);
  });
});

describe("Basic 플랜 승격 migration", () => {
  it("creates a forward-only migration for existing Solo subscribers", () => {
    expect(existsSync(BASIC_MIGRATION)).toBe(true);
    const sql = readFileSync(BASIC_MIGRATION, "utf8");

    expect(sql).toContain("'basic', 5, null, null, null");
    expect(sql).toMatch(/update public\.subscriptions[\s\S]*plan = 'basic'[\s\S]*plan = 'solo'/i);
    expect(sql).toMatch(/delete from public\.plan_limits[\s\S]*plan = 'solo'/i);
  });
});
