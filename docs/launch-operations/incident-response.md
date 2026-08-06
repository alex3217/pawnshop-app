# Incident Response V1

## Severity model

Severity may be raised immediately by the Incident Commander (IC). Lowering severity requires written evidence and IC approval.

| Level | Impact | Urgency | Example conditions | Response expectation | Escalation expectation |
|---|---|---|---|---|---|
| SEV0 | Active or credible catastrophic risk to money, tenant isolation, privileged access, secrets, or recoverability; continued operation may compound harm. | Declare and stop affected operations immediately. | Duplicate money movement; material tenant isolation failure; privilege escalation; confirmed auth compromise; destructive corruption with uncertain recovery. | `OWNER/TBD` must define acknowledgment and command-activation targets before launch. Continuous command until contained. | IC immediately engages Technical Lead and relevant Security and/or Finance Lead; executive/legal/regulatory escalation is `OWNER/TBD`. |
| SEV1 | Critical customer workflow broadly unavailable or material data/financial integrity at risk, with no safe workaround. | Immediate declaration and active response. | API/database/auth outage; uncontrolled 5xx; webhook backlog threatening correct money state; critical restore uncertainty. | `OWNER/TBD` must define acknowledgment/update targets. Continuous response while impact persists. | IC and Technical Lead required; Communications, Support, Security, or Finance engaged by impact. Executive escalation is `OWNER/TBD`. |
| SEV2 | Significant degradation or limited-scope failure with a safe workaround and no known integrity compromise. | Prompt triage and bounded mitigation. | High latency; auction degradation for a subset; scheduled job or email outage with contained backlog. | `OWNER/TBD` must define response and update targets. | Technical Lead and service owner; IC decides whether Support/Communications join. Raise to SEV1 on expansion or integrity uncertainty. |
| SEV3 | Minor, localized operational defect with low immediate customer risk. | Track and address in normal operational cadence. | Cosmetic status issue, noncritical third-party degradation, isolated recoverable failure. | `OWNER/TBD` must define business-hours target. | Service owner; escalate if scope, duration, or risk increases. |

## Incident command structure

| Role | Decision authority and duties |
|---|---|
| Incident Commander | Declares severity; owns objectives, cadence, role assignment, stop/rollback decisions, and closure. Does not perform every technical task. Escalates unresolved authority to `OWNER/TBD`. |
| Technical Lead | Owns technical hypothesis, containment/recovery options, change execution, validation, and technical evidence. May halt an unsafe action; requests IC authorization for recovery changes. |
| Communications Lead | Owns internal updates and approved customer notices, audience, cadence, and message evidence. Publishes only with IC approval and required `OWNER/TBD` review. |
| Security Lead (when needed) | Owns access containment, evidence preservation, credential exposure assessment, and security escalation. Has authority to require session/access revocation and to block unsafe recovery. |
| Finance/Payments Lead (when needed) | Owns provider/internal identity correlation, reconciliation, financial holds, correction proposals, and immutable evidence. No manual correction without required approvals. |
| Customer Support Lead (when needed) | Owns support intake, approved response guidance, affected-customer aggregation, and escalation of new symptoms. Must not promise refunds, payouts, or timelines without authorization. |

The IC owns the decision log. Each lead owns evidence from their workstream. The Communications Lead owns issued-message copies. The Technical Lead executes recovery only after IC authorization; Security or Finance approval is additionally required when their domain is affected. Role assignment, alternates, executive authority, and external contacts remain `OWNER/TBD`.

## Incident lifecycle

For every phase record UTC start/end timestamps, actor role, facts, hypothesis (clearly labeled), actions, approvals, redacted evidence references, and next decision.

1. **Detection:** preserve alert/report source; confirm scope without changing state.
2. **Declaration:** create incident ID, severity, IC, channel, evidence location, and update cadence.
3. **Containment:** stop compounding harm using the least invasive reversible control; record before/after state.
4. **Investigation:** maintain hypotheses, queries/observations, and disconfirming evidence; preserve logs and identities.
5. **Mitigation:** choose a bounded action, owner, approval, rollback point, and success/failure criteria.
6. **Recovery:** restore service or data only under the applicable runbook and authority; retain a recovery point before destructive work.
7. **Validation:** validate liveness/readiness, affected workflows, security/data integrity, and financial reconciliation as applicable. Absence of complaints is not validation.
8. **Closure:** IC records impact window, residual risk, customer communications, evidence index, and follow-ups. Do not close with unexplained financial or data variance.
9. **Postmortem:** complete the template below, assign owners/dates, and track corrective actions without blame.

## Emergency access / break-glass

1. Open an incident/change record with reason, requested scope, approving role (`OWNER/TBD`), request and expiry timestamps.
2. Obtain explicit approval before access unless immediate life/safety or catastrophic-loss policy—still `OWNER/TBD`—expressly permits otherwise.
3. Grant a named individual the least privilege for the shortest approved duration. Never create or transmit shared credentials.
4. Record access-grant identity, mechanism, scope, approver, timestamps, and provider/audit-log references without secrets.
5. Perform only approved actions; preserve evidence and use a second observer for security or financial changes when required by `OWNER/TBD`.
6. Revoke access at task completion or expiry and verify revocation. Rotate exposed or temporarily disclosed credentials where appropriate; do not rotate blindly if it would destroy evidence or availability.
7. Record validation and conduct retrospective review of necessity, actions, logs, revocation, rotation, and control improvements.

The repository does not implement a break-glass account, temporary cloud grants, or access automation. Those mechanisms and approvers remain external `OWNER/TBD` decisions.

## Status and communication templates

### Internal incident update

```text
[INCIDENT_ID] [SEVERITY] — [STATUS]
UTC timestamp: [TIMESTAMP]
Incident Commander: [OWNER/TBD]
Customer/financial/data impact: [CONFIRMED FACTS OR UNKNOWN]
Current scope: [SCOPE]
Actions since last update: [ACTIONS + EVIDENCE REFERENCES]
Current mitigation: [MITIGATION]
Risks/blockers: [RISKS]
Next decision/update: [UTC TIMESTAMP OR CONDITION]
```

### Customer-facing service notice

```text
Title: [SERVICE] service issue
As of [UTC TIMESTAMP], [CONFIRMED CUSTOMER-VISIBLE SYMPTOM].
We are [INVESTIGATING / MITIGATING]. [SAFE WORKAROUND, IF VERIFIED].
Do not [RETRY OR ACTION TO AVOID, IF APPLICABLE].
Next update: [TIME/CONDITION].
Reference: [PUBLIC INCIDENT REFERENCE]
```

### Incident resolved notice

```text
Title: [SERVICE] issue resolved
Service was restored at [UTC TIMESTAMP] and validation completed at [UTC TIMESTAMP].
Customer impact: [CONFIRMED SUMMARY].
Required customer action: [NONE OR VERIFIED ACTION].
We will [POST-INCIDENT FOLLOW-UP COMMITMENT].
Reference: [PUBLIC INCIDENT REFERENCE]
```

### Beta shop advisory

```text
To: [BETA SHOP / COHORT]
Subject: PawnLoop beta advisory — [TOPIC]
Issued: [UTC TIMESTAMP]
What is affected: [CONFIRMED SCOPE]
What the shop should do/not do: [SAFE INSTRUCTIONS]
Support path: [APPROVED CONTACT]
Next update: [TIME/CONDITION]
Reference: [INCIDENT/ADVISORY ID]
```

## Postmortem template

- Incident ID: `[ID]`
- Severity: `[SEV0–SEV3]`
- Start/end (UTC): `[TIMESTAMPS]`
- Detection method: `[METHOD AND EVIDENCE]`
- Customer impact: `[SCOPE/DURATION]`
- Financial impact: `[AMOUNT, CURRENCY, COUNTS, RECONCILIATION STATUS OR NONE]`
- Data impact: `[CONFIDENTIALITY/INTEGRITY/AVAILABILITY OR NONE]`
- Timeline: `[UTC EVENT/ACTION/DECISION/EVIDENCE ENTRIES]`
- Root cause: `[EVIDENCE-BACKED CAUSE]`
- Contributing factors: `[FACTORS]`
- Successful controls: `[CONTROLS + EVIDENCE]`
- Failed controls: `[CONTROLS + EVIDENCE]`
- Recovery: `[ACTIONS, APPROVALS, VALIDATION]`
- Corrective actions: `[ACTION, PRIORITY]`
- Owners: `[OWNER/TBD PER ACTION]`
- Due dates: `[DATE/TBD PER ACTION]`
- Evidence references: `[REDACTED LINKS/IDS]`
