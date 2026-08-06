# Incident Playbooks V1

Use these only after creating an incident ID and assigning an IC. Every action, approval, observation, and decision requires a UTC timestamp and redacted evidence reference. `OWNER/TBD` must define people, contacts, thresholds, and response targets before launch. Do not expose secrets or customer payment data in incident evidence.

## Shared financial incident safety

For every charge, refund, transfer, or payout incident:

- Never blindly retry an operation whose provider state is unknown. A timeout is not proof of failure.
- Capture the Stripe event/object/transaction identity and the internal settlement, marketplace transaction, refund, payout request, ledger, shop, and customer identity applicable to the case.
- Reconcile provider status, signed webhook delivery/event, internal state/event history, ledger effect, amount, currency, destination/source, and idempotency identity before proposing correction.
- Preserve immutable audit evidence: original identifiers/statuses, timestamps, actor, approvals, webhook/provider references, ledger/event references, and redacted before/after state. Do not edit history to make it agree.
- Prevent duplicate refunds/payouts by checking existing provider objects, internal requests/events, idempotency identity, and in-flight operations. Use only reviewed application/provider mechanisms supported for that exact correction.
- Manual correction requires Finance/Payments Lead and additional approval `OWNER/TBD`. The repository provides no generic safe production Stripe command, webhook replay command, or manual ledger-edit procedure; none is invented here.

## API outage

| Field | Procedure |
|---|---|
| Symptoms | `/api/health` fails/times out; `/api/ready` fails; most API workflows unavailable. |
| Immediate safety actions | Declare/size impact; freeze releases; stop affected state-changing traffic if partial execution could compound money/data state. |
| Evidence to collect | UTC request IDs/status/latency, health/readiness results, deploy revision/ID, process/runtime and dependency signals, recent changes. |
| What NOT to do | Do not restart repeatedly, expose logs/secrets, run payment smoke, or assume a health 200 proves workflows. |
| Containment | Isolate bad revision/instance or disable affected workflow using an approved reversible control. |
| Recovery | Restore last-known-good application/config under the rollback runbook; address dependency only with its owner. |
| Validation | Health, readiness, public and approved authenticated critical paths; payment integrity if requests were in flight. |
| Escalation | SEV1 by default for broad outage; IC + Technical Lead; Security/Finance if implicated; provider `OWNER/TBD`. |
| Customer communication decision | Communications Lead/IC decide based on confirmed customer impact and duration; warn against retries if state is uncertain. |
| Post-incident follow-up | Root cause, detection gap, capacity/dependency controls, rollback evidence, corrective owners/dates. |

## Frontend outage

| Field | Procedure |
|---|---|
| Symptoms | Site unavailable, blank/erroring, assets fail, or critical navigation unusable while API may remain healthy. |
| Immediate safety actions | Freeze web releases; determine whether checkout/state-changing requests can still be initiated; publish only verified workaround. |
| Evidence to collect | UTC URL/status, browser/device, console/network errors with secrets removed, build/deploy ID, asset/CDN/DNS signals, API health separately. |
| What NOT to do | Do not change DNS/CDN/provider configuration without approval or claim API outage from frontend symptoms. |
| Containment | Halt promotion; isolate failing asset/build; disable an unsafe entry point only through approved reversible controls. |
| Recovery | Roll back web build/config via approved provider process and deployment contract review. |
| Validation | Supported browser/mobile critical routes, asset loading, API target/environment indicator, authentication and approved transaction entry. |
| Escalation | SEV1 if critical workflows broadly unavailable; Technical + Communications/Support; provider `OWNER/TBD`. |
| Customer communication decision | Notice if customer-visible and sustained; include verified alternate path only. |
| Post-incident follow-up | Build/contract/test gap, cache behavior, responsive/accessibility regression, evidence. |

## Database outage

| Field | Procedure |
|---|---|
| Symptoms | `/api/ready` reports database failure, connection errors/timeouts, stateful workflows fail. |
| Immediate safety actions | Stop writes/financial workflows at safest approved boundary; preserve in-flight identities; engage database owner. |
| Evidence to collect | Readiness result, error class/count, connection/capacity/provider status, deploy/migration history, in-flight transaction IDs. |
| What NOT to do | Do not restore, migrate, restart repeatedly, change connection strings, or fail over without an approved plan. |
| Containment | Prevent new dependent operations and retain retry/backlog state; protect evidence. |
| Recovery | Provider recovery/failover or compatible application mitigation under `OWNER/TBD`; restoration follows separate reviewed recovery plan. |
| Validation | Readiness plus controlled reads/writes, migration history, consistency, queued work, and financial reconciliation. |
| Escalation | SEV1; IC, Technical, Database `OWNER/TBD`; Finance/Security when relevant. |
| Customer communication decision | Communicate unavailable stateful workflows and tell customers not to retry uncertain payments. |
| Post-incident follow-up | Capacity/connection/root cause, recovery objectives, provider evidence, restore/failover drill. |

## Database corruption

| Field | Procedure |
|---|---|
| Symptoms | Invalid relationships/values, unexplained missing/changed records, checksum/constraint failures, cross-tenant or ledger inconsistency. |
| Immediate safety actions | SEV0/SEV1; stop affected writes; preserve current recovery point and evidence; restrict access. |
| Evidence to collect | Exact affected IDs/ranges/timestamps, queries/results stored securely, audit/deploy/migration history, backups/PITR availability, financial/provider identities. |
| What NOT to do | Do not edit rows, run cleanup/backfill, restore over production, or destroy current state before scope and recovery are reviewed. |
| Containment | Isolate workflows/tenants at approved layer; preserve forensic copy/recovery point. |
| Recovery | Choose repair, forward correction, or restore only after scope, data-loss window, isolated rehearsal, approvals, and reconciliation plan. |
| Validation | Referential/business invariants, tenant boundaries, application flows, financial/provider reconciliation, independent reviewer. |
| Escalation | IC, Technical, Database, Security and Finance; executive/legal paths `OWNER/TBD`. |
| Customer communication decision | IC/Communications with Security/Finance and `OWNER/TBD`; state facts, not unverified breach claims. |
| Post-incident follow-up | Root cause, affected-record accounting, recovery evidence, controls/drills, corrective actions. |

## Failed/bad migration

| Field | Procedure |
|---|---|
| Symptoms | Deploy/start failure, migration status error, new constraint/type failures, old/new code incompatibility. |
| Immediate safety actions | Stop rollout and writes if integrity is at risk; capture exact migration/revision and applied state. |
| Evidence to collect | Migration history/status, deploy logs, schema/application compatibility assessment, affected statements and recovery point. |
| What NOT to do | Do not delete migration history, manually reverse SQL, restore production, or roll code back before compatibility review. |
| Containment | Hold traffic/release; keep only demonstrably compatible version serving, if safe. |
| Recovery | Reviewed forward fix or compatible application rollback; database recovery only under rollback runbook prohibitions. |
| Validation | Migration history, readiness, old/new workflow invariants, data/financial checks. |
| Escalation | SEV1 if production unavailable/integrity at risk; Technical + Database + IC; Finance/Security as applicable. |
| Customer communication decision | Based on workflow/data impact; avoid claiming data safety before validation. |
| Post-incident follow-up | Migration review/testing/expand-contract improvements and restore rehearsal. |

## Excessive 5xx errors

| Field | Procedure |
|---|---|
| Symptoms | 5xx rate exceeds `OWNER/TBD` threshold or clusters on a critical route. |
| Immediate safety actions | Identify routes/tenants/deploy correlation; halt releases; protect uncertain state changes. |
| Evidence to collect | Rate/window, request IDs, sanitized errors/traces, latency, revision, dependencies, affected transaction IDs. |
| What NOT to do | Do not log sensitive bodies, retry unknown payments, or mask errors without cause. |
| Containment | Rate/cap/disable affected workflow through approved controls; isolate revision/dependency. |
| Recovery | Fix or application/config rollback; drain/reconcile affected work. |
| Validation | Error rate and critical flow over approved observation window; readiness and reconciliation. |
| Escalation | Raise SEV based on scope/integrity; IC/Technical and domain lead. |
| Customer communication decision | Notice when sustained/customer-visible; include retry guidance based on state certainty. |
| Post-incident follow-up | Alert threshold, error budget/capacity, tests, action owners. |

## High latency

| Field | Procedure |
|---|---|
| Symptoms | Latency exceeds `OWNER/TBD` threshold, timeouts, queueing, slow critical flows. |
| Immediate safety actions | Separate API, database, provider, and client latency; freeze releases; protect timed-out financial state. |
| Evidence to collect | Percentiles/window/route, request IDs, resource/dependency timing, revision, timeout and concurrency data. |
| What NOT to do | Do not scale beyond process-local rate-limit assumptions or increase timeouts blindly. |
| Containment | Limit expensive/affected workflow with approved reversible controls; reduce noncritical load. |
| Recovery | Correct bottleneck or compatible rollback; reconcile timed-out operations. |
| Validation | Latency/error rates and critical workflows across approved window. |
| Escalation | SEV1 if critical unavailable or integrity uncertain; otherwise SEV2; Technical/provider `OWNER/TBD`. |
| Customer communication decision | Communicate degradation and safe retry guidance when sustained. |
| Post-incident follow-up | Capacity targets/load evidence, distributed rate-limit plan if scaling, alerts. |

## Authentication outage

| Field | Procedure |
|---|---|
| Symptoms | Login/verification/reset or token validation broadly fails; abnormal rate-limit responses. |
| Immediate safety actions | Determine availability versus compromise; freeze auth/config releases; preserve audit evidence. |
| Evidence to collect | Sanitized status/error/request IDs, auth route and cohort, rate-limit state, email dependency, revision/config fingerprints. |
| What NOT to do | Do not disable authentication/rate limiting broadly, share tokens, reset secrets, or create bypass accounts without approved security plan. |
| Containment | Isolate defective revision/provider; maintain fail-closed authorization. |
| Recovery | Compatible rollback/fix or provider recovery; approved credential/session actions if compromise. |
| Validation | Login/logout/verification/reset/MFA and role/tenant denial tests using approved test identities. |
| Escalation | SEV1 broad outage; Security Lead if compromise possible; Support/Communications. |
| Customer communication decision | Distinguish outage from security event; give only approved account guidance. |
| Post-incident follow-up | Auth observability, rate-limit behavior, recovery/user-impact review. |

## Suspected account takeover

| Field | Procedure |
|---|---|
| Symptoms | Unauthorized login/change/action, anomalous privileged or financial activity, customer report. |
| Immediate safety actions | Engage Security; contain named account/session and money actions with approved controls; preserve evidence. |
| Evidence to collect | Account/tenant IDs, auth/audit/request timestamps, device/network indicators where lawfully available, changed objects, provider/internal financial IDs. |
| What NOT to do | Do not alert suspected actor prematurely, delete sessions/logs, reset all users, or promise reimbursement. |
| Containment | Revoke/disable scoped access, hold affected financial workflow, protect recovery channels; no shared credentials. |
| Recovery | Verified identity recovery and credential/MFA/session reset under approved policy; reconcile changes and money. |
| Validation | Account ownership, session invalidation, permissions, changed data, financial reconciliation, monitoring window. |
| Escalation | SEV0 for privileged/material compromise; Security + IC + Finance/Support; legal/executive `OWNER/TBD`. |
| Customer communication decision | Security-approved direct notice; public notice only through authorized decision path. |
| Post-incident follow-up | Entry path, affected-action accounting, control gaps, required notices decision/evidence. |

## Credential/secret leak

| Field | Procedure |
|---|---|
| Symptoms | Secret in repository/log/chat/screenshot, provider alert, unexplained credential use. |
| Immediate safety actions | SEV0/SEV1 assessment; restrict artifact/access; preserve evidence; identify credential scope without repeating value. |
| Evidence to collect | Secret type/name (never value), exposure location/window/audience, audit/provider usage, dependent systems, commit/artifact IDs. |
| What NOT to do | Do not paste/search the secret in more systems, delete evidence, rotate without dependency plan, or assume no use. |
| Containment | Revoke/rotate through approved owner with least downtime; invalidate derived sessions/tokens where appropriate; remove public exposure preserving forensic record. |
| Recovery | Update dependent secret references via approved provider process; validate old credential rejected and services healthy. |
| Validation | Provider audit, old-key rejection, new-key operation, no tracked secret, affected access/data/financial review. |
| Escalation | Security + IC immediately; provider/Legal/executive and Finance as scope requires, all `OWNER/TBD`. |
| Customer communication decision | Security/legal-authorized based on confirmed exposure/impact; do not make legal conclusions. |
| Post-incident follow-up | Rotation inventory, scanning/redaction, access controls, retention and training. |

## Stripe API outage

| Field | Procedure |
|---|---|
| Symptoms | Stripe calls fail/time out, provider status incident, payment/refund/payout actions unavailable. |
| Immediate safety actions | Stop new affected operations if outcomes can be unknown; capture every internal/provider/idempotency identity. |
| Evidence to collect | Stripe request/object IDs, HTTP/error/time, internal transaction IDs/states, provider status, webhook delivery. |
| What NOT to do | Never blind retry unknown state, create replacement objects, or manually alter ledger/status. |
| Containment | Present safe unavailability; retain operations for reconciliation, not automatic duplication. |
| Recovery | After provider recovery, query/observe authoritative state through approved tools, reconcile, then resume or correct with approvals. |
| Validation | Shared financial safety checks, signed webhook outcomes, end-to-end approved test and zero unexplained variance. |
| Escalation | Finance + IC + Technical; Stripe support `OWNER/TBD`; SEV by money/scope. |
| Customer communication decision | Tell customers not to retry uncertain payments; no payment outcome claim before reconciliation. |
| Post-incident follow-up | Timeout/idempotency handling, backlog procedure, provider evidence and reconciliation report. |

## Stripe webhook backlog/failure

| Field | Procedure |
|---|---|
| Symptoms | Failed/delayed deliveries, signing failures, growing backlog, provider/internal state divergence. |
| Immediate safety actions | Hold dependent fulfillment/refund/payout decisions; identify endpoint scope (platform vs Connect) and events. |
| Evidence to collect | Stripe event/delivery/object IDs, endpoint identity, timestamps/status, internal IDs/events/state, backlog age/count. |
| What NOT to do | Do not replay blindly, reuse webhook secrets, bypass signature verification, or process Connect events through platform scope. |
| Containment | Stop dependent automation/workflows where stale state can cause harm; preserve event ordering and evidence. |
| Recovery | Correct endpoint/app/config under approval; reconcile each event/object before any provider-supported replay; repository has no generic replay command. |
| Validation | Signed relevant event types, idempotent/duplicate/out-of-order behavior, internal/provider reconciliation, backlog zero/accepted threshold. |
| Escalation | Finance + Technical + IC; Security for signing/secret issue; Stripe `OWNER/TBD`. |
| Customer communication decision | Advise impacted customers/shops when fulfillment or money status is delayed; no false completion claims. |
| Post-incident follow-up | Monitoring, event-scope inventory, replay rehearsal, exception ownership. |

## Incorrect charge

| Field | Procedure |
|---|---|
| Symptoms | Wrong amount/currency/customer, duplicate or unauthorized-looking charge. |
| Immediate safety actions | Stop related collection/fulfillment; apply shared financial safety; secure account if takeover suspected. |
| Evidence to collect | PaymentIntent/Charge/event IDs, internal transaction/settlement/ledger IDs, amount/currency/customer/shop, webhook/audit history. |
| What NOT to do | No blind retry, immediate replacement charge, unapproved refund, or ledger edit. |
| Containment | Prevent additional capture/charge/fulfillment through approved scoped control; flag case. |
| Recovery | Reconcile then execute approved correction/refund through supported reviewed mechanism with duplicate checks. |
| Validation | Provider/internal final states, refund/charge totals, ledger, customer/merchant impact, immutable evidence. |
| Escalation | Finance Lead + IC; Security if unauthorized; approval `OWNER/TBD`. |
| Customer communication decision | Direct case-specific notice approved by Finance/Support; avoid requesting sensitive card data. |
| Post-incident follow-up | Causal pricing/idempotency/auth controls and reconciliation exception. |

## Incorrect refund

| Field | Procedure |
|---|---|
| Symptoms | Duplicate, wrong amount/destination, unauthorized, or missing refund. |
| Immediate safety actions | Pause further refund attempts for transaction; apply shared financial safety. |
| Evidence to collect | Refund/PaymentIntent/Charge/event IDs and internal refund/settlement/ledger IDs, amounts, statuses, audit actors. |
| What NOT to do | Do not issue another refund because a response timed out; do not reverse ledger manually or promise outcome. |
| Containment | Hold additional refunds/corrections and related settlement actions. |
| Recovery | Reconcile provider/internal state; approved supported correction only after duplicate prevention and Finance approval. |
| Validation | Total refunded amount/currency/destination, internal ledger/event history, provider final state. |
| Escalation | Finance + IC; Security for unauthorized action; `OWNER/TBD` correction authority. |
| Customer communication decision | Case-specific approved status using confirmed provider state. |
| Post-incident follow-up | Approval/idempotency/UI controls and daily reconciliation procedure. |

## Incorrect payout

| Field | Procedure |
|---|---|
| Symptoms | Wrong seller/destination/amount, duplicate transfer/payout, unexpected provider state. |
| Immediate safety actions | Pause affected payout processing; apply shared financial safety; protect connected-account access. |
| Evidence to collect | Stripe transfer/payout/account/event IDs; internal payout request, seller ledger/balance, settlement/shop IDs; approvals/audit. |
| What NOT to do | Do not send compensating payout, retry, edit balance/ledger, or treat transfer and bank payout as identical. |
| Containment | Hold related seller payout operations and preserve balances/evidence. |
| Recovery | Reconcile transfer and connected-account payout separately; correction requires Finance and `OWNER/TBD` approval using supported mechanism. |
| Validation | Recipient, amount/currency, provider statuses, internal reservation/ledger/balance, duplicate check and immutable audit. |
| Escalation | SEV0/SEV1 based on scope; Finance + IC + Security as needed; Stripe `OWNER/TBD`. |
| Customer communication decision | Direct approved seller advisory; no recovery promise before provider confirmation. |
| Post-incident follow-up | Dual approval/limits, reconciliation, webhook/event coverage, control fixes. |

## Payout backlog

| Field | Procedure |
|---|---|
| Symptoms | Payout requests/transfers/bank payouts remain pending or failed beyond approved threshold. |
| Immediate safety actions | Measure by stage; pause new processing if duplicate/incorrect state possible; apply shared financial safety. |
| Evidence to collect | Counts/age/amount by internal request and Stripe transfer/payout/account/event IDs; failure reasons and balance reservations. |
| What NOT to do | Do not bulk retry, release reservations, create replacement payouts, or collapse transfer/bank-payout stages. |
| Containment | Cap/hold queue and seller expectations; protect correct ordering and identities. |
| Recovery | Resolve cause, reconcile each stage, resume in reviewed batches with duplicate safeguards and approvals. |
| Validation | Queue age/count target, sample/all financial reconciliation as approved, no duplicates, ledger/balance consistency. |
| Escalation | Finance + Technical + IC; Stripe support `OWNER/TBD`; severity by value/duration/scope. |
| Customer communication decision | Beta shop advisory with confirmed delay and no unsupported arrival promise. |
| Post-incident follow-up | Queue monitoring, capacity, exception workflow, ownership/thresholds. |

## Auction/bidding degradation

| Field | Procedure |
|---|---|
| Symptoms | Bids rejected/delayed, stale status, incorrect endings/winners, scheduler lag. |
| Immediate safety actions | Stop affected auctions/endings when fairness/integrity uncertain; preserve auction/bid/settlement IDs and timestamps. |
| Evidence to collect | Auction/bid IDs, authoritative times/statuses, request IDs, scheduler/process evidence, settlement/payment creation. |
| What NOT to do | Do not manually change bids/winners/end times, rerun ending jobs blindly, or initiate payment on uncertain outcome. |
| Containment | Pause affected bidding/ending/payment workflow through approved reversible control. |
| Recovery | Correct service/scheduler or rollback; determine auction disposition under approved product/support policy `OWNER/TBD`. |
| Validation | Bid ordering/increments/access, end state/winner, single settlement, no unintended payment. |
| Escalation | IC + Technical + Support; Finance if settlement/payment exists; product authority `OWNER/TBD`. |
| Customer communication decision | Direct affected bidder/shop advisory with approved auction disposition. |
| Post-incident follow-up | Concurrency/time/scheduler tests, fairness procedure, monitoring. |

## Scheduled job failure

| Field | Procedure |
|---|---|
| Symptoms | Expected reservation release/auction/archive or other scheduled work absent, delayed, repeated, or explicitly disabled. |
| Immediate safety actions | Identify exact job, ownership and idempotency; stop unsafe dependent actions. |
| Evidence to collect | Job config/status, last success, backlog IDs/age, process topology, errors, resulting transaction/auction state. |
| What NOT to do | Do not enable or rerun in production blindly, run concurrent copies, or assume all schedulers are enabled. |
| Containment | Pause dependent workflow and prevent duplicate runners. |
| Recovery | Repair configuration/code; dry-run or bounded reviewed batch if supported; otherwise design correction before execution. |
| Validation | Backlog resolved, single execution, domain invariants and financial reconciliation. |
| Escalation | Technical + IC/domain owner; Finance for money/reservation effects. |
| Customer communication decision | Communicate customer-visible delays or changed auction/fulfillment state. |
| Post-incident follow-up | Heartbeat/backlog alert, ownership, safe replay/batch tooling. |

## Email provider outage

| Field | Procedure |
|---|---|
| Symptoms | Verification/reset/notification email failures, SMTP/provider outage, delivery backlog. |
| Immediate safety actions | Preserve tokens/account security; identify critical auth impact; publish verified support path. |
| Evidence to collect | Provider message IDs/status (no content/secrets), request IDs, template/type, failure rate/window, provider status/config fingerprint. |
| What NOT to do | Do not expose tokens, bypass verification, repeatedly resend, or switch provider/config without review. |
| Containment | Rate/cap resends; hold noncritical delivery; maintain auth fail-safe behavior. |
| Recovery | Provider recovery or approved configuration/provider rollback; safely process backlog with duplicate awareness. |
| Validation | Approved test delivery for verification/reset and expiration/one-time behavior; backlog and bounce state. |
| Escalation | Technical + Support/Security for auth impact; provider `OWNER/TBD`. |
| Customer communication decision | Explain delivery delay and safe next step; never request passwords/tokens. |
| Post-incident follow-up | Deliverability/queue monitoring, SPF/DKIM/DMARC evidence, provider fallback decision. |

## Upload/storage outage

| Field | Procedure |
|---|---|
| Symptoms | Upload/read failures, missing/broken images/documents, authorization or durability concern. |
| Immediate safety actions | Stop uploads if loss/exposure possible; separate general storage from in-memory CSV processing; preserve object/request IDs. |
| Evidence to collect | Object/internal IDs, status/errors, authorization context, provider/config/deploy evidence, affected tenants, retention/integrity signals. |
| What NOT to do | Do not redirect to unapproved public storage, weaken authorization/type checks, or promise durability unsupported by evidence. |
| Containment | Disable affected entry point or reads at scoped approved layer; prevent overwrites/deletes. |
| Recovery | Provider/config recovery or compatible rollback; restore objects only under reviewed recovery plan. |
| Validation | Upload/read/delete/authorization, tenant boundaries, file validation, durability and affected-object inventory. |
| Escalation | Technical + Security if exposure; provider/Product/Support `OWNER/TBD`; likely launch blocker because durable general storage is not repository-proven. |
| Customer communication decision | State affected file workflow and preservation uncertainty accurately. |
| Post-incident follow-up | Durable storage/security/retention controls and recovery drill. |

## DNS/domain outage

| Field | Procedure |
|---|---|
| Symptoms | Resolution/TLS/redirect/origin failures, intermittent domain access, certificate warnings. |
| Immediate safety actions | Freeze DNS/CDN changes; capture resolver/region/time; warn against bypassing TLS warnings. |
| Evidence to collect | DNS records/TTL fingerprints, certificate chain/expiry, HTTP results, provider change/audit IDs, origin health separately. |
| What NOT to do | Do not flush/change nameservers/records or disable TLS/security controls without approved plan. |
| Containment | Stop conflicting changes; use only pre-approved alternate communication/status channels. |
| Recovery | Authorized provider rollback/correction by `OWNER/TBD`; account for TTL/caches. Repository domain script is a check, not recovery automation. |
| Validation | Multi-resolver/region DNS, TLS hostname/chain, redirects, frontend/API health and CORS/origin behavior. |
| Escalation | SEV1 broad outage; IC + Technical + Security/Communications + DNS/CDN owner `OWNER/TBD`. |
| Customer communication decision | Use alternate approved channel; never advise certificate bypass. |
| Post-incident follow-up | Change control, expiration/record monitoring, provider access/MFA and rollback rehearsal. |

## Third-party provider outage

| Field | Procedure |
|---|---|
| Symptoms | Confirmed or suspected external dependency failure affecting a workflow. |
| Immediate safety actions | Identify dependency and state semantics; stop operations whose completion is unknown; preserve correlation IDs. |
| Evidence to collect | Provider status/case IDs, request/correlation IDs, errors/window, internal affected IDs/state, last change. |
| What NOT to do | Do not retry unknown state, switch provider/config ad hoc, share secrets/data, or rely only on provider status page. |
| Containment | Disable/degrade affected feature using approved reversible behavior; keep core/security boundaries intact. |
| Recovery | Provider recovery or pre-approved fallback/rollback; drain backlog only after state reconciliation. |
| Validation | Dependency and end-to-end workflow, backlog, duplicates, data/security/financial integrity. |
| Escalation | IC/Technical plus domain lead and provider contact `OWNER/TBD`; severity by customer/integrity impact. |
| Customer communication decision | Name provider only if approved; communicate PawnLoop impact, workaround, and retry safety. |
| Post-incident follow-up | Dependency inventory, SLA/contacts, timeouts/circuit behavior, fallback and monitoring. |
