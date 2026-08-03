import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import {
  DEFAULT_RESEND_API_TIMEOUT_MS,
  MAX_RESEND_API_TIMEOUT_MS,
  parseResendApiTimeout,
  parseSmtpTimeout,
  resetTransactionalEmailForTests,
  sendVerificationEmail,
  setTransactionalEmailResendClientForTests,
  setTransactionalEmailTransportForTests,
} from "../src/services/transactionalEmail.service.js";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = "test";
  process.env.EMAIL_PROVIDER = "resend";
  process.env.EMAIL_FROM = "PawnLoop <no-reply@notifications.pawnloop.com>";
  process.env.RESEND_API_KEY = "fake-api-key";
  process.env.RESEND_API_TIMEOUT_MS = "10000";
  process.env.WEB_URL = "https://pawnloop.test";
  resetTransactionalEmailForTests();
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  process.env.NODE_ENV = "test";
  resetTransactionalEmailForTests();
});

test("Resend HTTPS delivery requires API acceptance with a message identifier", async () => {
  let request;
  setTransactionalEmailResendClientForTests({
    emails: {
      async send(message, options) {
        request = { message, options };
        return { data: { id: "resend-message-123" }, error: null };
      },
    },
  });

  await sendVerificationEmail({
    to: "buyer@example.test",
    name: "Buyer",
    token: "sensitive-token",
  });

  assert.equal(request.message.from, process.env.EMAIL_FROM);
  assert.equal(request.message.to, "buyer@example.test");
  assert.match(request.message.text, /https:\/\/pawnloop\.test\/verify-email\?token=/);
  assert.ok(request.options.signal instanceof AbortSignal);
});

test("Resend error responses fail delivery without exposing the provider message", async () => {
  setTransactionalEmailResendClientForTests({
    emails: {
      async send() {
        return {
          data: null,
          error: { name: "validation_error", message: "provider detail" },
        };
      },
    },
  });

  await assert.rejects(
    sendVerificationEmail({ to: "buyer@example.test", name: "Buyer", token: "token" }),
    (error) =>
      error.name === "EmailProviderError" &&
      error.code === "validation_error" &&
      !error.message.includes("provider detail"),
  );
});

test("Resend thrown exceptions fail delivery", async () => {
  const failure = Object.assign(new Error("controlled failure"), { code: "ECONNRESET" });
  setTransactionalEmailResendClientForTests({
    emails: { async send() { throw failure; } },
  });
  await assert.rejects(
    sendVerificationEmail({ to: "buyer@example.test", name: "Buyer", token: "token" }),
    (error) =>
      error.name === "EmailProviderError" &&
      error.code === "ECONNRESET" &&
      !error.message.includes("controlled failure"),
  );
});

test("Resend responses without a message identifier fail delivery", async () => {
  setTransactionalEmailResendClientForTests({
    emails: {
      async send() {
        return { data: {}, error: null };
      },
    },
  });
  await assert.rejects(
    sendVerificationEmail({ to: "buyer@example.test", name: "Buyer", token: "token" }),
    { name: "EmailProviderError", code: "RESEND_MESSAGE_ID_MISSING" },
  );
});

test("Resend delivery times out and aborts the request", async () => {
  process.env.RESEND_API_TIMEOUT_MS = "5";
  let signal;
  setTransactionalEmailResendClientForTests({
    emails: {
      send(_message, options) {
        signal = options.signal;
        return new Promise(() => {});
      },
    },
  });

  await assert.rejects(
    sendVerificationEmail({ to: "buyer@example.test", name: "Buyer", token: "token" }),
    { name: "EmailDeliveryTimeoutError", code: "EMAIL_DELIVERY_TIMEOUT" },
  );
  assert.equal(signal.aborted, true);
});

test("missing RESEND_API_KEY fails before any delivery attempt", async () => {
  delete process.env.RESEND_API_KEY;
  await assert.rejects(
    sendVerificationEmail({ to: "buyer@example.test", name: "Buyer", token: "token" }),
    { name: "EmailConfigurationError", code: "EMAIL_PROVIDER_CONFIGURATION_ERROR" },
  );
});

test("missing and unsupported EMAIL_PROVIDER values fail closed", async () => {
  for (const provider of [undefined, "", "automatic", "sendgrid"]) {
    if (provider === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = provider;
    await assert.rejects(
      sendVerificationEmail({ to: "buyer@example.test", name: "Buyer", token: "token" }),
      { name: "EmailConfigurationError", code: "EMAIL_PROVIDER_CONFIGURATION_ERROR" },
    );
  }
});

test("Resend timeout parsing uses safe defaults and a reasonable upper bound", () => {
  for (const value of [undefined, "", "not-a-number", "10000ms", "1.5", "0", "-1"]) {
    assert.equal(parseResendApiTimeout(value), DEFAULT_RESEND_API_TIMEOUT_MS);
  }
  assert.equal(parseResendApiTimeout(" 2500 "), 2_500);
  assert.equal(parseResendApiTimeout("999999"), MAX_RESEND_API_TIMEOUT_MS);
});

test("SMTP remains available only when explicitly selected", async () => {
  process.env.EMAIL_PROVIDER = "smtp";
  let request;
  setTransactionalEmailTransportForTests({
    async sendMail(message) {
      request = message;
      return { messageId: "smtp-message-123" };
    },
  });

  await sendVerificationEmail({
    to: "buyer@example.test",
    name: "Buyer",
    token: "token",
  });
  assert.equal(request.from, process.env.EMAIL_FROM);
  assert.equal(request.to, "buyer@example.test");
});

test("SMTP timeout parsing uses bounded values and safe defaults", () => {
  assert.equal(parseSmtpTimeout(undefined, 8_000), 8_000);
  assert.equal(parseSmtpTimeout("", 8_000), 8_000);
  assert.equal(parseSmtpTimeout("not-a-number", 8_000), 8_000);
  assert.equal(parseSmtpTimeout("8000ms", 8_000), 8_000);
  assert.equal(parseSmtpTimeout("1.5", 8_000), 8_000);
  assert.equal(parseSmtpTimeout("0", 8_000), 8_000);
  assert.equal(parseSmtpTimeout("-1", 8_000), 8_000);
  assert.equal(parseSmtpTimeout(" 2500 ", 8_000), 2_500);
  assert.equal(parseSmtpTimeout("999999", 8_000), 60_000);
});
