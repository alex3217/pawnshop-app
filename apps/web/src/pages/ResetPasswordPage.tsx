import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../services/auth";
import PasswordInput from "../components/PasswordInput";
import "../styles/login-page.css";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    const token = params.get("token") || "";
    if (!token) { setError("This reset link is missing its token."); return; }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setMessage("Password updated. Your previous sessions have been signed out.");
      window.history.replaceState({}, "", "/reset-password");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Password reset failed.");
    } finally { setLoading(false); }
  }
  return (
    <section className="login-page"><div className="login-page-inner">
      <div className="login-intro"><span className="login-eyebrow">Account recovery</span><h1 className="login-title">Choose a new password.</h1><p className="login-description">Use 12–128 characters and avoid common placeholder passwords.</p></div>
      <div className="login-card"><h2 className="login-card-title">New password</h2>
        <form className="login-form" onSubmit={submit}>
          <label className="login-label" htmlFor="reset-password">New password</label>
          <PasswordInput id="reset-password" className="login-input" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} visibilityLabel="new password" />
          <label className="login-label" htmlFor="reset-confirm">Confirm password</label>
          <PasswordInput id="reset-confirm" className="login-input" autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={(event) => setConfirm(event.target.value)} visibilityLabel="password confirmation" />
          <button className="login-submit" disabled={loading || Boolean(message)}>{loading ? "Updating…" : "Update password"}</button>
          {message ? <div className="login-success" role="status">{message} <Link className="login-link" to="/login">Sign in</Link></div> : null}
          {error ? <div className="login-error" role="alert">{error}</div> : null}
        </form>
      </div>
    </div></section>
  );
}
