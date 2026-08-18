# MFA step-up security contract

Every login and refresh token has a cryptographically random JWT `jti`. A challenge and its proof are bound to the authenticated user, that exact session identifier, and one server-declared operation scope. TOTP counters and recovery codes are consumed transactionally. Proofs expire within two minutes and are consumed atomically once.

Protected-route middleware consumes the proof before invoking the downstream handler. This is intentionally fail-safe: a downstream failure cannot leave reusable authorization behind. The original operation may not have completed, so clients never replay it automatically after an ambiguous downstream failure. A deliberate user retry receives a new `MFA_STEP_UP_REQUIRED` response, performs a fresh challenge, and uses the new proof once.

Expired and consumed challenges and proofs are retained for the configured bounded retention interval, then removed in idempotent batches. Audit events remain in the audit log and are not removed by artifact cleanup.
