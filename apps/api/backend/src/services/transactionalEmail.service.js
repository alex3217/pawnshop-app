import nodemailer from "nodemailer";

let configuredTransport = null;
let localTransport = null;

function frontendUrl(path, token) {
  const base = String(
    process.env.WEB_URL || process.env.FRONTEND_URL || "http://localhost:5173",
  ).replace(/\/+$/, "");
  const url = new URL(path, `${base}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

function getTransport() {
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
      ...(user ? { auth: { user, pass } } : {}),
    });
    return localTransport;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SMTP_HOST is required for transactional email");
  }
  if (!localTransport) {
    localTransport = nodemailer.createTransport({ jsonTransport: true });
  }
  return localTransport;
}

async function send(message) {
  await getTransport().sendMail({
    from: process.env.EMAIL_FROM || "PawnLoop <no-reply@localhost>",
    ...message,
  });
}

export function setTransactionalEmailTransportForTests(transport) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test email transport can only be set in tests");
  }
  configureTransactionalEmailTransport(transport);
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
