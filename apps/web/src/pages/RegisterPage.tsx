// File: apps/web/src/pages/RegisterPage.tsx

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { register } from "../services/auth";
import type { Role } from "../services/auth";
import PasswordInput from "../components/PasswordInput";
import "../styles/register-page.css";
import { DEFAULT_FOUNDING_SHOP_PROGRAM, getFoundingShopProgramSettings } from "../services/foundingShopProgram";

type PublicRole = Extract<Role, "CONSUMER" | "OWNER">;

function isPublicRole(value: string): value is PublicRole {
  return value === "CONSUMER" || value === "OWNER";
}

export default function RegisterPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [role, setRole] = useState<PublicRole>(
    searchParams.get("role")?.toLowerCase() === "owner"
      ? "OWNER"
      : "CONSUMER",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [foundingProgram, setFoundingProgram] = useState(DEFAULT_FOUNDING_SHOP_PROGRAM);

  useEffect(() => {
    let mounted = true;

    getFoundingShopProgramSettings()
      .then((program) => {
        if (mounted) setFoundingProgram(program);
      })
      .catch(() => {
        if (mounted) setFoundingProgram(DEFAULT_FOUNDING_SHOP_PROGRAM);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (submitting) return;

    setError(null);

    if (!acceptedLegal) {
      setError(
        "You must accept the Terms of Service and Privacy Policy.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const trimmedName = name.trim();
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedInviteToken = inviteToken.trim();

      if (!trimmedName) {
        throw new Error("Name is required.");
      }

      if (!trimmedEmail) {
        throw new Error("Email is required.");
      }

      if (password.length < 12) {
        throw new Error("Password must be at least 12 characters.");
      }

      if (password.length > 128) {
        throw new Error("Password must be no more than 128 characters.");
      }

      if (!confirmPassword) {
        throw new Error("Please confirm your password.");
      }

      if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      const normalizedPassword = password.normalize("NFKC").toLocaleLowerCase("en-US");
      const placeholderPasswords = new Set([
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

      if (placeholderPasswords.has(normalizedPassword.trim())) {
        throw new Error("Choose a password that is not a common test or placeholder value.");
      }

      const normalizedEmail = trimmedEmail.normalize("NFKC").toLocaleLowerCase("en-US");
      if (normalizedPassword.includes(normalizedEmail)) {
        throw new Error("Password must not contain your complete email address.");
      }

      const result = await register(
        trimmedName,
        trimmedEmail,
        password,
        role,
        acceptedLegal,
        trimmedInviteToken,
      );

      nav("/verification-pending", {
        replace: true,
        state: {
          email: trimmedEmail,
          role,
          emailDelivery: result.emailDelivery,
          message: result.message,
        },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="register-page">
      <div className="register-page-inner">
        <div className="register-intro">
          <span className="register-eyebrow">
            Join the PawnLoop marketplace
          </span>

          <h1 className="register-title">
            Create your PawnLoop account.
          </h1>

          <p className="register-description">
            Register as a buyer or pawn shop owner and gain access
            to listings, auctions, offers, item intake, and
            shop-management tools.
          </p>

          <ul className="register-benefits">
            <li>Buy, sell, pawn, and track items securely.</li>
            <li>Save searches, offers, bids, and watchlists.</li>
            <li>Access dedicated buyer and shop-owner tools.</li>
          </ul>
        </div>

        <div className="register-card">
          <h2 className="register-card-title">Create account</h2>

          <p className="register-card-copy">
            Enter your information and choose how you will use
            PawnLoop.
          </p>

          <form className="register-form" onSubmit={onSubmit}>
            <div className="register-field">
              <label
                className="register-label"
                htmlFor="register-invite-token"
              >
                Invitation code
              </label>

              <input
                id="register-invite-token"
                className="register-input"
                value={inviteToken}
                onChange={(event) => setInviteToken(event.target.value)}
                placeholder="Enter your invitation code"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              <small>
                Use the private code supplied with your beta invitation.
              </small>
            </div>

            <div className="register-field">
              <label
                className="register-label"
                htmlFor="register-name"
              >
                Full name
              </label>

              <input
                id="register-name"
                className="register-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your full name"
                autoComplete="name"
                required
                autoFocus
              />
            </div>

            <div className="register-field">
              <label
                className="register-label"
                htmlFor="register-email"
              >
                Email address
              </label>

              <input
                id="register-email"
                className="register-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                required
              />
            </div>

            <div className="register-field">
              <label
                className="register-label"
                htmlFor="register-password"
              >
                Password
              </label>

              <PasswordInput
                id="register-password"
                className="register-input"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="12–128 characters"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                visibilityLabel="password"
              />
              <small>
                Use 12–128 characters. Common test or placeholder passwords are rejected, and the complete email address cannot appear in the password.
              </small>
            </div>

            <div className="register-field">
              <label
                className="register-label"
                htmlFor="register-confirm-password"
              >
                Confirm password
              </label>

              <PasswordInput
                id="register-confirm-password"
                className="register-input"
                value={confirmPassword}
                onChange={(event) => {
                  const nextConfirmPassword = event.target.value;
                  setConfirmPassword(nextConfirmPassword);

                  if (
                    error === "Passwords do not match." &&
                    nextConfirmPassword === password
                  ) {
                    setError(null);
                  }
                }}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                visibilityLabel="password confirmation"
                aria-invalid={
                  confirmPassword.length > 0 &&
                  password !== confirmPassword
                }
                aria-describedby={
                  confirmPassword.length > 0 &&
                  password !== confirmPassword
                    ? "register-confirm-password-error"
                    : undefined
                }
              />

              {confirmPassword.length > 0 &&
              password !== confirmPassword ? (
                <small
                  id="register-confirm-password-error"
                  className="register-field-error"
                  role="alert"
                >
                  Passwords do not match.
                </small>
              ) : null}
            </div>

            <div className="register-field">
              <label
                className="register-label"
                htmlFor="register-role"
              >
                Account type
              </label>

              <select
                id="register-role"
                className="register-select"
                value={role}
                onChange={(event) => {
                  const nextRole = event.target.value;

                  if (isPublicRole(nextRole)) {
                    setRole(nextRole);
                  }
                }}
                required
              >
                <option value="CONSUMER">
                  Buyer / Customer
                </option>
                <option value="OWNER">
                  Pawn Shop Owner
                </option>
              </select>
            </div>

            {role === "OWNER" && foundingProgram.enabled ? (
              <div className="register-owner-program">
                <strong>{foundingProgram.headline}</strong>

                <p>{foundingProgram.subtitle}</p>

                <ul>
                  <li>
                    {foundingProgram.trialDays} days free for
                    registered pawn shops.
                  </li>
                  <li>
                    Guided onboarding and help listing your shop’s first{" "}
                    {foundingProgram.freeUploadCount} inventory items.
                  </li>
                  <li>
                    Trial starts after your profile is complete
                    and {foundingProgram.minimumLiveItems} items
                    are live.
                  </li>
                  <li>
                    Plans start at $
                    {foundingProgram.starterMonthlyPrice}/month
                    after the trial.
                  </li>
                </ul>
              </div>
            ) : null}

            <div className="register-consent">
              <input
                id="register-legal-consent"
                type="checkbox"
                checked={acceptedLegal}
                onChange={(event) => {
                  setAcceptedLegal(event.target.checked);

                  if (
                    event.target.checked &&
                    error ===
                      "You must accept the Terms of Service and Privacy Policy."
                  ) {
                    setError(null);
                  }
                }}
                required
              />

              <label htmlFor="register-legal-consent">
                I agree to the{" "}
                <Link to="/terms">Terms of Service</Link> and{" "}
                <Link to="/privacy">Privacy Policy</Link>.
              </label>
            </div>

            <button
              className="register-submit"
              type="submit"
              disabled={
                submitting ||
                (confirmPassword.length > 0 &&
                  password !== confirmPassword)
              }
            >
              {submitting
                ? "Creating account…"
                : "Create account"}
            </button>

            {error ? (
              <div
                className="register-error"
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            ) : null}
          </form>

          <p className="register-login-link">
            Already have an account?{" "}
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
