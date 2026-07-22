export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const PLACEHOLDER_PASSWORDS = new Set([
  "password",
  "password123",
  "password123!",
  "changeme",
  "changeme123",
  "temporarypassword",
  "testpassword",
  "admin123!",
  "owner123!",
  "buyer123!",
  "superadmin123!",
  "admin123",
]);

const MESSAGES = Object.freeze({
  PASSWORD_TOO_SHORT: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  PASSWORD_TOO_LONG: `Password must be no more than ${PASSWORD_MAX_LENGTH} characters.`,
  PASSWORD_PLACEHOLDER: "Choose a password that is not a common test or placeholder value.",
  PASSWORD_EMAIL_DERIVED: "Password must not contain your complete email address.",
});

export class PasswordPolicyError extends Error {
  constructor(code) {
    super(MESSAGES[code] || "Password does not meet the password policy.");
    this.name = "PasswordPolicyError";
    this.code = code;
    this.statusCode = 400;
  }
}

export function normalizeEmailForPasswordPolicy(email) {
  return String(email ?? "").trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

export function validatePassword(password, { email } = {}) {
  const value = typeof password === "string" ? password : "";

  // Normalize only for comparisons. Length checks and the returned password
  // always use the exact input so leading/trailing whitespace is meaningful.
  const normalizedPassword = value.normalize("NFKC").toLocaleLowerCase("en-US");
  if (PLACEHOLDER_PASSWORDS.has(normalizedPassword.trim())) {
    throw new PasswordPolicyError("PASSWORD_PLACEHOLDER");
  }

  if (value.length < PASSWORD_MIN_LENGTH) {
    throw new PasswordPolicyError("PASSWORD_TOO_SHORT");
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    throw new PasswordPolicyError("PASSWORD_TOO_LONG");
  }

  const normalizedEmail = normalizeEmailForPasswordPolicy(email);
  if (normalizedEmail && normalizedPassword.includes(normalizedEmail)) {
    throw new PasswordPolicyError("PASSWORD_EMAIL_DERIVED");
  }

  return value;
}
