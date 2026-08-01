import { classifyDatabaseTarget } from "../../../../scripts/lib/database-target-safety.mjs";

const result = classifyDatabaseTarget(process.env.DATABASE_URL, process.env);

if (!result.safe) {
  console.error("❌ Refusing to run database integration tests");
  console.error(`Classification: ${result.classification}`);
  if (result.target) console.error("Target:", result.target);
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log({ classification: result.classification, ...result.target });

console.log("✅ Test database safety guard passed");
