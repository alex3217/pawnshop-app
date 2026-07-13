const raw = String(process.env.DATABASE_URL || "").trim();

if (!raw) {
  console.error("❌ DATABASE_URL is required for integration tests");
  process.exit(1);
}

let parsed;

try {
  parsed = new URL(raw);
} catch {
  console.error("❌ DATABASE_URL is not a valid URL");
  process.exit(1);
}

const databaseName = decodeURIComponent(
  parsed.pathname.replace(/^\/+/, ""),
);

const errors = [];

if (process.env.NODE_ENV !== "test") {
  errors.push(`NODE_ENV must be test, received ${process.env.NODE_ENV}`);
}

if (process.env.APP_ENV !== "test") {
  errors.push(`APP_ENV must be test, received ${process.env.APP_ENV}`);
}

if (databaseName !== "pawnshop_test") {
  errors.push(
    `Database must be pawnshop_test, received ${databaseName || "(empty)"}`,
  );
}

if (errors.length > 0) {
  console.error("❌ Refusing to run database integration tests");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log({
  host: parsed.hostname,
  port: parsed.port || "5432",
  database: databaseName,
  nodeEnv: process.env.NODE_ENV,
  appEnv: process.env.APP_ENV,
});

console.log("✅ Test database safety guard passed");
