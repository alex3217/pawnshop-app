# Secret leak prevention

## Trusted pull-request enforcement

The authoritative `Secret Leak Prevention` check runs from a
`pull_request_target` workflow loaded from the repository's default branch.
It keeps the trusted default-branch worktree checked out, fetches pull-request
commits only as untrusted Git objects, and scans those objects with the trusted
scanner. Pull-request files, scripts, package commands, actions, binaries, and
configuration are never executed by that check.

The `Secret Scanner Candidate Validation` check in Core CI exercises proposed
scanner changes, but it is contributor-controlled and must never be configured
as the required security gate.

## Initial rollout limitation

The pull request that first introduces the trusted workflow cannot be protected
by that workflow because `pull_request_target` loads workflows that already
exist on the default branch. Initial rollout therefore requires manual security
review and a post-commit local `npm run check:secrets:tracked` pass before any
push.

After the trusted workflow reaches the default branch, the repository ruleset
must require its authoritative `Secret Leak Prevention` check. The candidate
validation check must remain non-authoritative.
