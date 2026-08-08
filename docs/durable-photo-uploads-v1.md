# Durable photo uploads v1

PawnLoop exposes authenticated multipart endpoints at `POST /api/uploads` and
`POST /api/uploads/bulk`. The frontend sends `kind` plus either `itemId` for an
item image or `shopId` for a shop logo/banner. Responses contain `{ file }` or
`{ files }` with a storage-object identifier (not a database asset-record ID),
public URL, normalized MIME type, byte size,
dimensions, and kind.

## Authorization

- `ITEM_IMAGE` requires an existing item and `inventory:write` access to its shop.
- `SHOP_LOGO` and `SHOP_BANNER` require `inventory:write` access to the named shop.
- Approved owners may act only for their own shops. Active staff need the existing
  shop-scoped `inventory:write` permission. Admin and Super Admin requests still
  require a real, non-deleted target. Consumers and unapproved owners are denied.

Object keys contain only a server-generated random ID and normalized extension;
the client cannot choose an object key or destination URL. Deletion is not part of
the current frontend workflow and is intentionally not exposed by this version;
future deletion must use a persisted asset ID and repeat the ownership check.

## Formats, limits, and lifecycle

JPEG, PNG, and WebP raster images are accepted. Declared MIME type, magic bytes,
and decoder output must agree. Images are decoded, auto-oriented, re-encoded, and
written with metadata stripped. Default and immutable maximum limits are 10 MiB per file, 10 files per
bulk request, 50 MiB aggregate input, 12,000 pixels per dimension, and 40 million
pixels total. Environment settings may lower but cannot raise these ceilings.
Aggregate bytes are counted while multipart data arrives, and an overflowing
file is discarded rather than retained. Uploads are limited per authenticated
user and source IP (20 and 60 requests per 60 seconds by default), with at most
one active upload request per API process by default (hard ceiling four) and no
waiting queue. Provider writes
and cleanup deletes time out after 10 seconds by default (30-second hard ceiling).

Bulk uploads are atomic from the API consumer's perspective. If validation or a
provider write fails, objects already written for that request are deleted on a
best-effort basis and the request fails without returning partial results. Provider
lifecycle rules should additionally expire incomplete multipart uploads and clean
unreferenced objects according to the operator's retention policy. Malware scanning
is not implemented; production operators must assess and configure an external
scanner if policy or risk requirements demand one.

Cleanup failures never replace the original upload error. The API emits a
sanitized structured warning containing only request correlation and failure count.

The Owner item workflow creates the item first, uploads selected images against
that server-issued item ID, then persists returned URLs through the existing item
update route. A failed photo step leaves a recoverable item ID so retry does not
create a duplicate. While recovery is active, the original shop remains locked,
the Clear Prefill action is disabled, and overlapping submissions are rejected.
Recovery identity is cleared only after image URLs are persisted successfully.
Persisted success is terminal for that page controller: observer or navigation
callback failures cannot replace the workflow result or permit another item create.
Existing-item uploads append and persist URLs. Shop creation
and Location editing similarly persist returned logo/banner URLs through the
ownership-checked shop update contract. Abandoned or removed objects are handled
by provider retention policy; this version intentionally exposes no deletion API.

## Provider configuration

Set `DURABLE_UPLOADS_ENABLED=true` only after configuring these variables:

- `UPLOAD_STORAGE_ENDPOINT`
- `UPLOAD_STORAGE_REGION`
- `UPLOAD_STORAGE_BUCKET`
- `UPLOAD_STORAGE_ACCESS_KEY_ID`
- `UPLOAD_STORAGE_SECRET_ACCESS_KEY`
- `UPLOAD_STORAGE_PUBLIC_BASE_URL`
- `UPLOAD_STORAGE_FORCE_PATH_STYLE`
- `UPLOAD_MAX_FILE_BYTES`
- `UPLOAD_MAX_FILES`
- `UPLOAD_MAX_AGGREGATE_BYTES`
- `UPLOAD_MAX_WIDTH`
- `UPLOAD_MAX_HEIGHT`
- `UPLOAD_MAX_PIXELS`
- `UPLOAD_RATE_LIMIT_WINDOW_MS`
- `UPLOAD_RATE_LIMIT_USER_MAX`
- `UPLOAD_RATE_LIMIT_IP_MAX`
- `UPLOAD_MAX_CONCURRENT`
- `UPLOAD_STORAGE_TIMEOUT_MS`

The adapter uses the S3-compatible API and works with Cloudflare R2 or AWS S3.
Staging and production validation rejects enabled uploads with incomplete, local,
credential-bearing, or non-HTTPS provider URLs. There is no filesystem fallback.
Provider credentials and bucket/CORS/domain configuration remain deployment work
and must never be committed.

Backend tests inject an in-memory fake adapter into `createApp`; frontend
behavioral tests execute the production workflow and Create Item recovery
controller with fake item, shop, upload, and navigation boundaries. Supplemental
source checks verify that the page uses that controller; they are not the primary
recovery proof. Tests do not contact a provider. Run
`node --test --test-concurrency=1 test/uploads.test.js` from the backend workspace
and `node --test test/upload-workflow.contract.test.mjs` from the web workspace.
Rollback consists of reverting the application release and
disabling the provider configuration; uploaded objects remain durable and can be
retained or removed under the provider lifecycle policy.
