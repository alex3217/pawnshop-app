import assert from "node:assert/strict";
import test from "node:test";
import { createS3UploadStorage } from "../src/services/uploadStorage.service.js";

const config = {
  enabled: true,
  endpoint: "https://storage.example.test",
  region: "auto",
  forcePathStyle: false,
  accessKeyId: "test",
  secretAccessKey: "test",
  bucket: "test",
  publicBaseUrl: "https://assets.example.test",
  limits: { storageTimeoutMs: 50 },
};

function lookupResult(lookup, hostname) {
  return new Promise((resolve, reject) => lookup(hostname, {}, (error, address, family) => error ? reject(error) : resolve({ address, family })));
}

test("runtime S3 HeadBucket, PutObject, and DeleteObject share the guarded network handler", async () => {
  const commands = [];
  let capturedConfig;
  const storage = createS3UploadStorage(config, {
    dnsLookup: (_hostname, options, callback) => {
      assert.equal(options.all, true);
      callback(null, [{ address: "93.184.216.34", family: 4 }]);
    },
    s3ClientFactory(clientConfig) {
      capturedConfig = clientConfig;
      return { async send(command) { commands.push(command.constructor.name); } };
    },
  });

  await storage.check();
  await storage.put({ key: "uploads/test.png", body: Buffer.from("test"), contentType: "image/png" });
  await storage.delete({ key: "uploads/test.png" });

  assert.deepEqual(commands, ["HeadBucketCommand", "PutObjectCommand", "DeleteObjectCommand"]);
  const handlerConfig = await capturedConfig.requestHandler.configProvider;
  assert.equal(typeof handlerConfig.httpsAgent.options.lookup, "function");
  assert.deepEqual(await lookupResult(handlerConfig.httpsAgent.options.lookup, "storage.example.test"), { address: "93.184.216.34", family: 4 });
});

test("runtime S3 handler rejects private DNS without exposing resolver details", async () => {
  let capturedConfig;
  createS3UploadStorage(config, {
    dnsLookup: (_hostname, _options, callback) => callback(new Error("secret resolver detail")),
    s3ClientFactory(clientConfig) {
      capturedConfig = clientConfig;
      return { async send() {} };
    },
  });
  const handlerConfig = await capturedConfig.requestHandler.configProvider;
  await assert.rejects(lookupResult(handlerConfig.httpsAgent.options.lookup, "storage.example.test"), (error) => {
    assert.match(error.message, /DNS resolution failed/);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
});
