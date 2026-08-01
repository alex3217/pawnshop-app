# PawnLoop Post-Launch Roadmap

This roadmap assumes all P0 launch blockers are closed first.

## Recommended implementation order

1. Establish an isolated, production-like staging/test database; validate migration history and rehearse clean deploy/rollback without touching production.
2. Freeze seller/buyer plan semantics and reconcile Stripe catalog mappings and existing subscriptions read-only.
3. Certify identity, owner approval, shop isolation and staff permissions with database-backed role tests.
4. Certify the canonical commerce state machines: listing → reserve/bid/offer → payment webhook → fulfillment → cancel/refund/dispute → payout.
5. Close security gates: dependency upgrades, upload hardening, public-field contracts, redirect/webhook abuse tests and production secrets/config validation.
6. Run browser/mobile responsive and WCAG 2.2 AA audits on public, checkout and role-critical paths.
7. Complete operational readiness: monitoring, alerts, backups/restores, incident/support playbooks and launch rehearsal.
8. Only then expand or relabel generic Admin and intelligence/growth surfaces.

## Post-launch feature sequence

| Phase | Features | Why deferred |
|---|---|---|
| 1: Reliability | Queue-backed email retry/bounce handling, Socket.IO multi-instance fanout, query/load tuning, image pipeline | Needed as usage grows; observability first |
| 2: Admin depth | Real review/support/risk/analytics queues and action workflows | Current pages are generic operational launchpads rather than complete domains |
| 3: Buyer premium | Collections, AI shopping, loyalty, concierge, early inventory alerts, exclusive deal automation | Benefits are declared in plan configuration but complete workflows are not evidenced |
| 4: Seller automation | Certified POS connectors, scheduled sync, mapping governance, AI listing cost/quality controls | Existing connector text calls sync jobs placeholder; provider certification required |
| 5: Growth intelligence | Proven data provenance, cohorting, predictive shop health, automated campaign controls | Avoid presenting derived or hard-coded metrics as intelligence |
| 6: Native mobile parity | Secure staff scanning, owner workflows, notifications, deep links, store release | Current mobile app is a limited subset with no automated tests |
| 7: Scale | Cache strategy, read models, analytics warehouse, load shedding, PDF/QR asynchronous jobs | Implement based on measured production demand |

