# MFA step-up security contract

Every login and refresh token has a cryptographically random JWT `jti`. A challenge and its proof are bound to the authenticated user, that exact session identifier, and one server-declared operation scope. TOTP counters and recovery codes are consumed transactionally. Proofs expire within two minutes and are consumed atomically once.

Protected-route middleware consumes the proof before invoking the downstream handler. This is intentionally fail-safe: a downstream failure cannot leave reusable authorization behind. The original operation may not have completed, so clients never replay it automatically after an ambiguous downstream failure. A deliberate user retry receives a new `MFA_STEP_UP_REQUIRED` response, performs a fresh challenge, and uses the new proof once.

Expired and consumed challenges and proofs are retained for the configured bounded retention interval, then removed in idempotent batches. Audit events remain in the audit log and are not removed by artifact cleanup.

## Staging release ordering

The staging database workflow emits a 30-day migration receipt only after `migrate deploy` and a clean post-migration status. The staging release-receipt workflow checks out the exact requested main SHA, recomputes the complete migration-registry digest, downloads the named receipt from the exact migration run, and rejects missing, stale, failed, dirty, wrong-run, wrong-repository, SHA-mismatched, or registry-mismatched evidence.

The receipt workflow deliberately does not deploy or contact Render. Render deployment remains a separately authorized manual provider operation. The operator must deploy the exact SHA printed by the successful receipt run and retain the Render deployment identifier, source SHA, status, and URL as external evidence. No repository receipt by itself proves that a provider deployment occurred.
