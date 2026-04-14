// File: apps/web/src/pages/LoginPage.tsx

import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login, persistAuth } from "../services/auth";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("buyer@pawn.local");
  const [password, setPassword] = useState("Buyer123!");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { token, user } = await login(email, password);
      persistAuth(token, user.role);
      nav("/auctions");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h3>Login</h3>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          autoComplete="email"
          required
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete="current-password"
          required
        />

        <button type="submit" disabled={submitting}>
          {submitting ? "Logging In..." : "Login"}
        </button>

        {error ? <div style={{ color: "crimson" }}>{error}</div> : null}
      </form>

      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 12 }}>
        Buyer test: buyer@pawn.local / Buyer123! — Owner test: owner1@pawn.local / Owner123! —
        Admin test: admin1@example.com / Admin123
      </p>
    </div>
  );
}