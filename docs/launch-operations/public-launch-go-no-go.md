# Public Launch Go/No-Go Checklist V1

This is an evidence template, not a statement of readiness. Unchecked items block unrestricted public launch unless the authorized decision owner records an approved, time-bounded exception that does not waive legal, security, privacy, financial-integrity, or data-recovery requirements.

## Decision record

- Release ID / revision: TBD
- Launch scope, geography, categories, and enabled workflows: TBD
- Release owner: OWNER: TBD
- Technical approver: OWNER: TBD
- Security/privacy approver: OWNER: TBD
- Legal approval: PENDING COUNSEL REVIEW
- Finance/payments approver: OWNER: TBD
- Support/operations approver: OWNER: TBD
- Decision and UTC time: TBD
- RTO: PENDING APPROVAL
- RPO: PENDING APPROVAL

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

Decision options: `GO`, `NO-GO`, or `CONTROLLED BETA ONLY`. Absence of evidence is `NO-GO` for unrestricted public launch.
