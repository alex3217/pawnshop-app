import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { completeMfaLogin, persistAuth } from "../services/auth";
import "../styles/login-page.css";

type ChallengeState = { challenge?: string; expiresInSeconds?: number };

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "";
}

export default function MfaLoginPage() {
  const nav = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const state = (location.state || {}) as ChallengeState;
  const [method, setMethod] = useState<"totp" | "recovery_code">("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const challenge = state.challenge || "";
  const next = safeNext(params.get("next"));

  if (!challenge) return <Navigate to={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(""); setSubmitting(true);
    try {
      const { token, user } = await completeMfaLogin(challenge, method, code);
      persistAuth(token, user.role, user);
      nav(next || (user.role === "SUPER_ADMIN" ? "/super-admin" : user.role === "ADMIN" ? "/admin" : user.role === "OWNER" ? "/owner" : "/auctions"), { replace: true });
    } catch {
      setError("Unable to complete authentication. Check your code and try again.");
    } finally { setSubmitting(false); }
  }

  return <section className="login-page"><div className="login-page-inner">
    <div className="login-intro"><span className="login-eyebrow">Account security</span>
      <h1 className="login-title">Confirm it’s you.</h1>
      <p className="login-description">Enter a code from your authenticator, or use one unused recovery code. This challenge expires in {state.expiresInSeconds || 300} seconds.</p>
    </div>
    <div className="login-card"><h2 className="login-card-title">Multi-factor authentication</h2>
      <form className="login-form" onSubmit={submit}>
        <label className="login-label" htmlFor="mfa-method">Verification method</label>
        <select id="mfa-method" className="login-input" value={method} onChange={(event) => { setMethod(event.target.value as typeof method); setCode(""); }}>
          <option value="totp">Authenticator code</option><option value="recovery_code">Recovery code</option>
        </select>
        <label className="login-label" htmlFor="mfa-code">{method === "totp" ? "6-digit code" : "Recovery code"}</label>
        <input id="mfa-code" className="login-input" value={code} onChange={(event) => setCode(event.target.value)}
          inputMode={method === "totp" ? "numeric" : "text"} autoComplete="one-time-code" required autoFocus />
        <button className="login-submit" disabled={submitting}>{submitting ? "Verifying…" : "Verify and sign in"}</button>
        {error ? <div className="login-error" role="alert">{error}</div> : null}
      </form>
    </div>
  </div></section>;
}
