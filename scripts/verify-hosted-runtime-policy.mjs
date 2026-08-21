import { randomBytes, randomUUID } from "node:crypto";
import { collectDeployEnvIssues } from "./deploy-env-policy.mjs";

export const HOSTED_VERIFY_ACK = "OVERWRITE_DEDICATED_TEST_DATA";
// 이 값은 src/lib/supabase/runtime-contract.ts의 ILGAMCHECK_RUNTIME_CONTRACT와 반드시 같아야 한다.
// 한쪽만 올리면 DB는 올바른데 배포 검증 스크립트가 실패한다.
// src/lib/supabase/contract-single-source.test.ts가 앱 상수·이 상수·migration 세 값의 일치를 강제한다.
export const HOSTED_RUNTIME_CONTRACT = "202608200007";

export function collectHostedVerificationEnvIssues(env) {
  const issues = collectDeployEnvIssues(env, { requireServiceRole: false });
  const required = [
    "ILGAMCHECK_TEST_A_EMAIL",
    "ILGAMCHECK_TEST_A_PASSWORD",
    "ILGAMCHECK_TEST_B_EMAIL",
    "ILGAMCHECK_TEST_B_PASSWORD",
  ];
  for (const name of required) {
    if (!env[name]?.trim()) issues.push(`${name} 값이 없습니다.`);
  }
  if (env.ILGAMCHECK_HOSTED_VERIFY_ACK !== HOSTED_VERIFY_ACK) {
    issues.push(`ILGAMCHECK_HOSTED_VERIFY_ACK=${HOSTED_VERIFY_ACK} 명시 동의가 필요합니다.`);
  }
  const emailA = env.ILGAMCHECK_TEST_A_EMAIL?.trim().toLowerCase();
  const emailB = env.ILGAMCHECK_TEST_B_EMAIL?.trim().toLowerCase();
  if (emailA && emailB && emailA === emailB) {
    issues.push("A/B 테스트 이메일은 서로 달라야 합니다.");
  }
  return [...new Set(issues)];
}

export function createHostedVerificationState(now = new Date()) {
  const timestamp = now.toISOString();
  const date = timestamp.slice(0, 10);
  const jobId = `hosted_verify_${now.getTime()}`;
  const token = randomBytes(32).toString("base64url");
  return {
    jobId,
    token,
    state: {
      version: 2,
      packages: [],
      options: [],
      jobs: [{
        id: jobId,
        clientLabel: "HOSTED_VERIFY_CLIENT",
        title: `HOSTED_VERIFY_${now.getTime()}`,
        startDate: date,
        calculatedDueDate: date,
        dueDate: date,
        packageId: "hosted_verify_package",
        optionIds: [],
        packageSnapshot: {
          id: "hosted_verify_package",
          name: "Hosted 검증 패키지",
          price: 0,
          estimatedCost: 0,
          durationDays: 0,
          revisionLimit: 2,
          tasks: [],
        },
        optionSnapshots: [],
        amount: 0,
        estimatedCost: 0,
        margin: 0,
        revisionLimit: 2,
        tasks: [],
        revisions: [],
        addons: [],
        links: [],
        revisionPortalToken: token,
        revisionPortalEnabled: true,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      settings: {
        morningDigestEnabled: false,
        morningDigestTime: "09:00",
        deadlineAlertsEnabled: true,
        deadlineAlertTime: "09:00",
        deadlineOffsets: [1, 0],
        waitingAlertsEnabled: false,
        waitingAlertTime: "10:00",
        waitingOffsets: [2],
        revisionAlertsEnabled: true,
        revisionAlertTime: "즉시",
        privateNotificationDetails: true,
      },
    },
    saveIdempotencyKey: randomUUID(),
  };
}
