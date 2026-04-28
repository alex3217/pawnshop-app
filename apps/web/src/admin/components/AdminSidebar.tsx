import { NavLink, useLocation } from "react-router-dom";
import { ADMIN_ROUTES } from "../config/routes";
import {
  getAdminViewerContext,
  hasAdminPermissions,
  isSuperAdminRole,
} from "../config/permissions";
import type { AdminRouteConfig } from "../types/admin";

function navClass(isActive: boolean) {
  return `admin-sidebar__link${isActive ? " admin-sidebar__link--active" : ""}`;
}

function isSuperAdminRoute(path: string) {
  return path === "/super-admin" || path.startsWith("/super-admin/");
}

function isAdminRoute(path: string) {
  return path === "/admin" || path.startsWith("/admin/");
}

export default function AdminSidebar() {
  const location = useLocation();
  const context = getAdminViewerContext();

  const isSuperAdminViewer = isSuperAdminRole(context.role);
  const isInSuperAdminArea = location.pathname.startsWith("/super-admin");

  const visibleItems = ADMIN_ROUTES.filter((item: AdminRouteConfig) => {
    if (item.enabled === false) return false;

    if (isInSuperAdminArea) {
      if (!isSuperAdminViewer) return false;
      if (!isSuperAdminRoute(item.path)) return false;
    } else if (!isAdminRoute(item.path)) {
      return false;
    }

    return hasAdminPermissions(context, item.permissions);
  });

  return (
    <aside
      className="admin-sidebar"
      style={{
        display: "grid",
        gap: 12,
        alignContent: "start",
        position: "sticky",
        top: 16,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: 0.72,
        }}
      >
        {isInSuperAdminArea ? "Super Admin Workspace" : "Admin Workspace"}
      </div>

      <nav
        aria-label={isInSuperAdminArea ? "Super admin navigation" : "Admin navigation"}
        style={{
          display: "grid",
          gap: 8,
        }}
      >
        {visibleItems.map((item: AdminRouteConfig) => (
          <NavLink
            key={item.key}
            to={item.path}
            end={item.path === "/admin" || item.path === "/super-admin"}
            className={({ isActive }) => navClass(isActive)}
            style={({ isActive }) => ({
              textDecoration: "none",
              color: "#eef2ff",
              border: "1px solid rgba(255,255,255,0.1)",
              background: isActive
                ? "rgba(99,102,241,0.18)"
                : "rgba(255,255,255,0.04)",
              borderRadius: 12,
              padding: "10px 12px",
              fontWeight: 700,
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}