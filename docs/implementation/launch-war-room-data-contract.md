# Launch War Room Data Contract

The reviewed artifact exports `lastUpdated`, `items`, and `decisions`. Every record has `area`, `status`, and a user-safe `evidence` explanation. Status is restricted to PASS, FAIL, BLOCKED, PARTIAL, DEFERRED, or NOT_RUN. PASS requires retained evidence; absence of evidence must never default to PASS.

The route is `/super-admin/launch-readiness`, protected by the existing SUPER_ADMIN route guard. The artifact contains no secrets, credentials, internal filesystem paths, or mutable operational controls. Future generation should validate the enum/schema, include source artifact identifiers and timestamps, reject stale or unsigned input, and publish atomically.
