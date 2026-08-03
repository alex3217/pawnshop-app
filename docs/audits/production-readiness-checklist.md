# PawnLoop Production Readiness Checklist

Audit date: 2026-08-01. Checked means evidenced in this audit, not merely present.

## Application and data

- [x] Prisma schema validates.
- [x] Prisma Client generates.
- [ ] Applied/pending migration state verified (blocked by P1001).
- [ ] Migration sequence replayed on an isolated blank database.
- [ ] Duplicate timestamp-prefix migrations reviewed for deploy ordering.
- [ ] Backup restore drill completed with RPO/RTO recorded.
- [ ] Production data retention, deletion and orphan policies approved.
- [ ] All public list APIs bounded and PII response contracts tested.
- [ ] Query plans and N+1/dashboard aggregation costs measured.

## Identity and permissions

- [x] JWT signature, auth-version and active-user validation implemented.
- [x] Owner approval middleware has core tests.
- [x] Shop/staff isolation has service tests.
- [x] Super Admin router has a distinct server authorization boundary.
- [ ] All Admin/Super Admin direct role checks normalized and contract-tested.
- [ ] Disabled user, deleted shop, inactive staff and cross-tenant HTTP integration matrix passes.
- [ ] Cookie/session strategy, logout invalidation and MFA roadmap approved.

## Commerce and billing

- [x] Payment/refund/dispute/subscription/payout services have unit coverage.
- [x] Stripe webhook raw body is mounted before JSON parsing.
- [x] Price validation checks amount, currency, interval, active state and account mode.
- [ ] Stripe test-mode end-to-end purchase and signed webhook pass.
- [ ] Refund, partial refund, dispute, reversal and payout reconciliation pass end to end.
- [ ] Seller and buyer plan codes/display labels/Stripe mappings are approved.
- [ ] Existing subscription compatibility and past-due/trial/cancel behavior are proven.
- [ ] Concurrent reservation/bid/offer/inventory restoration tests pass.

## Frontend, mobile and accessibility

- [x] Web TypeScript and production build pass.
- [x] Web lint passes.
- [x] Lazy page imports resolve.
- [ ] Authenticated route-click suites pass for every role.
- [ ] Empty/loading/error/unauthorized/plan-limit states are captured for critical pages.
- [ ] Critical flows pass phone/tablet/desktop visual checks.
- [ ] WCAG 2.2 AA keyboard, focus, label, screen-reader and contrast audit passes.
- [ ] Mobile production/release builds and device tests pass.
- [ ] Mobile scanner uses secure session and shop selection rather than pasted credentials.

## Security

- [x] Helmet, CORS, request IDs, production 5xx masking and auth rate limiting exist.
- [x] Core auth rate-limit tests pass.
- [x] Backend production dependency audit reports zero vulnerabilities.
- [ ] Web React Router advisories remediated or accepted with documented mitigation.
- [ ] Mobile dependency audit findings remediated before mobile launch.
- [ ] File type/content/size, malware, quota and storage authorization tests pass.
- [ ] Open redirect, SSRF, XSS, webhook replay and sensitive-log review completed.
- [ ] DAST/penetration test completed on staging.
- [ ] Secret rotation and least-privilege checklist completed without exposing values.

## Operations and legal

- [x] Health and readiness endpoint contracts pass with injected dependencies.
- [ ] Deployed readiness proves database/provider dependencies.
- [ ] Metrics, logs, traces, error reporting and actionable alerts configured.
- [ ] Graceful shutdown and multi-instance scheduled-job ownership tested.
- [ ] Deployment, rollback, migration and incident runbooks rehearsed.
- [ ] Support escalation, refund/dispute and abuse response procedures staffed.
- [x] Terms and Privacy routes exist and compile.
- [ ] Counsel approves Terms, Privacy, refund and marketplace policies.
- [ ] Account/data deletion workflow and retention evidence completed.

## Environment reference inventory

Runtime application configuration includes database/JWT secrets, CORS/frontend hosts, body limits, auth-rate-limit and proxy settings, Stripe/Connect keys and webhook secrets, seller price IDs, Resend/SMTP configuration, integration encryption, OpenAI listing assistant, scheduler, payout minimum, Socket.IO/API web configuration, and invite-only registration. Script-only references also include test identities and resource IDs. No environment file was read for values or modified during this audit. A typed startup validator that distinguishes required production variables from optional features was not found as a single authoritative gate.

