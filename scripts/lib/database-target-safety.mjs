const DISPOSABLE_DATABASE_PATTERNS = [/_test$/i, /_test_[a-z0-9_-]+$/i, /_ci$/i, /_ci_[a-z0-9_-]+$/i];
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);
const FORBIDDEN_TARGET_PATTERN = /(^|[._-])(prod|production|staging|stage)([._-]|$)/i;

export function classifyDatabaseTarget(rawUrl, env = process.env) {
  const errors = [];
  const raw = String(rawUrl || "").trim();
  let parsed;

  if (!raw) {
    return { safe: false, classification: "MISSING", errors: ["DATABASE_URL is required"] };
  }

  try {
    parsed = new URL(raw);
  } catch {
    return { safe: false, classification: "INVALID", errors: ["DATABASE_URL is not a valid URL"] };
  }

  const host = parsed.hostname.toLowerCase();
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).split("?")[0];
  const label = `${host}/${database}`;

  if (!/^postgres(ql)?:$/.test(parsed.protocol)) errors.push("Only PostgreSQL test targets are supported");
  if (FORBIDDEN_TARGET_PATTERN.test(label)) errors.push("Production and staging targets are always rejected");
  if (!DISPOSABLE_HOSTS.has(host) && !/^(test|ci)[.-]/i.test(host)) {
    errors.push("Host does not match an approved disposable test pattern");
  }
  if (!DISPOSABLE_DATABASE_PATTERNS.some((pattern) => pattern.test(database))) {
    errors.push("Database name must end in _test or _ci (optionally with a unique suffix)");
  }
  if (env.NODE_ENV !== "test") errors.push(`NODE_ENV must be test, received ${env.NODE_ENV || "(unset)"}`);
  if (env.APP_ENV !== "test") errors.push(`APP_ENV must be test, received ${env.APP_ENV || "(unset)"}`);
  if (env.CONFIRM_DISPOSABLE_DATABASE !== "YES_DELETE_TEST_DATA") {
    errors.push("CONFIRM_DISPOSABLE_DATABASE must equal YES_DELETE_TEST_DATA");
  }

  return {
    safe: errors.length === 0,
    classification: errors.length === 0 ? "DISPOSABLE_TEST" : "REJECTED",
    target: { host, port: parsed.port || "5432", database },
    errors,
  };
}
