import nodemailer from "nodemailer";
import { Resend } from "resend";

let configuredTransport = null;
let configuredResendClient = null;
let localTransport = null;

const MAX_SMTP_TIMEOUT_MS = 60_000;
export const DEFAULT_RESEND_API_TIMEOUT_MS = 10_000;
export const MAX_RESEND_API_TIMEOUT_MS = 30_000;

function configurationError(message) {
  return Object.assign(new Error(message), {
    name: "EmailConfigurationError",
    code: "EMAIL_PROVIDER_CONFIGURATION_ERROR",
  });
}

function sanitizedProviderCode(value, fallback = "RESEND_API_ERROR") {
  const code = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : fallback;
}

export function parseSmtpTimeout(value, fallback) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_SMTP_TIMEOUT_MS)
    : fallback;
}

export function parseResendApiTimeout(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return DEFAULT_RESEND_API_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return DEFAULT_RESEND_API_TIMEOUT_MS;
  }
  return Math.min(parsed, MAX_RESEND_API_TIMEOUT_MS);
}

function frontendUrl(path, token) {
  const base = String(
    process.env.WEB_URL || process.env.FRONTEND_URL || "http://localhost:5173",
  ).replace(/\/+$/, "");
  const url = new URL(path, `${base}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

function getSmtpTransport() {
  if (configuredTransport) return configuredTransport;
  const host = String(process.env.SMTP_HOST || "").trim();
  if (host) {
    const port = Number.parseInt(process.env.SMTP_PORT || "587", 10);
    const user = String(process.env.SMTP_USER || "").trim();
    const pass = String(process.env.SMTP_PASS || "");
    localTransport = nodemailer.createTransport({
      host,
      port: Number.isInteger(port) && port > 0 ? port : 587,
      secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
      connectionTimeout: parseSmtpTimeout(
        process.env.SMTP_CONNECTION_TIMEOUT_MS,
        8_000,
      ),
      greetingTimeout: parseSmtpTimeout(
        process.env.SMTP_GREETING_TIMEOUT_MS,
        8_000,
      ),
      socketTimeout: parseSmtpTimeout(
        process.env.SMTP_SOCKET_TIMEOUT_MS,
        10_000,
      ),
      ...(user ? { auth: { user, pass } } : {}),
    });
    return localTransport;
  }
  if (process.env.NODE_ENV === "production") {
    throw configurationError("SMTP_HOST is required for transactional email");
  }
  if (!localTransport) {
    localTransport = nodemailer.createTransport({ jsonTransport: true });
  }
  return localTransport;
}

function getEmailProvider() {
  const provider = String(process.env.EMAIL_PROVIDER || "")
    .trim()
    .toLowerCase();
  if (provider !== "resend" && provider !== "smtp") {
    throw configurationError(
      "EMAIL_PROVIDER must explicitly select resend or smtp",
    );
  }
  return provider;
}

function getResendClient() {
  if (configuredResendClient) return configuredResendClient;
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    throw configurationError("RESEND_API_KEY is required for Resend email");
  }
  return new Resend(apiKey);
}

async function sendWithResend(message) {
  const controller = new AbortController();
  const timeoutMs = parseResendApiTimeout(process.env.RESEND_API_TIMEOUT_MS);
  let timeoutHandle;
  const timeoutError = Object.assign(new Error("Resend API delivery timed out"), {
    name: "EmailDeliveryTimeoutError",
    code: "EMAIL_DELIVERY_TIMEOUT",
  });

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      getResendClient().emails.send(
        {
          from: process.env.EMAIL_FROM || "PawnLoop <no-reply@localhost>",
          ...message,
        },
        { signal: controller.signal },
      ),
      timeoutPromise,
    ]);

    if (result?.error) {
      throw Object.assign(new Error("Resend rejected the email"), {
        name: "EmailProviderError",
        code: sanitizedProviderCode(result.error.name),
      });
    }
    const messageId = String(result?.data?.id || "").trim();
    if (!messageId) {
      throw Object.assign(new Error("Resend did not return a message identifier"), {
        name: "EmailProviderError",
        code: "RESEND_MESSAGE_ID_MISSING",
      });
    }
    return messageId;
  } catch (error) {
    if (
      error?.name === "EmailProviderError" ||
      error?.name === "EmailDeliveryTimeoutError" ||
      error?.name === "EmailConfigurationError"
    ) {
      throw error;
    }
    throw Object.assign(new Error("Resend email delivery failed"), {
      name: "EmailProviderError",
      code: sanitizedProviderCode(error?.code, "RESEND_REQUEST_FAILED"),
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function send(message) {
  const provider = getEmailProvider();
  if (provider === "resend") return sendWithResend(message);

  const result = await getSmtpTransport().sendMail({
    from: process.env.EMAIL_FROM || "PawnLoop <no-reply@localhost>",
    ...message,
  });
  return result?.messageId;
}

export function setTransactionalEmailTransportForTests(transport) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test email transport can only be set in tests");
  }
  configureTransactionalEmailTransport(transport);
}

export function setTransactionalEmailResendClientForTests(client) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test Resend client can only be set in tests");
  }
  if (!client?.emails || typeof client.emails.send !== "function") {
    throw new TypeError("Test Resend client must implement emails.send");
  }
  configuredResendClient = client;
}

export function resetTransactionalEmailForTests() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Transactional email can only be reset in tests");
  }
  configuredTransport = null;
  configuredResendClient = null;
  localTransport = null;
}

export function configureTransactionalEmailTransport(transport) {
  if (!transport || typeof transport.sendMail !== "function") {
    throw new TypeError("Transactional email transport must implement sendMail");
  }
  configuredTransport = transport;
}

export async function sendVerificationEmail({ to, name, token }) {
  const actionUrl = frontendUrl("/verify-email", token);
  await send({
    to,
    subject: "Verify your PawnLoop email",
    text: `Hi ${name}, verify your email to continue with PawnLoop: ${actionUrl}`,
  });
}

export async function sendPasswordResetEmail({ to, name, token }) {
  const actionUrl = frontendUrl("/reset-password", token);
  await send({
    to,
    subject: "Reset your PawnLoop password",
    text: `Hi ${name}, reset your PawnLoop password: ${actionUrl}`,
  });
}
