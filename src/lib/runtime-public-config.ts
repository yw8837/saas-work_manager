import { createHash } from "node:crypto";

import { getPublicServiceConfig } from "./policies";

const RUNTIME_PUBLIC_CONFIG_SCHEMA = "ilgamcheck-public-config/v1";

export type RuntimePublicConfig = {
  operatorName: string | null;
  supportEmail: string | null;
  betaSignupEnabled: boolean;
};

function trimmedOrNull(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function validEmailOrNull(value: string | null): string | null {
  const normalized = trimmedOrNull(value);
  return normalized && /^\S+@\S+\.\S+$/.test(normalized) ? normalized : null;
}

function canonicalRuntimePublicConfig(config: RuntimePublicConfig): string {
  return JSON.stringify({
    schema: RUNTIME_PUBLIC_CONFIG_SCHEMA,
    operatorName: trimmedOrNull(config.operatorName),
    supportEmail: validEmailOrNull(config.supportEmail),
    betaSignupEnabled: config.betaSignupEnabled === true,
  });
}

export function runtimePublicConfigDigest(config: RuntimePublicConfig): string {
  return `sha256:${createHash("sha256")
    .update(canonicalRuntimePublicConfig(config), "utf8")
    .digest("hex")}`;
}

export function getRuntimePublicConfigState() {
  const config = getPublicServiceConfig();

  return {
    publicConfigDigest: runtimePublicConfigDigest(config),
    publicIdentityConfigured: config.publicIdentityConfigured,
    signupPolicyConfigured: config.betaSignupEnabled === true,
  };
}
