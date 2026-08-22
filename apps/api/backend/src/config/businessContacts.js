export const BUSINESS_CONTACT_EMAILS = Object.freeze({
  support: "support@pawnloop.com",
  legal: "legal@pawnloop.com",
  security: "security@pawnloop.com",
});

export const DEFAULT_TRANSACTIONAL_REPLY_TO = BUSINESS_CONTACT_EMAILS.support;

const SINGLE_EMAIL_ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function resolveTransactionalReplyTo(value) {
  const rawReplyTo = String(value ?? "");
  const replyTo = rawReplyTo.trim();
  if (!replyTo) return DEFAULT_TRANSACTIONAL_REPLY_TO;
  const [localPart = ""] = replyTo.split("@");
  if (
    /[\r\n,]/.test(rawReplyTo) ||
    replyTo.length > 254 ||
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !SINGLE_EMAIL_ADDRESS.test(replyTo)
  ) {
    throw Object.assign(new Error("EMAIL_REPLY_TO must be one valid email address"), {
      name: "EmailConfigurationError",
      code: "EMAIL_PROVIDER_CONFIGURATION_ERROR",
    });
  }
  return replyTo;
}
