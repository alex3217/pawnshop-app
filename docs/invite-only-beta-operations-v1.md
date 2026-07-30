# Invite-only beta operations

Public registration is controlled by `INVITE_ONLY_REGISTRATION_ENABLED`. The
value must be explicitly `true` or `false`; it is not inferred from
`NODE_ENV`. Setting it to `true` makes `POST /api/auth/register` reject every
request that does not include a valid `inviteToken` (the alias `inviteCode` is
also accepted).

Only authenticated `SUPER_ADMIN` users can manage beta invites:

- `POST /api/super-admin/beta-invites` issues an invite with `cohort`,
  `expiresAt`, optional `email`, optional `intendedRole`, and optional
  `maxUses`.
- `GET /api/super-admin/beta-invites` lists/searches invites. Use `q`,
  `cohort`, and `limit` as needed.
- `GET /api/super-admin/beta-invites/:id` reports status and redemptions.
- `POST /api/super-admin/beta-invites/:id/revoke` permanently revokes an
  invite.

Issuance returns the raw token exactly once. Transfer it through an approved
secure channel immediately; later responses and the database contain no raw
token, and it cannot be recovered. Expiration and revocation stop further use.
`maxUses` caps successful registrations, including under concurrent requests.
Each successful registration is linked durably to its invite and beta cohort.

Issuance, revocation, and successful redemption are recorded in the existing
Super Admin audit log without the raw token. Enabling the flag is an operational
configuration step; this document does not claim any external production
environment has been configured.
