import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ILGAMCHECK_POLICY_PUBLICATION_CONTRACT,
  ILGAMCHECK_RUNTIME_CONTRACT,
  probeHostedPolicyPublicationContract,
  probeHostedRuntimeContract,
} from "./runtime-contract";

afterEach(() => vi.unstubAllGlobals());

describe("hosted runtime contract", () => {
  it("probes the public contract RPC without a privileged key", async () => {
    const request = vi.fn(async (url: string) => new Response(
      JSON.stringify(url.includes("policy_publication")
        ? ILGAMCHECK_POLICY_PUBLICATION_CONTRACT
        : ILGAMCHECK_RUNTIME_CONTRACT),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", request);

    await expect(probeHostedRuntimeContract(
      "https://project.supabase.co/",
      "sb_publishable_test",
    )).resolves.toEqual({ ok: true, contractVersion: ILGAMCHECK_RUNTIME_CONTRACT });
    expect(request).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/get_ilgamcheck_runtime_contract",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
    await expect(probeHostedPolicyPublicationContract(
      "https://project.supabase.co/",
      "sb_publishable_test",
    )).resolves.toEqual({ ok: true, contract: ILGAMCHECK_POLICY_PUBLICATION_CONTRACT });
    expect(request).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/get_ilgamcheck_policy_publication_contract",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
  });

  it("fails closed when the database policy version or bundle differs from the app manifest", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...ILGAMCHECK_POLICY_PUBLICATION_CONTRACT,
      termsVersion: "stale",
    }))));

    await expect(probeHostedPolicyPublicationContract(
      "https://project.supabase.co",
      "sb_publishable_test",
    )).resolves.toMatchObject({ ok: false });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...ILGAMCHECK_POLICY_PUBLICATION_CONTRACT,
      secret: "must-not-be-echoed",
    }))));
    await expect(probeHostedPolicyPublicationContract(
      "https://project.supabase.co",
      "sb_publishable_test",
    )).resolves.toEqual({ ok: false, contract: null });
  });

  it("backfills existing users and exposes only the constant probe", () => {
    const backfillMigration = readFileSync(resolve(
      process.cwd(),
      "supabase/migrations/202608160003_runtime_contract.sql",
    ), "utf8");
    // 계약 버전을 올릴 때마다 파일 이름을 고쳐 적지 않도록,
    // 계약 함수를 마지막으로 정의한 마이그레이션을 직접 찾는다.
    const migrationsDir = resolve(process.cwd(), "supabase/migrations");
    const contractFile = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .filter((name) => readFileSync(resolve(migrationsDir, name), "utf8")
        .includes("function public.get_ilgamcheck_runtime_contract()"))
      .at(-1);
    expect(contractFile).toBeDefined();
    const latestContractMigration = readFileSync(resolve(migrationsDir, contractFile!), "utf8");
    const serviceRoleMigration = readFileSync(resolve(
      migrationsDir,
      "202608170006_policy_publication_contract.sql",
    ), "utf8");

    expect(backfillMigration).toMatch(/insert into public\.profiles[\s\S]+from auth\.users/i);
    expect(backfillMigration).toMatch(/insert into public\.notification_preferences/i);
    expect(latestContractMigration).toContain(ILGAMCHECK_RUNTIME_CONTRACT);
    expect(latestContractMigration).toMatch(/grant execute[\s\S]+get_ilgamcheck_runtime_contract[\s\S]+to anon, authenticated, service_role/i);
    expect(serviceRoleMigration).toMatch(/revoke all on function public\.get_ilgamcheck_service_role_contract\(\) from public, anon, authenticated/i);
    expect(serviceRoleMigration).toMatch(/grant execute on function public\.get_ilgamcheck_service_role_contract\(\) to service_role/i);

    // service_role 계약도 같은 상수와 비교된다(server-runtime-contract.ts).
    // 한쪽만 올리면 정상 배포가 /api/health에서 503을 받는다.
    const serviceRoleFile = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .filter((name) => readFileSync(resolve(migrationsDir, name), "utf8")
        .includes("function public.get_ilgamcheck_service_role_contract()"))
      .at(-1);
    expect(serviceRoleFile).toBeDefined();
    const latestServiceRoleMigration = readFileSync(resolve(migrationsDir, serviceRoleFile!), "utf8");
    const returned = /get_ilgamcheck_service_role_contract\(\)[\s\S]*?select '(\d+)'::text/i
      .exec(latestServiceRoleMigration)?.[1];
    expect(returned).toBe(ILGAMCHECK_RUNTIME_CONTRACT);
  });
});
