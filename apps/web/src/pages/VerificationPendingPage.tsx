import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { resendVerification } from "../services/auth";
import "../styles/login-page.css";

export default function VerificationPendingPage() {
  const location = useLocation();
  const state = location.state as { email?: string; role?: string } | null;
  const [email, setEmail] = useState(state?.email || "");
  const [message, setMessage] = useState("Check your inbox for a verification link.");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await resendVerification(email);
      setMessage(String(result.message || "If eligible, a verification email will be sent."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to resend verification.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="login-page">
      <div className="login-page-inner">
        <div className="login-intro">
          <span className="login-eyebrow">One more step</span>
          <h1 className="login-title">Verify your email.</h1>
          <p className="login-description">
            {state?.role === "OWNER"
              ? "Owners must verify their email and complete business review before selling."
              : "Verify your email before signing in to PawnLoop."}
          </p>
        </div>
        <div className="login-card">
          <h2 className="login-card-title">Verification pending</h2>
          <p className="login-card-copy" aria-live="polite">{message}</p>
          <form className="login-form" onSubmit={submit}>
            <label className="login-label" htmlFor="pending-email">Email address</label>
            <input id="pending-email" className="login-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            <button className="login-submit" disabled={loading}>{loading ? "Sending…" : "Resend verification"}</button>
            {error ? <div className="login-error" role="alert">{error}</div> : null}
          </form>
          <p><Link className="login-link" to="/login">Back to sign in</Link></p>
        </div>
      </div>
    </section>
  );
}
