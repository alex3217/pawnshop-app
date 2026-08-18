# Public Launch Go/No-Go Checklist V1

This is an evidence template, not a statement of readiness. Unchecked items block unrestricted public launch unless the authorized decision owner records an approved, time-bounded exception that does not waive legal, security, privacy, financial-integrity, or data-recovery requirements.

Current disposition: **NOT YET CERTIFIED** for both unrestricted public launch and transactional beta. Production remains contained behind Render maintenance mode and the repository public-preview read-only gate; Render automatic deployment remains disabled. Changing any of those controls, deploying, selecting a release candidate, or enabling transactions requires separate authorization.

PR #352 replaced and integrated PR #330, and PR #355 replaced and integrated PR #315. Their managed-public-media, publication-bypass, and Super Admin shop-inventory support controls are merged. Final accessibility evidence from PR #354 remains pending refresh before selecting the immutable release-candidate SHA.

## Decision record

- Release ID / revision: TBD WITH APPROVAL
- Launch scope, geography, categories, and enabled workflows: TBD WITH APPROVAL
- Release owner: PENDING OWNER ASSIGNMENT
- Technical approver: PENDING OWNER ASSIGNMENT
- Security/privacy approver: PENDING OWNER ASSIGNMENT
- Legal approval: PENDING COUNSEL REVIEW
- Finance/payments approver: PENDING OWNER ASSIGNMENT
- Support/operations approver: PENDING OWNER ASSIGNMENT
- Decision and UTC time: TBD WITH APPROVAL
- RTO: TBD WITH APPROVAL
- RPO: TBD WITH APPROVAL

## Required launch evidence

- [ ] Scope freeze lists every enabled/disabled registration, marketplace, auction, pawn/sell, subscription, payment, payout, messaging, upload, and AI workflow.
- [ ] All public legal documents are counsel-approved, versioned, mutually consistent, linked at relevant decision points, and have correct entity/contact details. **PENDING COUNSEL REVIEW**.
- [ ] Registration, policy acceptance, payment authorization, subscription enrollment, and transaction-specific consent evidence has passed product/legal review. **PENDING COUNSEL REVIEW**.
- [ ] Launch jurisdictions, shop licenses/responsibilities, prohibited goods, stolen-property, reporting, identity, sanctions, and tax decisions are approved. **PENDING COUNSEL REVIEW**.
- [ ] Privacy data inventory, vendor inventory, retention/deletion, rights requests, breach response, tracking/cookies, geolocation, images/AI, and children restrictions are approved. **PENDING COUNSEL REVIEW**.
- [ ] Staging certification is complete for the exact revision and configuration fingerprint.
- [ ] Deployment, migration compatibility, rollback, incident, provider-outage, backup, and isolated restore drills have current dated evidence.
- [ ] Production backup recovery point is verified; RTO/RPO are approved and met in a drill.
- [ ] Central metrics, logs, error tracking, synthetic availability, alert routing, escalation, and on-call coverage are tested.
- [ ] Service-level indicators and objectives are approved for availability, latency, errors, critical workflows, webhook age, queue/scheduler health, and support response. Values: PENDING APPROVAL.
- [ ] Dependency/secret scanning and vulnerability triage have no unaccepted launch-blocking findings.
- [ ] Privileged-access and secret-rotation review is complete; emergency access was rehearsed and revoked.
- [ ] Support, abuse/fraud, prohibited-item, stolen-property, privacy, legal, security, financial, and law-enforcement escalation paths are staffed and tested.
- [ ] Accessibility, supported browser/device, performance/capacity, tenant authorization, and critical end-to-end evidence is approved.
- [ ] Production deployment window, maintenance communication, status-page owner, go/no-go time, rollback threshold, and first-72-hours roster are assigned.
- [ ] Production smoke test is approved for scope and identities; no unsafe state-changing probe is planned.
- [ ] Final decision contains evidence links and explicitly records every exception and residual risk.

## Scope-specific gates

Read-only public preview may expose only separately approved read paths while production writes remain fail-closed. It still requires approved public legal content and contacts for what is shown, privacy/security review, accessible role-based read-only QA, monitoring and incident ownership, verified provider containment, and an authorized release decision. It must not be described as transactional beta.

Transactional beta additionally requires counsel-approved transaction policies and consent, verified Stripe/provider configuration, durable storage certification, migration/backup/restore/rollback evidence, support and financial reconciliation ownership, approved write enablement, and real pawn-shop beta validation. Public launch additionally requires all P0 and P1 gates in the audit to pass for the approved geography, categories, roles, and scale.

Initial pawn-shop beta entry criteria: immutable candidate and scope approved; P0 gates passed; P1 exceptions expressly approved; production/provider evidence current; named support/incident/finance owners; caps and stop criteria recorded; each participating shop's eligibility, authority, licenses, training, and contacts verified as counsel/operations require; role-based QA and bounded test transactions reconciled. Status: **NOT YET CERTIFIED**.

Initial pawn-shop beta exit criteria: real participating shops have completed the approved observation period and representative workflows; no unresolved P0 issue or unexplained financial/data variance; support, disputes, refunds, prohibited-item escalation, monitoring, accessibility, backup/restore and rollback evidence meets approved criteria; owners approve expansion, pause, or termination. Values, cohort, dates, and evidence: **PENDING OPERATOR EVIDENCE**.

Decision options: `GO`, `NO-GO`, or `CONTROLLED BETA ONLY`. Absence of evidence is `NO-GO` for unrestricted public launch.
