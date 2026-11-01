import assert from "node:assert/strict";
import { it } from "vitest";
import {
  cloudflareBuildEnvIssues,
  cloudflareDeployArgs,
  parseCloudflareDeployArgs,
} from "./cloudflare-deploy.mjs";

const baseEnv = {
  NEXT_PUBLIC_STORAGE_MODE: "hosted",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_example",
  NEXT_PUBLIC_OPERATOR_NAME: "최용우",
  NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com",
  NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "false",
  NEXT_PUBLIC_SITE_ORIGIN: "https://ilgamcheck-preview.example.workers.dev",
};

it("기본 명령은 preview 읽기 전용 검사다", () => {
  assert.deepEqual(parseCloudflareDeployArgs([]), {
    target: "preview", apply: false, bootstrap: false, worker: "ilgamcheck-preview",
  });
  assert.throws(() => parseCloudflareDeployArgs(["--target", "other"]));
  assert.throws(() => parseCloudflareDeployArgs(["--target", "preview", "--target", "production"]));
  assert.throws(() => parseCloudflareDeployArgs(["--apply", "--apply"]));
  assert.throws(() => parseCloudflareDeployArgs(["--target", "production", "--apply", "--bootstrap"]));
  assert.deepEqual(parseCloudflareDeployArgs(["--apply", "--bootstrap"]), {
    target: "preview", apply: true, bootstrap: true, worker: "ilgamcheck-preview",
  });
});

it("preview와 production origin이 혼동되면 중단한다", () => {
  assert.deepEqual(cloudflareBuildEnvIssues(baseEnv, "preview"), []);
  assert.match(cloudflareBuildEnvIssues({
    ...baseEnv, NEXT_PUBLIC_SITE_ORIGIN: "https://ilgam.studioyeolmae.com",
  }, "preview").join(" "), /workers.dev/);
  assert.match(cloudflareBuildEnvIssues(baseEnv, "production").join(" "), /ilgam.studioyeolmae.com/);
  assert.deepEqual(cloudflareBuildEnvIssues({
    ...baseEnv, NEXT_PUBLIC_BETA_SIGNUP_ENABLED: "true",
    NEXT_PUBLIC_SITE_ORIGIN: "https://ilgam.studioyeolmae.com",
  }, "production"), []);
});

it("서버 비밀키는 빌드 환경에 넣지 않고 Worker secret으로 분리한다", () => {
  assert.match(cloudflareBuildEnvIssues({
    ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_do_not_bundle",
  }, "preview").join(" "), /Worker secret/);
  const args = cloudflareDeployArgs(parseCloudflareDeployArgs([]), baseEnv);
  assert.ok(args.includes("--dry-run"));
  assert.ok(args.includes("--keep-vars"));
  assert.ok(args.includes("ilgamcheck-preview"));
  assert.ok(!args.join(" ").includes("SUPABASE_SERVICE_ROLE_KEY"));
});
