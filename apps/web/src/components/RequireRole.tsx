// File: apps/web/src/components/RequireRole.tsx

import { Navigate, Outlet } from "react-router-dom";
import { getAuthRole } from "../services/auth";
import type { Role } from "../services/auth";

type RequireRoleProps = {
  allowed: Role[];
};

export default function RequireRole({ allowed }: RequireRoleProps) {
  const role = getAuthRole();

  if (!role) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}