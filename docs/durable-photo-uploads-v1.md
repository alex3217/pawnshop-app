# Durable photo uploads v1

PawnLoop exposes authenticated multipart endpoints at `POST /api/uploads` and
`POST /api/uploads/bulk`. The frontend sends `kind` plus either `itemId` for an
item image or `shopId` for a shop logo/banner. Responses contain `{ file }` or
`{ files }` with a stable asset ID, public URL, normalized MIME type, byte size,
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
written with metadata stripped. Default limits are 10 MiB per file, 10 files per
bulk request, 50 MiB aggregate input, 12,000 pixels per dimension, and 40 million
pixels total. All limits are enforced before durable writes where possible.

Bulk uploads are atomic from the API consumer's perspective. If validation or a
provider write fails, objects already written for that request are deleted on a
best-effort basis and the request fails without returning partial results. Provider
lifecycle rules should additionally expire incomplete multipart uploads and clean
unreferenced objects according to the operator's retention policy. Malware scanning
is not implemented; production operators must assess and configure an external
scanner if policy or risk requirements demand one.

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

The adapter uses the S3-compatible API and works with Cloudflare R2 or AWS S3.
Staging and production validation rejects enabled uploads with incomplete, local,
credential-bearing, or non-HTTPS provider URLs. There is no filesystem fallback.
Provider credentials and bucket/CORS/domain configuration remain deployment work
and must never be committed.

Tests inject an in-memory fake adapter into `createApp`; they do not contact a
provider. Run `node --test --test-concurrency=1 test/uploads.test.js` from the
backend workspace. Rollback consists of reverting the application release and
disabling the provider configuration; uploaded objects remain durable and can be
retained or removed under the provider lifecycle policy.
