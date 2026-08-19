# PawnLoop Counsel and Business Approval Packet V1

Status: **DRAFT — NOT LEGAL ADVICE — NOT APPROVED**

This packet organizes the decisions, documents, operating procedures, evidence, and approvals required before PawnLoop can conduct a transactional beta or unrestricted public launch. It does not establish compliance, authorize a deployment, approve production writes, or replace advice from qualified counsel in each launch jurisdiction.

## Required packet identifiers

- Packet version: `V1`
- Repository revision reviewed: `PENDING EXACT SHA`
- Legal operator: `Bealtair LLC — OWNER SUPPLIED; PENDING COUNSEL CONFIRMATION`
- Public identity: `PawnLoop, operated by Bealtair LLC — OWNER APPROVED; PENDING COUNSEL CONFIRMATION`
- Proposed launch geography: `Texas transactional beta; nationwide read-only browsing; international and unapproved interstate regulated transactions deferred`
- Proposed beta scope: `Five-shop, 250-invited-user, 60-day controlled beta under the approved scope record`
- Counsel reviewer and firm: `NOT YET SELECTED — BLOCKED`
- Business approval owner: `DESIGNATED OWNER — IDENTITY HELD IN RESTRICTED APPROVAL RECORD`
- Review opened UTC: `PENDING`
- Final decision UTC: `PENDING`

## Packet contents

1. [Document matrix](01-document-matrix.md) — exact documents, versions, owners, publication points, and approvals.
2. [Launch-scope decision record](02-launch-scope-decision-record.md) — geography, features, categories, users, money flows, caps, and exclusions.
3. [Counsel questionnaire](03-counsel-questionnaire.md) — questions requiring written legal conclusions.
4. [Operating procedures](04-operating-procedures.md) — executable procedures for regulated, financial, privacy, safety, and incident work.
5. [Business operations matrix](05-business-operations-matrix.md) — accountable owners, coverage, metrics, caps, and beta-shop entry/exit controls.
6. [Approval evidence register](06-approval-evidence-register.md) — evidence IDs and acceptance criteria.
7. [Counsel and business sign-off record](07-signoff-record.md) — exact-version approval, conditions, exceptions, and final disposition.
8. [Owner decisions and unresolved approval inputs](08-owner-decisions.md) — repository-safe owner proposals, accepted controls, and remaining blockers.

## Existing repository source records

Counsel and business reviewers must review this packet together with:

- `docs/legal-counsel-review-checklist-v1.md`
- `docs/legal-operational-public-launch-audit-v1.md`
- `docs/launch-operations/paid-beta-launch-checklist.md`
- `docs/launch-operations/public-launch-go-no-go.md`
- `docs/invite-only-beta-operations-v1.md`
- `docs/production-release-control-v1.md`
- `docs/production-backup-recovery-runbook-v1.md`
- `docs/launch-operations/incident-response.md`
- `docs/launch-operations/first-72-hours.md`
- `docs/launch-operations/staging-and-production-verification.md`
- the exact Terms, Privacy, consent, subscription, transaction, seller, buyer, auction, and prohibited-item documents listed in the document matrix.

Repository documents and automated tests are evidence inputs only. They do not prove provider configuration, operational staffing, legal compliance, or counsel approval.

## Review workflow

1. Business owners complete the launch-scope record without selecting unsupported assumptions.
2. The document owner records the exact version or commit SHA for every document in the matrix.
3. Counsel answers the questionnaire in writing and identifies required revisions, jurisdictions, conditions, and exclusions.
4. Product and engineering implement approved document and consent changes in a separate reviewable change set.
5. QA verifies publication, contextual links, assent, version retention, re-consent, withdrawal, negative paths, and accessibility against the exact candidate.
6. Operations rehearse each required procedure and record evidence IDs in the evidence register.
7. Counsel signs only the legal record; designated business, finance, privacy, support, security, and release owners sign their respective records.
8. The release owner may record `GO`, `CONTROLLED BETA ONLY`, or `NO-GO` only after verifying all mandatory evidence and conditions.

## Status vocabulary

Use only:

- `PENDING OWNER ASSIGNMENT`
- `PENDING BUSINESS DECISION`
- `PENDING COUNSEL REVIEW`
- `REVISION REQUIRED`
- `APPROVED WITH CONDITIONS`
- `APPROVED`
- `DEFERRED / OUT OF SCOPE`
- `NOT APPLICABLE — APPROVED RATIONALE REQUIRED`
- `BLOCKED`

An empty field is not approval. Verbal discussion, a draft document, an automated test, or the absence of an objection is not approval.

## Evidence handling

- Link evidence rather than embedding credentials, tokens, database URLs, government IDs, customer records, privileged communications, or payment data.
- Except for an owner-authorized public role contact recorded in the launch-scope decision, keep personal names, private email addresses, the non-public mailing address, signatures, and privileged communications in restricted storage. The repository may identify a role and evidence ID without publishing the underlying private record.
- Redact secrets and personal data while preserving reviewer, system, date, scope, outcome, and immutable identity.
- Record exact document versions, commit SHAs, provider deployment IDs, and UTC timestamps.
- Retain superseded legal documents and assent records according to the counsel-approved retention policy.
- Treat privileged legal advice and work product according to counsel’s handling instructions; do not place privileged analysis in a public repository.

## Definition of complete

This packet is complete only when:

- the launch scope is frozen and approved;
- every required document has an exact approved version;
- counsel has recorded jurisdiction- and scope-specific conclusions;
- all mandatory operating procedures have passed a rehearsal;
- owners and alternates are assigned;
- evidence IDs resolve to dated, reviewable records;
- all conditions and exceptions have owners and expiration/review dates; and
- the sign-off record contains an authorized final decision.
