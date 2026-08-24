export function browserSafeSupabaseKeyIssue(rawKey) {
  const key = rawKey?.trim();
  if (!key) return "값이 비어 있습니다.";

  if (key.toLowerCase().startsWith("sb_secret_")) {
    return "Supabase secret key는 브라우저 공개 환경값에 넣을 수 없습니다.";
  }

  if (key.startsWith("sb_publishable_") && key.length > "sb_publishable_".length) {
    return null;
  }

  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (payload?.role === "service_role") {
        return "service_role JWT는 브라우저 공개 환경값에 넣을 수 없습니다.";
      }
      if (payload?.role === "anon") return null;
      return "브라우저용 legacy anon JWT가 아닙니다.";
    } catch {
      return "JWT payload를 확인할 수 없습니다.";
    }
  }

  return "Supabase publishable key 또는 legacy anon JWT 형식이 아닙니다.";
}

export function serverSupabaseAdminKeyIssue(rawKey) {
  const key = rawKey?.trim();
  if (!key) return "값이 비어 있습니다.";
  if (key.startsWith("sb_secret_") && key.length > "sb_secret_".length) return null;

  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (payload?.role === "service_role") return null;
      return "service_role JWT 또는 Supabase secret key가 아닙니다.";
    } catch {
      return "JWT payload를 확인할 수 없습니다.";
    }
  }

  return "Supabase secret key 또는 legacy service_role JWT 형식이 아닙니다.";
}

export function supabaseProjectUrlIssue(rawUrl) {
  const value = rawUrl?.trim();
  if (!value) return "값이 비어 있습니다.";

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "HTTPS URL이어야 합니다.";
    if (!/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) {
      return "Dashboard의 https://PROJECT_REF.supabase.co URL이어야 합니다.";
    }
    if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
      return "자격증명·경로·query가 없는 Supabase 프로젝트 origin이어야 합니다.";
    }
    return null;
  } catch {
    return "유효한 URL이 아닙니다.";
  }
}

export function publicOperatorNameIssue(rawName) {
  const value = rawName?.trim();
  if (!value) return "값이 비어 있습니다.";
  if (value.length < 2 || value.length > 100) return "2~100자 운영자명이어야 합니다.";
  if (/(?:YOUR_|PLACEHOLDER|PUBLIC_LEGAL|OPERATOR_NAME)/i.test(value)) {
    return "placeholder가 아닌 실제 공개 운영자명을 넣어야 합니다.";
  }
  return null;
}

export function publicSupportEmailIssue(rawEmail) {
  const value = rawEmail?.trim();
  if (!value) return "값이 비어 있습니다.";
  if (/(?:YOUR_DOMAIN|PLACEHOLDER)/i.test(value)) {
    return "placeholder가 아닌 실제 공개 지원 이메일을 넣어야 합니다.";
  }
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "유효한 공개 지원 이메일 형식이어야 합니다.";
  }
  return null;
}

function publicValueSecretIssue(rawValue) {
  const value = rawValue?.trim();
  if (!value) return null;
  if (/^sb_secret_/i.test(value)) return "Supabase secret key가 공개 변수에 들어 있습니다.";
  if (/^postgres(?:ql)?:\/\//i.test(value)) return "Database 연결 URL이 공개 변수에 들어 있습니다.";
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value)) {
    return "private key가 공개 변수에 들어 있습니다.";
  }

  const parts = value.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (payload?.role === "service_role") return "service_role JWT가 공개 변수에 들어 있습니다.";
    } catch {
      // 일반 문자열 또는 Supabase와 무관한 JWT는 전용 key 검사에서 판정한다.
    }
  }
  return null;
}

export function collectDeployEnvIssues(env, { requireServiceRole = true } = {}) {
  const issues = [];
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_OPERATOR_NAME",
    "NEXT_PUBLIC_SUPPORT_EMAIL",
    "NEXT_PUBLIC_BETA_SIGNUP_ENABLED",
    ...(requireServiceRole ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];

  if (env.NEXT_PUBLIC_STORAGE_MODE !== "hosted") {
    issues.push("NEXT_PUBLIC_STORAGE_MODE=hosted 가 필요합니다.");
  }

  for (const name of required) {
    if (!env[name]?.trim()) issues.push(`${name} 값이 없습니다.`);
  }

  if (env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    const issue = supabaseProjectUrlIssue(env.NEXT_PUBLIC_SUPABASE_URL);
    if (issue) issues.push(`NEXT_PUBLIC_SUPABASE_URL: ${issue}`);
  }

  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    const issue = browserSafeSupabaseKeyIssue(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    if (issue) issues.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY: ${issue}`);
  }

  if (env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    const issue = serverSupabaseAdminKeyIssue(env.SUPABASE_SERVICE_ROLE_KEY);
    if (issue) issues.push(`SUPABASE_SERVICE_ROLE_KEY: ${issue}`);
  }

  if (env.NEXT_PUBLIC_OPERATOR_NAME?.trim()) {
    const issue = publicOperatorNameIssue(env.NEXT_PUBLIC_OPERATOR_NAME);
    if (issue) issues.push(`NEXT_PUBLIC_OPERATOR_NAME: ${issue}`);
  }

  if (env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim()) {
    const issue = publicSupportEmailIssue(env.NEXT_PUBLIC_SUPPORT_EMAIL);
    if (issue) issues.push(`NEXT_PUBLIC_SUPPORT_EMAIL: ${issue}`);
  }

  if (env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED?.trim() && env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED !== "true") {
    issues.push("NEXT_PUBLIC_BETA_SIGNUP_ENABLED=true 가 정식 서비스형 신규 가입에 필요합니다.");
  }

  for (const [name, rawValue] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || typeof rawValue !== "string") continue;
    if (/(?:SERVICE_ROLE|SECRET|PRIVATE|PASSWORD|DATABASE_URL|ACCESS_TOKEN)/i.test(name)) {
      issues.push(`${name}: 비밀값으로 보이는 이름은 NEXT_PUBLIC_*에서 사용할 수 없습니다.`);
    }
    const issue = publicValueSecretIssue(rawValue);
    if (issue) issues.push(`${name}: ${issue}`);
  }

  return [...new Set(issues)];
}
