# Production upload durability certification v1

> **Repository-side controls only. Live production upload durability remains
> uncertified until authorized provider configuration and redeploy/TTL
> certification are completed.**

This runbook is intentionally credential-free and read-only. It does not authorize
deployment, provider, bucket, DNS, CORS, lifecycle, secret, database, or object
mutation.

## Architecture and gap classification

| Area | Classification | Evidence or remaining gap |
| --- | --- | --- |
| Provider selection and configuration | Implemented and covered | One fail-closed S3-compatible adapter; deployed configuration validation already exists. |
| Adapter check/upload/delete and public read | Implemented and covered | Bounded SDK calls, stable public delivery URL, prefix-constrained writes/deletes; public read is direct HTTPS delivery. |
| `uploadStorage` and `imageRuntimeCheck` wiring | Implemented and covered | Both are injected into `createApp`; fakes require no network credentials. |
| `/api/health` | Implemented and covered | Shallow liveness remains independent of dependencies. |
| `/api/ready` | Repository gap closed by this PR | Database, durable storage, and image processing are bounded; production now rejects disabled/non-durable storage. |
| Image validation and processing | Implemented and covered | JPEG/PNG/WebP MIME, magic bytes, decode, normalization, metadata stripping, size, dimensions, and pixels. |
| Object-key sanitization | Repository gap closed by this PR | Generated keys already ignored filenames; adapter now rejects operations outside its managed prefix. |
| Canonical item reference | Implemented and covered | Stable public delivery URLs are persisted; query-bearing short-lived signatures are not used. |
| Auction serialization | Implemented but insufficiently live-tested | Auction responses include the associated item and its images; restart retention is covered with a durable fake. |
| Cleanup and lifecycle | Implemented and covered | Idempotent retry, missing-object safety, reference recheck, sanitized observable failure, scheduler and provider backstop. |
| Credential-free production checker | Repository gap closed by this PR | Offline-tested GET/HEAD-only verifier added. |
| Provider durability, redeploy, cache, TTL, and browser proof | Live-provider evidence still required | Follow the live procedure below after separate authorization. |
| Malware scanning | Out of scope | Existing documented launch risk decision; no provider is selected here. |

## Repository controls delivered

- `/api/health` is shallow liveness. It does not contact the database, object
  store, or image processor.
- `/api/ready` checks the database, durable upload adapter, and Sharp image
  runtime with bounded timeouts. Production returns 503 unless the adapter
  explicitly reports durable storage enabled and all checks pass.
- Readiness output contains only dependency states. Errors and provider
  identifiers are not returned.
- The existing S3-compatible adapter remains the only storage architecture.
  Upload and delete keys are restricted to the server-managed `uploads/` prefix.
- The existing upload path validates authorization and shop ownership, declared
  MIME type against decoded format and magic bytes, corruption, file count and
  byte/dimension ceilings, randomized object keys, processing failures, provider
  timeouts, lifecycle attachment, reference protection, and retryable deletion.
- Canonical image identity is the stable HTTPS public delivery URL saved on the
  item. Auctions serialize their associated item and therefore retain the same
  image identity. No short-lived signature is persisted by this architecture.
- `scripts/verify-production-upload-readiness.mjs` performs bounded GET/HEAD
  checks only, accepts no credentials, refuses non-HTTPS targets outside fixture
  mode, disables redirects, and redacts query strings.

## Provider configuration still required

An authorized operator must separately verify that production has a durable
S3-compatible provider, public delivery domain, least-privilege credentials,
encryption, access policy, cache policy, CORS, monitoring, capacity, and lifecycle
rules matching `docs/durable-photo-uploads-v1.md`. Do not record bucket names,
credentials, signed URLs, or provider configuration in certification evidence.

Provider configuration is not part of this PR. A passing repository test cannot
prove that production is configured correctly.

## Live certification procedure (not yet performed)

Use an approved test shop and immutable release SHA. Store timestamps, sanitized
HTTP status, browser screenshots, and the release SHA in the authorized evidence
system; never store secrets or URL query strings in tickets or logs.

1. Confirm the deployed API and frontend revisions equal the immutable release
   SHA. Confirm `/api/health` succeeds and `/api/ready` identifies `production`
   with `database`, `storage`, and `imageProcessing` all `ok`.
2. As an authorized shop actor, upload an item image and persist it through item
   create/update. Create or select an auction for that item. Record only sanitized
   public URLs with query strings removed.
3. Refresh item list/detail and auction card/detail views. Confirm the valid item
   image is used instead of the fallback.
4. Redeploy the API at the same immutable SHA. Repeat readiness and all item and
   auction reads without re-uploading.
5. Redeploy the frontend at the same immutable SHA. Repeat desktop and mobile
   browser rendering checks.
6. Perform an authorized cache purge, then repeat item and auction API reads and
   browser rendering.
7. Wait longer than any configured signed-URL TTL, even though the current
   repository contract stores stable public URLs. Repeat all reads and compare
   canonical identity. One successful request does not prove redeploy or TTL
   survival.
8. Exercise authorized removal of an unreferenced test image. Confirm repeated
   removal and a missing object are safe. Confirm an image still referenced by an
   item/auction is protected. Confirm cleanup cannot address an object outside the
   managed prefix and that sanitized failure telemetry is observable.
9. Run the checker only after explicit production authorization:

   ```sh
   node scripts/verify-production-upload-readiness.mjs \
     --ready-url https://PRODUCTION_API_HOST/api/ready \
     --item-image-url https://PUBLIC_IMAGE_HOST/REDACTED_ITEM_PATH \
     --auction-image-url https://PUBLIC_IMAGE_HOST/REDACTED_AUCTION_PATH
   ```

10. Attach the complete evidence set to the immutable SHA and obtain operational
    sign-off. Until every step passes, report live durability as uncertified.

## Rollback and incident response

- If readiness fails, stop traffic promotion and preserve the failing release and
  sanitized logs for diagnosis. Do not bypass storage or image-processing checks.
- If newly uploaded images disappear, suspend upload promotion, identify the last
  known-good release, and follow the normal application rollback process. Do not
  delete provider objects as part of application rollback.
- If public delivery fails while storage is healthy, treat it as a delivery/cache
  incident. Preserve canonical item references and avoid bulk rewrites.
- If cleanup targets referenced objects or escapes the managed prefix, disable the
  cleanup worker through the approved operational process, preserve evidence, and
  escalate as a data-integrity incident.
- Provider credential rotation, bucket policy changes, cache purge, lifecycle
  changes, and redeployment require separately authorized operational procedures.

## Evidence status

Repository tests use injected fakes and offline mocked fetch. No staging or
production provider, object, database, deployment, or secret was accessed by this
workstream. Live production upload durability remains uncertified.
