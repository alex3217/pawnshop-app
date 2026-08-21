#!/usr/bin/env node
import { chmod, lstat, mkdir, open, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  EXPECTED_COMPLETED, EXPECTED_PENDING, MAXIMUMS, REQUIRED_TIMEOUTS, buildPsqlEnvironment,
  readApprovalFile, validateChecks, validatePending, validatePostconditions, validateStartingState,
  runReadOnlyPsqlQuery, selectMigrationRelation, validateTimeouts,
} from "./lib/production-migration-safety.mjs";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const migrationsDir = join(root, "apps/api/backend/prisma/migrations");
const usage = () => { throw new Error("Usage: production-migration-safety.mjs <preflight|run> --approval-file <protected-file> [--evidence-dir <protected-directory>]"); };
let command = process.argv[2]; let approvalPath; let evidenceDir;
for (let i = 3; i < process.argv.length; i += 2) {
  if (process.argv[i] === "--approval-file") approvalPath = process.argv[i + 1];
  else if (process.argv[i] === "--evidence-dir") evidenceDir = process.argv[i + 1];
  else usage();
}
if (!["preflight", "run"].includes(command) || !approvalPath || (command === "run" && !evidenceDir)) usage();

const approval = await readApprovalFile(approvalPath);
const pgOptions = `-c lock_timeout=${REQUIRED_TIMEOUTS.lockTimeoutMs}ms -c statement_timeout=${REQUIRED_TIMEOUTS.statementTimeoutMs}ms`;
const psqlEnvironment = buildPsqlEnvironment(approval.databaseUrl, { baseEnvironment: process.env });
const executionEnvironment = buildPsqlEnvironment(approval.databaseUrl, { baseEnvironment: process.env, includeStartupTimeouts: true });
const executionUrl = new URL(approval.databaseUrl);
executionUrl.searchParams.set("options", pgOptions);
const invoke = (program, args, { input, environment = psqlEnvironment } = {}) => {
  const result = spawnSync(program, args, { cwd: root, input, encoding: "utf8", env: environment, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) {
    const safeCode = `${result.stdout || ""}\n${result.stderr || ""}`.match(/\bP\d{4}\b/)?.[0];
    throw new Error(`Production migration blocked: ${program} failed${safeCode ? ` (${safeCode})` : ""} without displaying target metadata`);
  }
  return result.stdout;
};
const jsonSelect = (sql) => `SELECT COALESCE(json_agg(x),'[]'::json) FROM (${sql}) x;`;
const query = (sql, { environment = psqlEnvironment, applyLocalTimeouts = true } = {}) => runReadOnlyPsqlQuery(jsonSelect(sql), {
  environment, cwd: root, applyLocalTimeouts,
});
const scalar = (sql) => Number(query(`SELECT (${sql})::bigint AS value`)[0].value);
const migrationRelation = selectMigrationRelation(query(
  "SELECT n.nspname AS schema_name FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace WHERE c.relname='_prisma_migrations' AND c.relkind IN ('r','p') ORDER BY n.nspname",
));
const records = () => query(`SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count FROM ${migrationRelation} ORDER BY started_at`);
const executionTimeoutSettings = () => query(
  "SELECT (extract(epoch FROM current_setting('lock_timeout')::interval)*1000)::bigint AS lock_timeout_ms, (extract(epoch FROM current_setting('statement_timeout')::interval)*1000)::bigint AS statement_timeout_ms",
  { applyLocalTimeouts: false, environment: executionEnvironment },
)[0];

const localNames = (await readdir(migrationsDir, { withFileTypes: true })).filter((x) => x.isDirectory()).map((x) => x.name);
const repositoryChecksums = Object.fromEntries(await Promise.all(localNames.map(async (name) => [name, createHash("sha256").update(await readFile(join(migrationsDir, name, "migration.sql"))).digest("hex")])));
const pendingSql = (await Promise.all(EXPECTED_PENDING.map((name) => readFile(join(migrationsDir, name, "migration.sql"), "utf8")))).join("\n");
const createdRelationNames = [...pendingSql.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+"([^"]+)"/gi)].map((match) => match[1]);
const createdConstraintNames = [...pendingSql.matchAll(/(?:ADD\s+)?CONSTRAINT\s+"([^"]+)"/gi)].map((match) => match[1]);
const sqlList = (values) => values.map((value) => `'${value.replaceAll("'", "''")}'`).join(",");
const historicalState = { approvedFingerprints: approval.historicalRollbackFingerprints, repositoryChecksums };
const startingRecords = records();
validateStartingState(startingRecords, historicalState);
validatePending(localNames, EXPECTED_COMPLETED);
const timeoutSettings = () => query("SELECT (extract(epoch FROM current_setting('lock_timeout')::interval)*1000)::bigint AS lock_timeout_ms, (extract(epoch FROM current_setting('statement_timeout')::interval)*1000)::bigint AS statement_timeout_ms")[0];
validateTimeouts(timeoutSettings());

const zeroCheckDefinitions = [
  ["derived User identifier duplicates", `SELECT count(*) FROM (SELECT substr(md5("id"),1,12) FROM "User" GROUP BY 1 HAVING count(*) > 1) d`],
  ["derived PawnShop identifier duplicates", `SELECT count(*) FROM (SELECT substr(md5("id"),1,12) FROM "PawnShop" GROUP BY 1 HAVING count(*) > 1) d`],
  ["invalid pricing metadata rows", `SELECT count(*) FROM "PlatformPricingRule" WHERE "key"='seller_plan_free_limits' AND "metadata" IS NOT NULL AND jsonb_typeof("metadata") <> 'object'`],
  ["missing or duplicate pricing rule", `SELECT CASE WHEN count(*)=1 THEN 0 ELSE 1 END FROM "PlatformPricingRule" WHERE "key"='seller_plan_free_limits'`],
  ["future destination constraint violations", `SELECT count(*) FROM "MarketplaceListing" WHERE "listingType"='CUSTOMER_TO_SHOP'`],
  ["null User ids before identifier backfill", `SELECT count(*) FROM "User" WHERE "id" IS NULL`],
  ["null PawnShop ids before identifier backfill", `SELECT count(*) FROM "PawnShop" WHERE "id" IS NULL`],
  ["Item pawn shop FK orphans", `SELECT count(*) FROM "Item" i WHERE NOT EXISTS (SELECT 1 FROM "PawnShop" p WHERE p.id=i."pawnShopId")`],
  ["object name collisions", `SELECT count(*) FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relname IN (${sqlList(createdRelationNames)})`],
  ["constraint name collisions", `SELECT count(*) FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND conname IN (${sqlList(createdConstraintNames)})`],
  ["type name collisions", `SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname IN ('TrainingContentStatus','TrainingContentType','TrainingDifficulty','MfaChallengePurpose','UploadAssetStatus','ShopConversationStatus','ShopContactReason','BuyerItemSubmissionDistributionMode','BuyerItemSubmissionTargetStatus','InventoryAvailability')`],
  ["function or trigger collisions", `SELECT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=current_schema() AND p.proname='prevent_submission_audit_mutation') + (SELECT count(*) FROM pg_trigger WHERE tgname='BuyerItemSubmissionAuditEvent_immutable' AND NOT tgisinternal)`],
  ["pending submission-offer unique violations", `SELECT count(*) FROM (SELECT "submissionId", "shopId" FROM "BuyerItemSubmissionOffer" WHERE "status"='PENDING' GROUP BY 1,2 HAVING count(*) > 1) d`],
  ["existing-column collisions", `SELECT count(*) FROM information_schema.columns WHERE table_schema=current_schema() AND (table_name,column_name) IN (VALUES ('UserMfaRecoveryCode','invalidatedAt'),('PawnShop','logoUrl'),('PawnShop','bannerUrl'),('SuperAdminAuditLog','idempotencyKey'),('PawnShop','isActive'),('PawnShop','isPublic'),('BuyerItemSubmission','distributionMode'),('BuyerItemSubmission','marketplaceListingId'),('BuyerItemSubmission','distributionExpiresAt'),('BuyerItemSubmission','withdrawnAt'),('BuyerItemSubmission','closedAt'),('BuyerItemSubmissionTarget','status'),('BuyerItemSubmissionTarget','deliveredAt'),('BuyerItemSubmissionTarget','viewedAt'),('BuyerItemSubmissionTarget','respondedAt'),('BuyerItemSubmissionTarget','declinedAt'),('BuyerItemSubmissionTarget','closedAt'),('BuyerItemSubmissionTarget','closeReason'),('PawnShop','country'),('User','publicMessageIdentifier'),('PawnShop','publicMessageIdentifier'),('ShopConversation','recipientShopId'),('ShopConversation','initiatedByShopId'),('ShopConversation','contextType'),('ShopConversation','contextReferenceId'),('PawnShop','addressLine2'),('PawnShop','mapVerificationRequired'),('User','publicDisplayName'),('User','messageDiscoverable'),('User','allowShopFirstContact'),('User','allowTransactionalMessages'),('ShopConversation','moderationState'),('ShopConversation','moderationReason'),('ShopConversation','moderatedAt'),('Item','sku'),('Item','barcode'),('Item','serialNumber'),('Item','quantity'),('Item','cost'),('Item','locationId'),('Item','availability'),('MfaChallenge','sessionDigest'),('MfaChallenge','operationScope'),('UploadAsset','marketplaceListingId'),('User','sellerDiscoverable'),('User','allowMarketplaceFirstContact'),('ShopConversation','recipientUserId'),('ShopConversation','sellerMutedAt'),('ShopConversation','recipientMutedAt'),('ShopConversation','sellerArchivedAt'),('ShopConversation','recipientArchivedAt'),('MarketplaceListing','destinationUserId'),('MarketplaceListing','destinationShopId'))`],
];

const affectedBefore = {
  pricing: scalar(`SELECT count(*) FROM "PlatformPricingRule" WHERE "key"='seller_plan_free_limits'`),
  permissionsRead: scalar(`SELECT count(*) FROM "Staff" WHERE "role" IN ('SHOP_ADMIN','SHOP_MANAGER','SHOP_STAFF','SHOP_VIEWER','INVENTORY_MANAGER','SALES_ASSOCIATE') AND NOT ('messages:read'=ANY("permissions"))`),
  permissionsWrite: scalar(`SELECT count(*) FROM "Staff" WHERE "role" IN ('SHOP_ADMIN','SHOP_MANAGER','SHOP_STAFF','INVENTORY_MANAGER','SALES_ASSOCIATE') AND NOT ('messages:write'=ANY("permissions"))`),
  userIdentifiers: scalar(`SELECT count(*) FROM "User"`), shopIdentifiers: scalar(`SELECT count(*) FROM "PawnShop"`),
  availability: scalar(`SELECT count(*) FROM "Item" WHERE "isDeleted"=true OR "status"='SOLD'`),
};
const preExisting = {
  permissionsRead: scalar(`SELECT count(*) FROM "Staff" WHERE "role" IN ('SHOP_ADMIN','SHOP_MANAGER','SHOP_STAFF','SHOP_VIEWER','INVENTORY_MANAGER','SALES_ASSOCIATE') AND 'messages:read'=ANY("permissions")`),
  permissionsWrite: scalar(`SELECT count(*) FROM "Staff" WHERE "role" IN ('SHOP_ADMIN','SHOP_MANAGER','SHOP_STAFF','INVENTORY_MANAGER','SALES_ASSOCIATE') AND 'messages:write'=ANY("permissions")`),
};
const thresholdChecks = Object.entries(affectedBefore).map(([name, value]) => ({ name: `${name} affected rows`, value, maximum: MAXIMUMS.affectedRows }));
for (const table of ["Staff", "User", "PawnShop", "Item", "BuyerItemSubmission", "MarketplaceListing", "SuperAdminAuditLog"]) {
  thresholdChecks.push({ name: `${table} rows`, value: scalar(`SELECT count(*) FROM "${table}"`), maximum: MAXIMUMS.tableRows });
  thresholdChecks.push({ name: `${table} bytes`, value: scalar(`SELECT pg_total_relation_size('"${table}"'::regclass)`), maximum: MAXIMUMS.tableBytes });
}
const zeroChecks = zeroCheckDefinitions.map(([name, sql]) => {
  try { return { name, value: scalar(sql), maximum: 0 }; }
  catch { throw new Error(`Production migration blocked: ${name} preflight query failed`); }
});
validateChecks([...zeroChecks, ...thresholdChecks]);

const snapshot = { affectedBefore, preExisting };
if (command === "preflight") {
  process.stdout.write("Production migration preflight PASS: exact starting state, collisions, data validity, thresholds, and timeout propagation verified.\n");
  process.exit(0);
}

validateTimeouts(executionTimeoutSettings());
const priorEvidenceInfo = await lstat(evidenceDir).catch(() => null);
if (priorEvidenceInfo?.isSymbolicLink()) throw new Error("Production migration blocked: evidence directory must be a mode-700 non-symlink directory");
await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
const evidenceInfo = await lstat(evidenceDir);
if (evidenceInfo.isSymbolicLink() || !evidenceInfo.isDirectory() || (evidenceInfo.mode & 0o777) !== 0o700) throw new Error("Production migration blocked: evidence directory must be a mode-700 non-symlink directory");
const evidencePath = join(evidenceDir, `t60r2c-rollback-${Date.now()}.json`);
const evidence = query(`
 SELECT 'pricing' AS category, jsonb_build_object('id',id,'metadata',metadata,'updatedAt',"updatedAt") AS value FROM "PlatformPricingRule" WHERE "key"='seller_plan_free_limits'
 UNION ALL SELECT 'permission', jsonb_build_object('id',id,'permissions',permissions) FROM "Staff" WHERE "role" IN ('SHOP_ADMIN','SHOP_MANAGER','SHOP_STAFF','SHOP_VIEWER','INVENTORY_MANAGER','SALES_ASSOCIATE')
 UNION ALL SELECT 'user_identifier', jsonb_build_object('id',id,'publicMessageIdentifier',NULL) FROM "User"
 UNION ALL SELECT 'shop_identifier', jsonb_build_object('id',id,'publicMessageIdentifier',NULL) FROM "PawnShop"
 UNION ALL SELECT 'availability', jsonb_build_object('id',id,'availability','AVAILABLE') FROM "Item" WHERE "isDeleted"=true OR "status"='SOLD'`);
const handle = await open(evidencePath, "wx", 0o600);
try { await handle.writeFile(`${JSON.stringify(evidence)}\n`); await handle.chmod(0o600); } finally { await handle.close(); }

invoke(join(root, "apps/api/backend/node_modules/.bin/prisma"), ["migrate", "deploy", "--schema", join(root, "apps/api/backend/prisma/schema.prisma")], {
  environment: { ...executionEnvironment, DATABASE_URL: executionUrl.toString() },
});
validateTimeouts(timeoutSettings());
const postChecks = query(`SELECT * FROM (VALUES
 ('pricing postcondition', (SELECT count(*) FROM "PlatformPricingRule" WHERE "key"='seller_plan_free_limits' AND "metadata"->'maxActiveListings'='20'::jsonb), ${affectedBefore.pricing}),
 ('destination constraint not validated', (SELECT count(*) FROM pg_constraint WHERE conname='MarketplaceListing_destination_type_check' AND NOT convalidated), 0),
 ('destination violations', (SELECT count(*) FROM "MarketplaceListing" WHERE NOT (("listingType"='CUSTOMER_TO_CUSTOMER' AND "destinationShopId" IS NULL) OR ("listingType"='CUSTOMER_TO_SHOP' AND "destinationUserId" IS NULL AND "destinationShopId" IS NOT NULL) OR ("listingType" IN ('SHOP_TO_CUSTOMER','SHOP_TO_SHOP') AND "destinationUserId" IS NULL AND "destinationShopId" IS NULL))), 0)
) AS checks(name,value,maximum)`);
const affectedAfter = {
  pricing: scalar(`SELECT count(*) FROM "PlatformPricingRule" WHERE "key"='seller_plan_free_limits' AND "metadata"->'maxActiveListings'='20'::jsonb`),
  permissionsRead: scalar(`SELECT count(*) FROM "Staff" WHERE "role" IN ('SHOP_ADMIN','SHOP_MANAGER','SHOP_STAFF','SHOP_VIEWER','INVENTORY_MANAGER','SALES_ASSOCIATE') AND 'messages:read'=ANY("permissions")`) - snapshot.preExisting.permissionsRead,
  permissionsWrite: scalar(`SELECT count(*) FROM "Staff" WHERE "role" IN ('SHOP_ADMIN','SHOP_MANAGER','SHOP_STAFF','INVENTORY_MANAGER','SALES_ASSOCIATE') AND 'messages:write'=ANY("permissions")`) - snapshot.preExisting.permissionsWrite,
  userIdentifiers: scalar(`SELECT count(*) FROM "User" WHERE "publicMessageIdentifier" IS NOT NULL`), shopIdentifiers: scalar(`SELECT count(*) FROM "PawnShop" WHERE "publicMessageIdentifier" IS NOT NULL`),
  availability: scalar(`SELECT count(*) FROM "Item" WHERE ("isDeleted"=true AND "availability"='ARCHIVED') OR ("isDeleted"=false AND "status"='SOLD' AND "availability"='SOLD')`),
};
validatePostconditions({ records: records(), checks: postChecks, affectedBefore: snapshot.affectedBefore, affectedAfter, historicalState });
process.stdout.write(`Production migration PASS. Protected rollback evidence: ${basename(evidencePath)}\n`);
