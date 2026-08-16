import { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { loadDurableUploadConfig } from "../config/uploads.js";

function publicObjectUrl(baseUrl, key) {
  return `${baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function assertManagedKey(key) {
  if (!/^uploads\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpg|png|webp)$/.test(String(key || ""))) {
    const error = new Error("Storage object key is outside the managed upload prefix");
    error.name = "StorageKeyError";
    throw error;
  }
}

export function createS3UploadStorage(config, options = {}) {
  config ||= loadDurableUploadConfig(options.env);
  if (!config.enabled) {
    return {
      async put() {
        const error = new Error("Durable uploads are not configured");
        error.statusCode = 503;
        throw error;
      },
      async delete() {},
      async check() { return { enabled: false }; },
    };
  }

  const client = options.client || new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async put({ key, body, contentType, metadata }) {
      assertManagedKey(key);
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: metadata,
        IfNoneMatch: "*",
      }), { abortSignal: AbortSignal.timeout(config.limits.storageTimeoutMs) });
      return { url: publicObjectUrl(config.publicBaseUrl, key) };
    },
    async delete({ key }) {
      assertManagedKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(config.limits.storageTimeoutMs),
      });
    },
    async check(readinessSignal) {
      const storageTimeoutSignal = AbortSignal.timeout(config.limits.storageTimeoutMs);
      const abortSignal = readinessSignal
        ? AbortSignal.any([readinessSignal, storageTimeoutSignal])
        : storageTimeoutSignal;
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }), {
        abortSignal,
      });
      return { enabled: true };
    },
  };
}
