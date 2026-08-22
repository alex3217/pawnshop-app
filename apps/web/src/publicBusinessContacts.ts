export const PUBLIC_BUSINESS_CONTACTS = {
  support: "support@pawnloop.com",
  legal: "legal@pawnloop.com",
  security: "security@pawnloop.com",
} as const;

export const PUBLIC_SUPPORT_EMAIL = PUBLIC_BUSINESS_CONTACTS.support;
export const PUBLIC_LEGAL_EMAIL = PUBLIC_BUSINESS_CONTACTS.legal;
export const PUBLIC_SECURITY_EMAIL = PUBLIC_BUSINESS_CONTACTS.security;

export const PUBLIC_SUPPORT_MAILTO = `mailto:${PUBLIC_SUPPORT_EMAIL}`;
export const PUBLIC_LEGAL_MAILTO = `mailto:${PUBLIC_LEGAL_EMAIL}`;
export const PUBLIC_SECURITY_MAILTO = `mailto:${PUBLIC_SECURITY_EMAIL}`;
