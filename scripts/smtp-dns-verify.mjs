import nextEnv from "@next/env";
import { Resolver } from "node:dns/promises";
import { readSmtpDnsConfig, verifySmtpDns } from "./smtp-dns-policy.mjs";

const { loadEnvConfig } = nextEnv;

export async function runSmtpDnsVerify({
  env = process.env,
  resolver = new Resolver(),
  logger = console,
} = {}) {
  try {
    const config = readSmtpDnsConfig(env);
    const result = await verifySmtpDns(config, resolver);
    if (!result.ok) {
      for (const issue of result.issues) logger.error(`[smtp-dns] FAIL ${issue}`);
      return 1;
    }
    logger.log(`[smtp-dns] PASS SPF 1개 (Return-Path ${result.returnPathDomain})`);
    logger.log(`[smtp-dns] PASS DKIM ${result.dkim.length}개 selector public key`);
    logger.log(`[smtp-dns] PASS DMARC p=${result.dmarcPolicy} (${result.dmarcDomain})`);
    return 0;
  } catch (error) {
    logger.error(`[smtp-dns] FAIL ${error instanceof Error ? error.message : "DNS 검증 오류"}`);
    return 1;
  }
}

if (process.argv.includes("--help")) {
  console.log("ILGAMCHECK_SMTP_FROM_DOMAIN, ILGAMCHECK_SMTP_RETURN_PATH_DOMAIN, ILGAMCHECK_SMTP_DMARC_DOMAIN, ILGAMCHECK_SMTP_DKIM_SELECTORS(comma 구분)를 설정하세요.");
  console.log("실제 공개 DNS의 SPF 1개, 모든 DKIM public key, DMARC 정책을 읽기 전용으로 검사합니다.");
} else {
  loadEnvConfig(process.cwd());
  process.exitCode = await runSmtpDnsVerify();
}
