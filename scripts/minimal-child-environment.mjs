export const MINIMAL_CHILD_SAFE_BASE_ENV_NAMES = Object.freeze([
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "SHELL",
  "USER",
  "USERNAME",
  "LOGNAME",
  "NODE_ENV",
  "TZ",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "SSL_CERT_FILE",
  "CURL_CA_BUNDLE",
  "NODE_EXTRA_CA_CERTS",
]);

function environmentValue(env, name) {
  if (Object.hasOwn(env, name)) return env[name];
  const matchingName = Object.keys(env).find((candidate) => candidate.toUpperCase() === name.toUpperCase());
  return matchingName ? env[matchingName] : undefined;
}

export function minimalChildEnvironment(env, allowedNames = []) {
  const entries = [];
  for (const name of new Set([...MINIMAL_CHILD_SAFE_BASE_ENV_NAMES, ...allowedNames])) {
    const value = environmentValue(env, name);
    if (typeof value === "string") entries.push([name, value]);
  }
  return Object.fromEntries(entries);
}
