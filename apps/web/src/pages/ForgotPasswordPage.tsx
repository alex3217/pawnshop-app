import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../services/auth";
import "../styles/login-page.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const result = await forgotPassword(email);
      setMessage(String(result.message || "Check your email for next steps."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally { setLoading(false); }
  }
  return (
    <section className="login-page"><div className="login-page-inner">
      <div className="login-intro"><span className="login-eyebrow">Account recovery</span><h1 className="login-title">Forgot your password?</h1><p className="login-description">Enter your email and we’ll send recovery instructions if the account is eligible.</p></div>
      <div className="login-card"><h2 className="login-card-title">Reset password</h2>
        <form className="login-form" onSubmit={submit}>
          <label className="login-label" htmlFor="forgot-email">Email address</label>
          <input id="forgot-email" className="login-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <button className="login-submit" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</button>
          {message ? <div className="login-success" role="status">{message}</div> : null}
          {error ? <div className="login-error" role="alert">{error}</div> : null}
        </form><p><Link className="login-link" to="/login">Back to sign in</Link></p>
      </div>
    </div></section>
  );
}
