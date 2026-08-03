# Secret leak response

Treat every exposed credential as compromised. Deleting it from the latest commit does not make it safe.

## Containment and revocation

1. Immediately stop using the credential and revoke or rotate it with its provider.
2. Identify the affected environment, the credential's permissions, and every system that accepted it.
3. Inspect provider and application access logs for unexpected use.
4. Remove the credential from the current working tree without copying it into another file.

## Repository cleanup

5. Determine whether any Git commit, branch, tag, fork, artifact, or cache contains it.
6. Coordinate with repository owners before rewriting shared Git history. A rewrite affects every collaborator and clone.
7. After a rewrite, require affected users to re-fetch or replace their clones so the old objects are not reintroduced.

## Recovery and follow-up

8. Rotate related credentials when access or compromise could spread beyond the original credential.
9. Notify the security owner and affected service owners through an approved private channel.
10. Record the timeline, scope, revocation evidence, access-log review, and recovery actions without recording the credential value.
11. Verify applications use the replacement through their secret store, then monitor for rejected use of the revoked credential.
12. Add a focused scanner regression or configuration safeguard that prevents the same leak pattern from recurring.

Never copy a credential into chat, tickets, logs, incident notes, or documentation. Refer to it by provider, purpose, and a non-sensitive identifier only.
