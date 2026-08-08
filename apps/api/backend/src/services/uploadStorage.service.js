import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { loadDurableUploadConfig } from "../config/uploads.js";

function publicObjectUrl(baseUrl, key) {
  return `${baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function createS3UploadStorage(config = loadDurableUploadConfig()) {
  if (!config.enabled) {
    return {
      async put() {
        const error = new Error("Durable uploads are not configured");
        error.statusCode = 503;
        throw error;
      },
      async delete() {},
    };
  }

  const client = new S3Client({
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
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: metadata,
        IfNoneMatch: "*",
      }));
      return { url: publicObjectUrl(config.publicBaseUrl, key) };
    },
    async delete({ key }) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
