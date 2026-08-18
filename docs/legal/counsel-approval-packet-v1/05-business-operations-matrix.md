# Business Operations and Accountability Matrix

Status: **PENDING OWNER ASSIGNMENT AND BUSINESS APPROVAL**

No person is inferred from repository history. Record a primary owner, alternate, coverage window, escalation route, decision authority and evidence location for every function.

## Ownership matrix

| Function | Accountable owner | Alternate | Coverage / response target | Decision authority | Required evidence | Status |
|---|---|---|---|---|---|---|
| Executive beta sponsor | DESIGNATED — RESTRICTED ROSTER | PENDING SEPARATE ALTERNATE | Decision coverage | Beta scope and final business decision | Signed scope/sign-off | BLOCKED PENDING ALTERNATE/SIGN-OFF |
| Release management | PENDING | PENDING | Release window + 72 hours | Deploy/rollback recommendation | Release record | BLOCKED |
| Product | DESIGNATED — RESTRICTED ROSTER | PENDING | Daily during beta | Feature scope and UX | Frozen scope | BLOCKED PENDING ALTERNATE/EVIDENCE |
| Legal/compliance | PENDING | PENDING | PENDING | Legal conclusions and escalation | Counsel evidence | BLOCKED |
| Privacy | DESIGNATED — RESTRICTED ROSTER | PENDING | Internal acknowledgment within 1 business day | Rights requests and privacy incidents | Privacy case records | BLOCKED PENDING ALTERNATE/REHEARSAL |
| Security | DESIGNATED — RESTRICTED ROSTER | PENDING | Critical acknowledgment 15 minutes | Security incident/accepted risk | Review and incident evidence | BLOCKED PENDING ALTERNATE/REHEARSAL |
| Database/recovery | DESIGNATED — RESTRICTED ROSTER | PENDING | RTO 4 hours; RPO 15 minutes, subject to drill | Recovery-point and restore actions | PITR/restore evidence | BLOCKED PENDING ALTERNATE/DRILL |
| Payments/finance | DESIGNATED — RESTRICTED ROSTER | PENDING | Daily + incident coverage | Refund/payout/reconciliation exceptions | Daily reconciliation | BLOCKED PENDING ALTERNATE/REHEARSAL |
| Trust & Safety | DESIGNATED — RESTRICTED ROSTER | PENDING | Critical acknowledgment 15 minutes | Prohibited item/moderation action | Case evidence | BLOCKED PENDING ALTERNATE/REHEARSAL |
| Customer support | DESIGNATED — RESTRICTED ROSTER | PENDING | 8:00 a.m.–7:00 p.m. Central, Monday–Sunday; 1 business-hour response during coverage | Case ownership and escalation | Support rehearsal | BLOCKED PENDING ALTERNATE/REHEARSAL |
| Shop onboarding/success | DESIGNATED — RESTRICTED ROSTER | PENDING | Before every shop activation | Beta shop entry/training | Shop eligibility record | BLOCKED — NO SHOPS CONFIRMED |
| Incident commander | DESIGNATED — RESTRICTED ROSTER | PENDING SEPARATE PERSON | 15-minute acknowledgment; 60-minute containment/pause decision | Incident coordination and containment | Tabletop/drill | BLOCKED — ALTERNATE REQUIRED |
| Communications/status | PENDING | PENDING | Incident/release cadence | Public/internal updates | Approved templates | BLOCKED |
| Accessibility | DESIGNATED — RESTRICTED ROSTER | PENDING | 1 business-day acknowledgment | Accommodation/remediation coordination | Manual test and case evidence | BLOCKED PENDING ALTERNATE/EVIDENCE |
| Vendor: Stripe | PENDING | PENDING | PENDING | Configuration/support escalation | Redacted provider evidence | BLOCKED |
| Vendor: Neon | PENDING | PENDING | PENDING | Database/recovery coordination | Redacted provider evidence | BLOCKED |
| Vendor: Render | PENDING | PENDING | PENDING | API deploy/rollback coordination | Redacted provider evidence | BLOCKED |
| Vendor: Cloudflare | PENDING | PENDING | PENDING | Web/DNS/TLS coordination | Redacted provider evidence | BLOCKED |
| Email/storage/other critical vendors | PENDING | PENDING | PENDING | Service-specific | Inventory and evidence | BLOCKED |

## Required business decisions

Owner decisions accepted for counsel and operating review:

- Five-shop, 250-invited-user, 60-day Texas controlled beta
- Maximum 25 completed transactions per day, $2,500 per transaction and $10,000 daily platform volume
- Nationwide read-only browsing; international and unapproved interstate regulated transactions deferred
- Initial Houston-area licensed-shop cohort; no participating shop is currently confirmed
- Support coverage 8:00 a.m.–7:00 p.m. Central, Monday–Sunday
- Critical incident acknowledgment within 15 minutes and containment/pause decision within 60 minutes
- RTO 4 hours and RPO 15 minutes, subject to provider capability and successful drill

- Approved beta cohort and participating-shop criteria
- Geography and merchandise categories
- Enabled and disabled transaction types
- Pricing, subscription plans, platform fees and commissions
- Refund, dispute, chargeback, payout-hold and loss allocation
- Transaction, volume, payout and user/shop caps
- Support hours and channels
- RTO, RPO, SLI/SLO and severity targets
- Monitoring and alert thresholds
- Incident and communications cadence
- Stop, suspension, rollback and expansion criteria
- Observation period and exit decision

## Beta shop entry record

Current cohort status: `NO PARTICIPATING SHOP CONFIRMED — BLOCKED`.

For each shop record:

- shop and legal-business identity;
- ownership/authority and approved contacts;
- jurisdictions and verified license evidence;
- approved categories and transaction types;
- roles and MFA enrollment;
- agreement/policy versions and assent;
- plan, fees, caps and payout configuration;
- training completion;
- support/escalation contacts;
- successful bounded staging/onboarding validation;
- entry approvals and UTC; and
- next eligibility review/expiration.

Never commit raw government IDs, financial account details, credentials, or unredacted license documents to the repository.

## Daily operating record

- Service health and alert review
- Open incidents and stop-threshold status
- Payment/payout/refund/dispute reconciliation
- Unexplained variance: must be zero or explicitly escalated
- Webhook/backlog/scheduler status
- Support case volume and aging
- Prohibited-item/moderation/privacy/legal cases
- Beta shop/user/transaction cap usage
- Provider notices and configuration changes
- Security/access changes
- Required owner approvals and follow-ups

## Controlled-beta entry criteria

- All P0 gates in the public-launch audit pass.
- Any permitted P1 exception is documented, approved, bounded and time-limited.
- Exact candidate and provider identities are recorded.
- Staging certification and recovery drill pass.
- Counsel approves exact documents and scope.
- Owners/alternates and tested communication routes exist.
- Initial shops pass eligibility, licensing, agreement, training and onboarding checks.
- Financial reconciliation and stop controls are rehearsed.
- Final decision is recorded as `CONTROLLED BETA ONLY` or `GO` by authorized owners.

## Controlled-beta exit/expansion criteria

- Approved observation period completed.
- Representative workflows completed by real participating shops.
- No unresolved P0 issue.
- No unexplained financial or data variance.
- Support, disputes, refunds, prohibited-item, privacy and incident procedures demonstrated.
- Accessibility, performance, backup/restore and rollback evidence accepted.
- Counsel confirms whether scope/geography expansion requires renewed review.
- Authorized owners record expand, continue, pause, or terminate.
