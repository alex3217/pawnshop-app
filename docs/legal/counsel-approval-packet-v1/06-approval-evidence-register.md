# Approval Evidence Register

Status: **EMPTY REGISTER — NO APPROVAL IS IMPLIED**

Use immutable links or controlled evidence-system references. Do not store secrets, raw credentials, payment data, government IDs, customer records, privileged legal advice, or unredacted provider configuration in this register.

## Evidence register

| Evidence ID | Gate / artifact | Exact scope and version | Owner | Reviewer / approver | Collected UTC | Result | Location | Expiration / next review | Notes / conditions |
|---|---|---|---|---|---|---|---|---|---|
| LEG-E001 | Counsel approval record | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| LEG-E002 | Approved document bundle | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| LEG-E003 | Jurisdiction/category matrix | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| BUS-E001 | Frozen beta scope and caps | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| BUS-E002 | Shop cohort and eligibility | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| OPS-E001 | Owner/alternate roster | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| OPS-E002 | Support and incident tabletop | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| OPS-E003 | First-72-hours roster | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| FIN-E001 | Stripe/configuration review | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| FIN-E002 | Test transactions/reconciliation | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| FIN-E003 | Daily reconciliation rehearsal | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| REC-E001 | RTO/RPO approval | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| REC-E002 | Protected recovery point | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| REC-E003 | Isolated restore drill | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| REL-E001 | Immutable candidate and CI | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| REL-E002 | Staging certification | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| REL-E003 | Rollback rehearsal | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| SEC-E001 | Security/tenant/threat review | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| SEC-E002 | Dependency/secret scan disposition | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| ACC-E001 | Automated accessibility evidence | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| ACC-E002 | Manual assistive-technology evidence | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| PRV-E001 | Privacy request rehearsal | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| TNS-E001 | Trust/safety and prohibited-item rehearsal | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| FFL-E001 | Type 01/02 FFL verification procedure and cohort records | Texas firearm controlled test | Compliance/Onboarding | Counsel, Operations | PENDING | BLOCKED | RESTRICTED REFERENCE PENDING | PENDING | No raw license documents or unnecessary personal data in repository |
| FFL-E002 | Firearm listing/review negative-path rehearsal | Browsing, reservation and shop contact only | Trust & Safety/Product | Counsel, Operations, QA | PENDING | BLOCKED | PENDING | PENDING | Must prove deferred categories, DTC shipping, C2C and payment paths fail closed |
| FFL-E003 | Transfer-completion attestation rehearsal | Minimum attestation data only | Compliance/Privacy | Counsel, Privacy, Security | PENDING | BLOCKED | PENDING | PENDING | No Form 4473, NICS, ID image, denial reason or A&D record retained |
| FFL-E004 | Firearm incident/suspension rehearsal | FFL/listing/transfer/payment/data-boundary incidents | Trust & Safety | Counsel, Security, Operations | PENDING | BLOCKED | PENDING | PENDING | Include reactivation and minimized preservation decision |
| PAY-E001 | Written Stripe firearm approval | PawnLoop, Connect architecture, participating shops, platform fees and firearm transactions | Finance/Payments | Stripe, Counsel, Finance | PENDING | BLOCKED — FIREARM PAYMENTS DISABLED | RESTRICTED REFERENCE PENDING | Provider review expiration | Separate from general Stripe configuration approval |
| PRO-E001 | Redacted provider configuration evidence | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |
| GO-E001 | Final decision record | PENDING | PENDING | PENDING | PENDING | BLOCKED | PENDING | PENDING | PENDING |

## Evidence acceptance rules

Evidence must:

- identify the exact document, candidate, deployment, configuration or procedure version;
- identify scope, environment, jurisdiction and enabled features;
- identify the actor/reviewer and UTC time;
- contain a clear result and unresolved conditions;
- be reproducible or independently reviewable;
- be current within its approved validity window;
- preserve confidentiality and data minimization; and
- link to corrective action for any failure or exception.

Screenshots without identity/context, draft documents, local tests without target evidence, provider badges without configuration detail, unchecked templates, or verbal approvals are insufficient.

## Exception register

| Exception ID | Gate | Risk | Reason | Scope/caps | Compensating controls | Approver | Start UTC | Expiration/review UTC | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| EX-001 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | BLOCKED |

Legal, privacy, security, financial-integrity and data-recovery requirements may not be waived merely to meet a launch date.
