import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmail } from "../services/auth";
import "../styles/login-page.css";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const attempted = useRef(false);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    const token = params.get("token") || "";
    if (!token) {
      setStatus("error");
      setMessage("This verification link is missing its token.");
      return;
    }
    verifyEmail(token)
      .then(() => {
        setStatus("success");
        setMessage("Your email is verified. You can now sign in.");
        window.history.replaceState({}, "", "/verify-email");
      })
      .catch((cause) => {
        setStatus("error");
        setMessage(cause instanceof Error ? cause.message : "Verification failed.");
        window.history.replaceState({}, "", "/verify-email");
      });
  }, [params]);

  return (
    <section className="login-page"><div className="login-page-inner">
      <div className="login-intro"><span className="login-eyebrow">Account security</span><h1 className="login-title">Email verification</h1></div>
      <div className="login-card">
        <h2 className="login-card-title">{status === "success" ? "Verified" : status === "error" ? "Link unavailable" : "Please wait"}</h2>
        <div className={status === "error" ? "login-error" : status === "success" ? "login-success" : "login-card-copy"} role="status" aria-live="polite">{message}</div>
        <p><Link className="login-link" to={status === "success" ? "/login" : "/verification-pending"}>{status === "success" ? "Sign in" : "Request a new link"}</Link></p>
      </div>
    </div></section>
  );
}
