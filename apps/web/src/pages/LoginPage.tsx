import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { login, persistAuth } from "../services/auth";
import "../styles/login-page.css";

export default function LoginPage() {
  const nav = useNavigate();
  const showDevelopmentCredentials = import.meta.env.DEV;

  const [email, setEmail] = useState(
    showDevelopmentCredentials ? "buyer@pawn.local" : "",
  );
  const [password, setPassword] = useState(
    showDevelopmentCredentials ? "Buyer123!" : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { token, user } = await login(email, password);

      persistAuth(token, user.role, user);

      if (user.role === "SUPER_ADMIN") {
        nav("/super-admin");
      } else if (user.role === "ADMIN") {
        nav("/admin");
      } else if (user.role === "OWNER") {
        nav("/owner");
      } else {
        nav("/auctions");
      }
    } catch (loginError: unknown) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Login failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="login-page">
      <div className="login-page-inner">
        <div className="login-intro">
          <span className="login-eyebrow">
            Secure account access
          </span>

          <h1 className="login-title">
            Welcome back to PawnLoop.
          </h1>

          <p className="login-description">
            Sign in to manage listings, offers, auctions,
            saved items, shop operations, and account activity.
          </p>
        </div>

        <div className="login-card">
          <h2 className="login-card-title">Sign in</h2>

          <p className="login-card-copy">
            Enter the email address and password connected to
            your PawnLoop account.
          </p>

          <form className="login-form" onSubmit={onSubmit}>
            <div className="login-field">
              <label className="login-label" htmlFor="login-email">
                Email address
              </label>

              <input
                id="login-email"
                className="login-input"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                required
                autoFocus
              />
            </div>

            <div className="login-field">
              <label
                className="login-label"
                htmlFor="login-password"
              >
                Password
              </label>

              <input
                id="login-password"
                className="login-input"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="Enter your password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              className="login-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>

            {error ? (
              <div
                className="login-error"
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            ) : null}
          </form>

          {showDevelopmentCredentials ? (
            <p className="login-dev-credentials">
              Development accounts: buyer@pawn.local /
              Buyer123! — owner1@pawn.local / Owner123!
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
