# First 72 Hours Paid-Beta Operations V1

All real clock times, thresholds, coverage, and people remain `OWNER/TBD`. Before launch, convert each cadence below to a scheduled UTC interval and name primary/backup owners. Every review records timestamp, scope, evidence, exceptions, action, and next review.

## Operating cadence

| Window | Required reviews |
|---|---|
| Hours 0–4 | Continuous launch command as defined by `OWNER/TBD`; health/readiness, errors/latency, payment and webhook state, failed jobs, support, onboarding, authentication/security signals after deploy and every material change. |
| Hours 4–24 | At each approved short interval: health/readiness and error/latency. At each approved financial interval: charges, refunds, payouts, webhook deliveries/backlog, internal/provider reconciliation. At each support interval: buyer/seller cases and shop onboarding blockers. |
| Hours 24–48 | Continue the approved cadence; review job/email/upload/provider failures, access/security/audit exceptions, and prior-day unresolved items. Hold a daily continuation decision. |
| Hours 48–72 | Continue reviews, compare trends across days, close or assign every exception, perform final 72-hour continuation decision, and retain the evidence index. |

## Review procedure

- **Health:** liveness, database readiness, public critical paths, dependency status; do not confuse a 200 health response with full workflow health.
- **Payments:** correlate every sampled/exception charge, refund, and payout by provider and internal identity; record status and variance.
- **Webhooks:** review delivery failures, age/size of backlog, duplicate/out-of-order behavior, signing failures, and resulting internal state. No blind replay.
- **Failed jobs:** review auction/reservation schedulers and any externally operated jobs; document disabled schedulers explicitly rather than assuming they run.
- **Support:** aggregate seller/buyer symptoms, severity, response status, and emerging patterns without copying sensitive data.
- **Shop onboarding:** review invitations, approval, MFA/access, Connect readiness, training/support blockers, and whether caps remain enforced.
- **Errors and latency:** review rate, affected route/workflow, duration, deployment correlation, and customer impact against thresholds set by `OWNER/TBD`.
- **Security:** review privileged changes, auth/rate-limit signals, break-glass access, tenant-boundary reports, secret alerts, and suspicious account behavior.

The repository supplies health/smoke and selected audit scripts but not centralized monitors, provider dashboards, or safe production reconciliation automation. Operators must link approved external evidence.

## Daily continuation go/no-go

At each 24-hour boundary (measured from release, not an invented clock time), Product/Release, IC/Technical, Security, Finance, and Support authorities (`OWNER/TBD`) decide `CONTINUE`, `HOLD/CONTAIN`, or `STOP/ROLL BACK`. Record unresolved incidents, money/data variance, service trends, support load, onboarding state, exceptions, approvals, and next decision. No continuation with an active stop criterion unless the authorized risk acceptance process—`OWNER/TBD`—explicitly allows it; SEV0 financial/security/data conditions are not presumed waivable.

## Beta stop / kill criteria

Immediately stop the affected workflow, onboarding, or entire beta at the smallest safe scope and declare an incident when any of these are confirmed or cannot be ruled out promptly:

- Unreconciled money movement or unknown provider/internal payment state beyond the approved threshold.
- Duplicate charge, refund, transfer, or payout; credible risk of duplicate retry.
- Material tenant isolation failure or cross-shop/customer data access.
- Privilege escalation, authentication compromise, or credential/secret exposure affecting beta safety.
- Data corruption, loss, destructive migration effect, or uncertainty that recovery/restore is possible.
- Uncontrolled 5xx rate or latency beyond `OWNER/TBD` threshold/window.
- Critical workflows unavailable beyond `OWNER/TBD` threshold: authentication, listing/auction integrity, checkout/payment state, fulfillment, refund, payout, or required support controls.
- Stripe webhook backlog/failure, failed scheduled work, DNS/provider outage, or upload/storage failure that makes state unsafe or exceeds approved threshold.
- Monitoring, support, Finance, Security, or incident-command coverage is unavailable for the required operating window.

Stop action: prevent new affected state changes where an approved reversible control exists; preserve evidence; do not improvise provider/config/database changes; notify the IC; apply the relevant playbook; decide rollback under the rollback runbook. These are operational safety criteria, not legal conclusions.
