// File: apps/web/src/pages/RegisterPage.tsx

import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { persistAuth, register } from "../services/auth";
import type { Role } from "../services/auth";

type PublicRole = Extract<Role, "CONSUMER" | "OWNER">;

function isPublicRole(value: string): value is PublicRole {
  return value === "CONSUMER" || value === "OWNER";
}

function getPostRegisterRoute(role: PublicRole) {
  return role === "OWNER" ? "/owner/shops/new" : "/auctions";
}

export default function RegisterPage() {
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<PublicRole>("CONSUMER");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const trimmedName = name.trim();
      const trimmedEmail = email.trim().toLowerCase();

      if (!trimmedName) {
        throw new Error("Name is required.");
      }

      if (!trimmedEmail) {
        throw new Error("Email is required.");
      }

      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }

      const { token, user } = await register(
        trimmedName,
        trimmedEmail,
        password,
        role
      );

      persistAuth(token, user.role, user);
      nav(getPostRegisterRoute(user.role as PublicRole), { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h3>Register</h3>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          autoComplete="name"
          required
        />

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
          autoComplete="new-password"
          required
          minLength={6}
        />

        <select
          value={role}
          onChange={(e) => {
            const nextRole = e.target.value;
            if (isPublicRole(nextRole)) {
              setRole(nextRole);
            }
          }}
          required
        >
          <option value="CONSUMER">Buyer</option>
          <option value="OWNER">Pawn Shop Owner</option>
        </select>

        <button type="submit" disabled={submitting}>
          {submitting ? "Creating Account..." : "Create Account"}
        </button>

        {error ? <div style={{ color: "crimson" }}>{error}</div> : null}
      </form>
    </div>
  );
}