export const ILGAMCHECK_PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_STORAGE_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_OPERATOR_NAME",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
  "NEXT_PUBLIC_BETA_SIGNUP_ENABLED",
  "NEXT_PUBLIC_BUSINESS_NAME",
  "NEXT_PUBLIC_BUSINESS_NUMBER",
  "NEXT_PUBLIC_MAIL_ORDER_NUMBER",
  "NEXT_PUBLIC_BUSINESS_ADDRESS",
  "NEXT_PUBLIC_BUSINESS_PHONE",
  "NEXT_PUBLIC_FEEDBACK_FORM_URL",
  "NEXT_PUBLIC_FEEDBACK_ENTRY_TYPE",
  "NEXT_PUBLIC_FEEDBACK_ENTRY_SCREEN",
  "NEXT_PUBLIC_FEEDBACK_ENTRY_USAGE",
  "NEXT_PUBLIC_FEEDBACK_ENTRY_SCALE",
  "NEXT_PUBLIC_FEEDBACK_ENTRY_PRICE",
  "NEXT_PUBLIC_FEEDBACK_ENTRY_FOUNDER",
] as const;

export type IlgamcheckPublicEnvironmentKey = typeof ILGAMCHECK_PUBLIC_ENV_KEYS[number];
export type IlgamcheckPublicEnvironment = Partial<Record<IlgamcheckPublicEnvironmentKey, string>>;

declare global {
  var __ILGAMCHECK_PUBLIC_ENV__: IlgamcheckPublicEnvironment | undefined;
}

function getBuildTimePublicEnvironmentValue(key: IlgamcheckPublicEnvironmentKey): string | undefined {
  switch (key) {
    case "NEXT_PUBLIC_STORAGE_MODE": return process.env.NEXT_PUBLIC_STORAGE_MODE;
    case "NEXT_PUBLIC_SUPABASE_URL": return process.env.NEXT_PUBLIC_SUPABASE_URL;
    case "NEXT_PUBLIC_SUPABASE_ANON_KEY": return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    case "NEXT_PUBLIC_OPERATOR_NAME": return process.env.NEXT_PUBLIC_OPERATOR_NAME;
    case "NEXT_PUBLIC_SUPPORT_EMAIL": return process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
    case "NEXT_PUBLIC_BETA_SIGNUP_ENABLED": return process.env.NEXT_PUBLIC_BETA_SIGNUP_ENABLED;
    case "NEXT_PUBLIC_BUSINESS_NAME": return process.env.NEXT_PUBLIC_BUSINESS_NAME;
    case "NEXT_PUBLIC_BUSINESS_NUMBER": return process.env.NEXT_PUBLIC_BUSINESS_NUMBER;
    case "NEXT_PUBLIC_MAIL_ORDER_NUMBER": return process.env.NEXT_PUBLIC_MAIL_ORDER_NUMBER;
    case "NEXT_PUBLIC_BUSINESS_ADDRESS": return process.env.NEXT_PUBLIC_BUSINESS_ADDRESS;
    case "NEXT_PUBLIC_BUSINESS_PHONE": return process.env.NEXT_PUBLIC_BUSINESS_PHONE;
    case "NEXT_PUBLIC_FEEDBACK_FORM_URL": return process.env.NEXT_PUBLIC_FEEDBACK_FORM_URL;
    case "NEXT_PUBLIC_FEEDBACK_ENTRY_TYPE": return process.env.NEXT_PUBLIC_FEEDBACK_ENTRY_TYPE;
    case "NEXT_PUBLIC_FEEDBACK_ENTRY_SCREEN": return process.env.NEXT_PUBLIC_FEEDBACK_ENTRY_SCREEN;
    case "NEXT_PUBLIC_FEEDBACK_ENTRY_USAGE": return process.env.NEXT_PUBLIC_FEEDBACK_ENTRY_USAGE;
    case "NEXT_PUBLIC_FEEDBACK_ENTRY_SCALE": return process.env.NEXT_PUBLIC_FEEDBACK_ENTRY_SCALE;
    case "NEXT_PUBLIC_FEEDBACK_ENTRY_PRICE": return process.env.NEXT_PUBLIC_FEEDBACK_ENTRY_PRICE;
    case "NEXT_PUBLIC_FEEDBACK_ENTRY_FOUNDER": return process.env.NEXT_PUBLIC_FEEDBACK_ENTRY_FOUNDER;
  }
}

export function getPublicEnvironmentValue(key: IlgamcheckPublicEnvironmentKey): string | undefined {
  const injected = globalThis.__ILGAMCHECK_PUBLIC_ENV__?.[key];
  return typeof injected === "string" ? injected : getBuildTimePublicEnvironmentValue(key);
}
