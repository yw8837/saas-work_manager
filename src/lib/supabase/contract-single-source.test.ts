import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ILGAMCHECK_RUNTIME_CONTRACT } from "./runtime-contract";
// @ts-expect-error -- 배포 스크립트는 .mjs라 타입 선언이 없다. 값 일치만 본다.
import { HOSTED_RUNTIME_CONTRACT } from "../../../scripts/verify-hosted-runtime-policy.mjs";
// @ts-expect-error -- 위와 같음.
import { RUNTIME_CONTRACT_EXPECTED } from "../../../scripts/runtime-contract-readback-policy.mjs";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");

function latestMigrationBody(): string {
  const file = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort().at(-1);
  return file ? readFileSync(resolve(MIGRATIONS, file), "utf8") : "";
}

/** 그 함수를 마지막으로 정의한 migration이 현재 계약이다. 파일 이름을 박아두면 계약을 올릴 때마다 낡는다. */
function latestReturnedContract(fn: string): string | undefined {
  const marker = `create or replace function public.${fn}()`;
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
  const file = files.filter((name) => readFileSync(resolve(MIGRATIONS, name), "utf8").includes(marker)).at(-1);
  if (!file) return undefined;

  const body = readFileSync(resolve(MIGRATIONS, file), "utf8");
  const tail = body.slice(body.lastIndexOf(marker));
  const opener = "select '";
  const start = tail.indexOf(opener);
  if (start < 0) return undefined;
  const rest = tail.slice(start + opener.length);
  const end = rest.indexOf("'");
  return end < 0 ? undefined : rest.slice(0, end);
}

/**
 * 런타임 계약 버전은 앱·배포 스크립트·DB 세 곳에 나타난다.
 * 한 곳만 올리면 DB는 맞는데 배포 검증이 실패하거나, 정상 배포가 /api/health에서 503을 받는다.
 * 실제로 그렇게 어긋난 적이 있어서 여기서 강제한다.
 */
describe("런타임 계약 버전은 한 값이어야 한다", () => {
  it("계정당 단일 베타 권한 뒤의 현재 계약은 202608250011이다", () => {
    expect(ILGAMCHECK_RUNTIME_CONTRACT).toBe("202608250011");
  });

  it("앱 상수와 배포 스크립트 상수가 같다", () => {
    expect(HOSTED_RUNTIME_CONTRACT).toBe(ILGAMCHECK_RUNTIME_CONTRACT);
    expect(RUNTIME_CONTRACT_EXPECTED).toBe(ILGAMCHECK_RUNTIME_CONTRACT);
  });

  it("DB의 두 계약 함수도 같은 값을 돌려준다", () => {
    expect(latestReturnedContract("get_ilgamcheck_runtime_contract")).toBe(ILGAMCHECK_RUNTIME_CONTRACT);
    expect(latestReturnedContract("get_ilgamcheck_service_role_contract")).toBe(ILGAMCHECK_RUNTIME_CONTRACT);
  });

  it("최신 RPC는 코드 종류와 무관하게 계정의 기존 사용 이력을 먼저 막는다", () => {
    const sql = latestMigrationBody();
    expect(sql).toContain("create or replace function public.redeem_invite_code");
    expect(sql).toMatch(
      /if exists \(\s*select 1 from public\.invite_redemptions\s*where owner_id = v_owner\s*\) then/,
    );
    expect(sql).not.toContain("where code = v_code.code and owner_id = v_owner");
    expect(sql).toContain("select '202608250011'::text");
  });
});
