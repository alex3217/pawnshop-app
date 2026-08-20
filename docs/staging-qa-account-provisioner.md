# Staging QA account provisioner

`apps/api/backend/scripts/provision-staging-qa-accounts.mjs` idempotently creates or refreshes the staging-only buyer, owner, admin, and super-admin QA accounts. It also ensures the owner has an approved owner application and one non-deleted QA shop so authenticated owner workflows are reachable.

The provisioner is an operator-invoked maintenance command. It is not part of build, migration, pre-deploy, deploy, or application-startup scripts.

## Required safeguards

The command fails before Prisma is imported unless all of these conditions hold:

- `APP_ENV` is exactly `staging`.
- `T48_PROVISION_STAGING_QA_ACCOUNTS` is exactly `T48-STAGING-QA-ACCOUNTS`.
- `DATABASE_URL` is a PostgreSQL URL with a staging-labeled host or database name. Its parsed hostname must not be `localhost`, an address in `127.0.0.0/8`, normalized IPv6 loopback `::1`, an unspecified address (`0.0.0.0` or `::`), or a Production-labeled target. Remote private/internal staging hosts remain supported.
- `T48_STAGING_DATABASE_URL_CONFIRMATION` is independently supplied and exactly matches `DATABASE_URL`.
- `BUYER_EMAIL`, `BUYER_PASSWORD`, `OWNER_EMAIL`, `OWNER_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD` are all nonempty.
- Each email and password is distinct, and every password passes the application password policy.

Do not put credential values in a shell history, issue, PR, report, log, or committed environment file. Supply them through the approved staging secret-injection mechanism.

## Behavior

Run from `apps/api/backend` with the safeguards and credentials already injected:

```sh
npm run provision:staging-qa-accounts
```

All database writes occur in one transaction. Existing accounts are updated only when their current role matches the expected role; a role mismatch aborts the transaction. Password refreshes increment `authVersion`, invalidating prior sessions. Successful output reports only whether each role was created or updated. Failure output is deliberately generic. Neither path prints emails, passwords, hashes, tokens, database URLs, or record IDs.

This command does not create listings, auctions, bids, offers, messages, charges, payouts, subscriptions, refunds, or disputes. It must never be run against Production.
