// File: apps/web/src/components/RequireRole.tsx

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getAuthRole, getAuthToken } from "../services/auth";
import type { Role } from "../services/auth";

type RequireRoleProps = {
  allowed: Role[];
};

export default function RequireRole({ allowed }: RequireRoleProps) {
  const location = useLocation();
  const token = getAuthToken();
  const role = getAuthRole();

  if (!token || !role) {
    const next = location.pathname + location.search;
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(next)}`}
        replace
      />
    );
  }

  if (!allowed.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
