import { useEffect, useState } from "react";
import { Link, Navigate, Outlet } from "react-router-dom";
import {
  getAuthRole,
  getAuthToken,
  getCurrentUser,
  type AuthUser,
} from "../services/auth";

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase();
}

export default function RequireApprovedOwner() {
  const token = getAuthToken();
  const role = getAuthRole();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || role !== "OWNER") return;

    const controller = new AbortController();
    getCurrentUser(controller.signal)
      .then(setUser)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to verify owner application status.",
        );
      });
    return () => controller.abort();
  }, [role, token]);

  if (!token || !role) {
    return <Navigate to="/login" replace />;
  }

  if (role === "ADMIN") {
    return <Outlet />;
  }

  if (role !== "OWNER") {
    return <Navigate to="/" replace />;
  }

  if (error) {
    return (
      <section className="page-card" role="alert">
        <h1>We could not verify your owner access</h1>
        <p>{error}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </section>
    );
  }

  if (!user) {
    return <p className="muted" aria-live="polite">Verifying owner application status…</p>;
  }

  const application = user.ownerApplication;
  if (application?.status === "APPROVED") {
    return <Outlet />;
  }

  return (
    <section className="page-card">
      <h1>Owner application {application ? statusLabel(application.status) : "required"}</h1>
      {application?.decisionReason ? <p>{application.decisionReason}</p> : null}
      <p>
        Shop onboarding and dashboard access become available after your
        owner application is approved.
      </p>
      <Link className="btn btn-secondary" to="/for-pawn-shops">
        Review the owner program
      </Link>
    </section>
  );
}
