import { createHash } from "node:crypto";
import { lstat, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";

export const EXPECTED_COMPLETED = Object.freeze([
  "20251223004109_init", "20251224210343_auctions_v1", "20260322194353_add_seller_subscription_fields",
  "20260428000000_add_auto_bid", "20260430000100_add_super_admin_audit_logs", "20260508191500_staff_access_v1",
  "20260508211500_shop_staff_role_labels", "20260508211600_shop_staff_role_labels_backfill", "20260509103000_owner_integrations_v2",
  "20260509124500_integration_encrypted_credentials", "20260516010000_owner_auction_reviewed_state", "20260521000000_platform_pricing_rules_v1",
  "20260601234712_sync_prisma_schema_after_reset", "20260602152648_add_pawnshop_geo_fields", "20260603012800_add_offer_backed_settlements",
  "20260603195816_add_settlement_fulfillment_status", "20260717145834_scanner_item_intake_foundation_v1", "20260718034617_item_intake_customer_relationship_v1",
  "20260718120000_add_settlement_revenue_fields", "20260718180000_add_seller_payout_ledger", "20260718220000_multi_party_marketplace_schema_v1",
  "20260719174500_customer_scan_intake_linkage_v1", "20260722000000_auth_session_password_hardening_v1", "20260722000000_customer_sell_transaction_handoff_v1",
  "20260722225959_buyer_item_submission_offer_composite_unique", "20260722230000_customer_sell_offline_fulfillment_v1", "20260726100000_add_pawnshop_onboarding_completed_at",
  "20260726150000_add_buyer_bid_archives", "20260727120000_account_action_tokens", "20260727170000_stripe_connect_owner_onboarding_v1",
  "20260727210000_owner_payout_requests_v1", "20260728120000_legal_consent_audit_v1", "20260728180000_owner_application_approval_v1",
  "20260728233000_free_plan_20_listings_v1", "20260729010000_owner_application_audit_history_v1", "20260729140000_owner_application_applicant_response_v1",
  "20260729160000_stripe_refund_dispute_lifecycle_v1", "20260729190000_stripe_subscription_invoice_webhooks_v1", "20260729210000_stripe_connected_account_payout_reconciliation_v1",
  "20260729230000_invite_only_beta_admission_v1", "20260730010000_master_pawnshop_growth_center_v1", "20260801010000_growth_marketing_phase1_foundation",
  "20260801090000_free_plan_25_listings_v1", "20260801103000_secure_payment_method_consent_v1", "20260801160000_marketing_assets_customer_engagement_v1",
  "20260802120000_buyer_subscription_stripe_event_ordering_v1", "20260802130000_buyer_preferences_v1", "20260802140000_buyer_subscription_event_audit_v1",
]);

export const EXPECTED_PENDING = Object.freeze([
  "20260803090000_training_knowledge_center_v1", "20260804000000_user_mfa_foundation_v1", "20260804010000_user_mfa_recovery_invalidation_v1",
  "20260805013000_restore_free_plan_20_listings_v1", "20260808140000_shop_branding_images_v1", "20260810030000_owner_application_draft_status",
  "20260810030100_owner_application_draft_defaults", "20260811120000_seller_subscription_audit_idempotency", "20260811160000_upload_asset_lifecycle_v1",
  "20260813150000_seller_shop_messaging_v1", "20260813160000_seller_targeted_shop_offers_v1", "20260813170000_add_pawn_shop_country",
  "20260813190000_shop_outbound_message_compose_v1", "20260813200000_shop_profile_discoverability_v1", "20260813210000_buyer_messaging_profile_discoverability_v1",
  "20260813220000_super_admin_messaging_governance_v1", "20260813230000_super_admin_inventory_support_v1", "20260814160000_inventory_availability_backfill",
  "20260818210000_real_mfa_step_up_security", "20260819123000_consumer_marketplace_listing_uploads", "20260819153000_consumer_initiated_pawnloop_messaging",
  "20260819190000_marketplace_listing_destinations",
]);
export const VALIDATION_MIGRATION = "20260820190000_validate_marketplace_listing_destination_constraint";
export const REQUIRED_CONFIRMATION = "AUTHORIZE T60R2C-B PRODUCTION MIGRATION";
export const REQUIRED_TIMEOUTS = Object.freeze({ lockTimeoutMs: 5000, statementTimeoutMs: 300000 });
export const MAXIMUM_CONNECT_TIMEOUT_SECONDS = 10;
export const MAXIMUMS = Object.freeze({ affectedRows: 100000, tableRows: 100000, tableBytes: 536870912 });
export const HISTORICAL_ROLLBACK_FINGERPRINTS = Object.freeze([
  Object.freeze({
    migrationName: "20260601234712_sync_prisma_schema_after_reset",
    rolledBackChecksum: "743addf205f8c008393b2f7d2f28c64f40e21e88f5f9efc156fc4220618eed84",
    successfulChecksum: "743addf205f8c008393b2f7d2f28c64f40e21e88f5f9efc156fc4220618eed84",
    rolledBackAppliedSteps: 0, successfulAppliedSteps: 0,
  }),
  Object.freeze({
    migrationName: "20260801103000_secure_payment_method_consent_v1",
    rolledBackChecksum: "d2afd44c1228531855902b62c4091a363cea334be2b41b583bfec6a1eaa75882",
    successfulChecksum: "72911aef68052ec3f3379d839d151d03c502eefc7b437128986dde91832e586b",
    rolledBackAppliedSteps: 0, successfulAppliedSteps: 1,
  }),
]);

const fail = (message) => { throw new Error(`Production migration blocked: ${message}`); };
const sorted = (values) => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

const LIBPQ_PARAMETER_ENV = Object.freeze({
  sslmode: "PGSSLMODE",
  sslrootcert: "PGSSLROOTCERT",
  sslcert: "PGSSLCERT",
  sslkey: "PGSSLKEY",
  channel_binding: "PGCHANNELBINDING",
  application_name: "PGAPPNAME",
});

export function buildPsqlEnvironment(databaseUrl, { baseEnvironment = {}, includeStartupTimeouts = false } = {}) {
  let url;
  try { url = new URL(databaseUrl); } catch { fail("approval target is malformed"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) fail("approval target is invalid");
  const environment = {
    ...baseEnvironment,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGCONNECT_TIMEOUT: String(MAXIMUM_CONNECT_TIMEOUT_SECONDS),
  };
  delete environment.DATABASE_URL;
  delete environment.PGOPTIONS;
  for (const variable of [...Object.values(LIBPQ_PARAMETER_ENV), "PGCONNECT_TIMEOUT"]) delete environment[variable];
  environment.PGCONNECT_TIMEOUT = String(MAXIMUM_CONNECT_TIMEOUT_SECONDS);
  for (const [parameter, variable] of Object.entries(LIBPQ_PARAMETER_ENV)) {
    if (url.searchParams.has(parameter)) environment[variable] = url.searchParams.get(parameter);
  }
  if (url.searchParams.has("connect_timeout")) {
    const value = Number(url.searchParams.get("connect_timeout"));
    if (!Number.isInteger(value) || value < 1 || value > MAXIMUM_CONNECT_TIMEOUT_SECONDS) fail("connection timeout is outside the approved bound");
    environment.PGCONNECT_TIMEOUT = String(value);
  }
  if (includeStartupTimeouts) {
    environment.PGOPTIONS = `-c lock_timeout=${REQUIRED_TIMEOUTS.lockTimeoutMs}ms -c statement_timeout=${REQUIRED_TIMEOUTS.statementTimeoutMs}ms`;
  }
  return Object.freeze(environment);
}

export function wrapReadOnlyPsqlQuery(sql, { applyLocalTimeouts = true } = {}) {
  if (typeof sql !== "string" || !/^\s*SELECT\b/i.test(sql)) fail("read-only psql query must be a SELECT");
  const settings = applyLocalTimeouts
    ? `SET LOCAL lock_timeout = '${REQUIRED_TIMEOUTS.lockTimeoutMs}ms';\nSET LOCAL statement_timeout = '${REQUIRED_TIMEOUTS.statementTimeoutMs}ms';\n`
    : "";
  return `BEGIN READ ONLY;\n${settings}${sql}\nCOMMIT;`;
}

export function targetFingerprint(databaseUrl) {
  let url;
  try { url = new URL(databaseUrl); } catch { fail("approval target is malformed"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) fail("approval target is invalid");
  return createHash("sha256").update(`${url.hostname.toLowerCase()}\n${decodeURIComponent(url.pathname.slice(1))}`).digest("hex");
}

export async function readApprovalFile(path, { expectedUid = process.getuid?.() } = {}) {
  if (!path) fail("the protected approval file is required");
  const info = await lstat(path).catch(() => null);
  if (!info) fail("the protected approval file is missing");
  if (info.isSymbolicLink() || !info.isFile()) fail("the approval path must be a regular, non-symlink file");
  if ((info.mode & 0o777) !== 0o600) fail("the approval file must have mode 600");
  if (expectedUid !== undefined && info.uid !== expectedUid) fail("the approval file must be owned by the current operator");
  const parent = await stat(dirname(path));
  if ((parent.mode & 0o077) !== 0) fail("the approval directory must not be accessible by group or other users");
  let value;
  try { value = JSON.parse(await readFile(path, "utf8")); } catch { fail("the approval file is not valid JSON"); }
  if (value.confirmation !== REQUIRED_CONFIRMATION) fail("the exact confirmation is missing or incorrect");
  if (typeof value.databaseUrl !== "string" || !value.databaseUrl) fail("the approval target is missing");
  if (!/^[a-f0-9]{64}$/.test(value.targetSha256 || "") || targetFingerprint(value.databaseUrl) !== value.targetSha256) fail("approval target mismatch");
  if (value.lockTimeoutMs !== REQUIRED_TIMEOUTS.lockTimeoutMs || value.statementTimeoutMs !== REQUIRED_TIMEOUTS.statementTimeoutMs) fail("required timeout values are not approved");
  if (JSON.stringify(value.historicalRollbackFingerprints) !== JSON.stringify(HISTORICAL_ROLLBACK_FINGERPRINTS)) fail("the exact historical rollback fingerprint set is not approved");
  return Object.freeze({ databaseUrl: value.databaseUrl, targetSha256: value.targetSha256, historicalRollbackFingerprints: value.historicalRollbackFingerprints });
}

export function validateHistoricalMigrationState(records, { approvedFingerprints, repositoryChecksums } = {}) {
  if (JSON.stringify(approvedFingerprints) !== JSON.stringify(HISTORICAL_ROLLBACK_FINGERPRINTS)) fail("the exact historical rollback fingerprint set is not approved");
  const knownNames = new Set([...EXPECTED_COMPLETED, ...EXPECTED_PENDING, VALIDATION_MIGRATION]);
  if (records.some((r) => !knownNames.has(r.migration_name))) fail("an unknown migration record exists");
  if (records.some((r) => !r.finished_at && !r.rolled_back_at)) fail("an unresolved migration record exists");
  if (records.some((r) => r.finished_at && !r.rolled_back_at && repositoryChecksums?.[r.migration_name] !== r.checksum)) fail("a successful migration checksum does not match the current immutable repository SQL");
  const rolledBack = records.filter((r) => r.rolled_back_at);
  if (rolledBack.length !== HISTORICAL_ROLLBACK_FINGERPRINTS.length) fail("the historical rollback record count is not exact");
  for (const fingerprint of HISTORICAL_ROLLBACK_FINGERPRINTS) {
    if (repositoryChecksums?.[fingerprint.migrationName] !== fingerprint.successfulChecksum) fail("a current repository migration checksum does not match its audited fingerprint");
    const attempts = records.filter((r) => r.migration_name === fingerprint.migrationName);
    const rollback = attempts.filter((r) => r.rolled_back_at);
    const success = attempts.filter((r) => r.finished_at && !r.rolled_back_at);
    if (rollback.length !== 1 || success.length !== 1) fail("an audited migration does not have its exact rollback and success record pair");
    if (!rollback[0].started_at || rollback[0].finished_at || rollback[0].checksum !== fingerprint.rolledBackChecksum || rollback[0].applied_steps_count !== fingerprint.rolledBackAppliedSteps) fail("an audited historical rollback fingerprint does not match");
    if (!success[0].started_at || success[0].rolled_back_at || success[0].checksum !== fingerprint.successfulChecksum || success[0].applied_steps_count !== fingerprint.successfulAppliedSteps) fail("an audited successful migration fingerprint does not match");
    const rollbackStarted = new Date(rollback[0].started_at).getTime();
    const rollbackEnded = new Date(rollback[0].rolled_back_at).getTime();
    const successStarted = new Date(success[0].started_at).getTime();
    if (![rollbackStarted, rollbackEnded, successStarted].every(Number.isFinite) || rollbackStarted >= successStarted || rollbackEnded >= successStarted) fail("an audited rollback does not precede its successful migration");
    if (new Set(attempts.map((r) => r.checksum)).size !== new Set([fingerprint.rolledBackChecksum, fingerprint.successfulChecksum]).size) fail("an audited migration has an additional checksum variant");
  }
  if (rolledBack.some((record) => !HISTORICAL_ROLLBACK_FINGERPRINTS.some((fingerprint) => fingerprint.migrationName === record.migration_name && fingerprint.rolledBackChecksum === record.checksum))) fail("an additional or altered rollback record exists");
  return true;
}

export function validateStartingState(records, options) {
  validateHistoricalMigrationState(records, options);
  const completed = records.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
  if (completed.length !== 48 || !same(completed, EXPECTED_COMPLETED)) fail("migration starting state is not the exact expected 48-migration set");
  return true;
}

export function validatePending(localNames, completedNames) {
  const pending = localNames.filter((name) => !completedNames.includes(name));
  if (pending.length !== 23 || !same(pending, [...EXPECTED_PENDING, VALIDATION_MIGRATION])) fail("local pending chain is not the exact expected 22 migrations plus the safety validation migration");
  return pending;
}

export function validateChecks(checks) {
  for (const check of checks) {
    if (!check || typeof check.name !== "string" || !Number.isSafeInteger(check.value) || check.value < 0) fail("preflight returned invalid check data");
    if (check.value > (check.maximum ?? 0)) fail(`${check.name} exceeded its approved safety threshold`);
  }
  return true;
}

export function validateTimeouts(settings) {
  if (Number(settings.lock_timeout_ms) !== REQUIRED_TIMEOUTS.lockTimeoutMs || Number(settings.statement_timeout_ms) !== REQUIRED_TIMEOUTS.statementTimeoutMs) {
    fail("the selected execution mechanism did not apply the required timeouts");
  }
  return true;
}

export function validatePostconditions({ records, checks, affectedBefore, affectedAfter, historicalState }) {
  validateHistoricalMigrationState(records, historicalState);
  const completed = records.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
  if (completed.length !== 71 || !same(completed, [...EXPECTED_COMPLETED, ...EXPECTED_PENDING, VALIDATION_MIGRATION])) {
    fail("postcondition migration state is not the exact expected 71-migration set");
  }
  validateChecks(checks);
  for (const [name, before] of Object.entries(affectedBefore)) {
    const after = affectedAfter[name];
    if (!Number.isSafeInteger(after) || after !== before) fail(`${name} affected-row accounting did not match the preflight snapshot`);
  }
  return true;
}
