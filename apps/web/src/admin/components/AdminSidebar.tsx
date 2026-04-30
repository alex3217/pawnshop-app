import { NavLink, useLocation } from "react-router-dom";
import { ADMIN_ROUTES } from "../config/routes";
import {
  getAdminViewerContext,
  hasAdminPermissions,
  isSuperAdminRole,
} from "../config/permissions";
import type { AdminRouteConfig } from "../types/admin";

type SidebarGroup = {
  title: string;
  description: string;
  groups: string[];
};

const ADMIN_GROUPS: SidebarGroup[] = [
  {
    title: "Command Center",
    description: "Core admin overview",
    groups: ["admin-core"],
  },
  {
    title: "Marketplace Operations",
    description: "Inventory, auctions, offers",
    groups: ["admin-operations"],
  },
  {
    title: "Growth & Billing",
    description: "Plans, revenue, analytics",
    groups: ["admin-growth"],
  },
  {
    title: "System",
    description: "Risk, audit, settings",
    groups: ["admin-system"],
  },
];

const SUPER_ADMIN_GROUPS: SidebarGroup[] = [
  {
    title: "Command Center",
    description: "Platform-wide overview and access",
    groups: ["super-admin-core"],
  },
  {
    title: "Marketplace Control",
    description: "Shops, listings, and marketplace activity",
    groups: ["super-admin-marketplace"],
  },
  {
    title: "Plans & Billing",
    description: "Plans, subscriptions, settlements, revenue",
    groups: ["super-admin-billing"],
  },
  {
    title: "Governance",
    description: "Audit logs and platform settings",
    groups: ["super-admin-governance"],
  },
];

function navClass(isActive: boolean) {
  return `admin-sidebar__link${isActive ? " admin-sidebar__link--active" : ""}`;
}

function isSuperAdminRoute(path: string) {
  return path === "/super-admin" || path.startsWith("/super-admin/");
}

function isAdminRoute(path: string) {
  return path === "/admin" || path.startsWith("/admin/");
}

function isRouteActive(routePath: string, pathname: string) {
  if (routePath === "/admin" || routePath === "/super-admin") {
    return pathname === routePath;
  }

  return pathname === routePath || pathname.startsWith(`${routePath}/`);
}

function routeMatchesGroup(item: AdminRouteConfig, group: SidebarGroup) {
  return group.groups.includes(String(item.group || ""));
}

function routeSort(a: AdminRouteConfig, b: AdminRouteConfig) {
  return String(a.label).localeCompare(String(b.label));
}

function SidebarLink({
  item,
  pathname,
}: {
  item: AdminRouteConfig;
  pathname: string;
}) {
  const isActive = isRouteActive(item.path, pathname);

  return (
    <NavLink
      key={item.key}
      to={item.path}
      end={item.path === "/admin" || item.path === "/super-admin"}
      className={({ isActive: navIsActive }) => navClass(navIsActive || isActive)}
      style={{
        textDecoration: "none",
        color: isActive ? "#ffffff" : "#dbeafe",
        border: isActive
          ? "1px solid rgba(129, 140, 248, 0.72)"
          : "1px solid rgba(255,255,255,0.1)",
        background: isActive
          ? "rgba(99,102,241,0.24)"
          : "rgba(255,255,255,0.045)",
        borderRadius: 12,
        padding: "10px 12px",
        fontWeight: 800,
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        alignItems: "center",
        boxShadow: isActive ? "0 10px 24px rgba(79,70,229,0.18)" : "none",
      }}
    >
      <span>{item.label}</span>

      {item.comingSoon ? (
        <span
          style={{
            fontSize: 10,
            color: "#fef3c7",
            background: "rgba(245,158,11,0.16)",
            border: "1px solid rgba(245,158,11,0.24)",
            borderRadius: 999,
            padding: "2px 7px",
            whiteSpace: "nowrap",
          }}
        >
          Soon
        </span>
      ) : null}
    </NavLink>
  );
}

export default function AdminSidebar() {
  const location = useLocation();
  const context = getAdminViewerContext();

  const isSuperAdminViewer = isSuperAdminRole(context.role);
  const isInSuperAdminArea = location.pathname.startsWith("/super-admin");
  const groups = isInSuperAdminArea ? SUPER_ADMIN_GROUPS : ADMIN_GROUPS;

  const visibleItems = ADMIN_ROUTES.filter((item: AdminRouteConfig) => {
    if (item.enabled === false) return false;

    if (isInSuperAdminArea) {
      if (!isSuperAdminViewer) return false;
      if (!isSuperAdminRoute(item.path)) return false;
    } else if (!isAdminRoute(item.path) || isSuperAdminRoute(item.path)) {
      return false;
    }

    return hasAdminPermissions(context, item.permissions);
  });

  const groupedKeys = new Set<string>();

  return (
    <aside
      className="admin-sidebar"
      style={{
        display: "grid",
        gap: 14,
        alignContent: "start",
        position: "sticky",
        top: 16,
        width: 292,
        minWidth: 292,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        paddingRight: 4,
      }}
    >
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.1)",
          background:
            "linear-gradient(180deg, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.86))",
          borderRadius: 18,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#818cf8",
          }}
        >
          {isInSuperAdminArea ? "Super Admin" : "Admin"}
        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: 18,
            fontWeight: 900,
            color: "#f8fafc",
          }}
        >
          {isInSuperAdminArea ? "Platform Control" : "Admin Workspace"}
        </div>

        <div
          style={{
            marginTop: 6,
            color: "#94a3b8",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {isInSuperAdminArea
            ? "Control users, shops, plans, billing, settings, and oversight from one place."
            : "Manage marketplace users, shops, inventory, and operations."}
        </div>
      </div>

      {groups.map((group) => {
        const routes = visibleItems
          .filter((item) => routeMatchesGroup(item, group))
          .sort(routeSort);

        if (!routes.length) return null;

        routes.forEach((route) => groupedKeys.add(String(route.key)));

        return (
          <section
            key={group.title}
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(2, 6, 23, 0.44)",
              borderRadius: 18,
              padding: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ padding: "2px 4px" }}>
              <div style={{ color: "#e2e8f0", fontWeight: 900, fontSize: 13 }}>
                {group.title}
              </div>
              <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
                {group.description}
              </div>
            </div>

            <nav
              aria-label={`${group.title} navigation`}
              style={{
                display: "grid",
                gap: 8,
              }}
            >
              {routes.map((item) => (
                <SidebarLink
                  key={item.key}
                  item={item}
                  pathname={location.pathname}
                />
              ))}
            </nav>
          </section>
        );
      })}

      {visibleItems.some((item) => !groupedKeys.has(String(item.key))) ? (
        <section
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(2, 6, 23, 0.44)",
            borderRadius: 18,
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ padding: "2px 4px" }}>
            <div style={{ color: "#e2e8f0", fontWeight: 900, fontSize: 13 }}>
              Other Tools
            </div>
            <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
              Additional pages
            </div>
          </div>

          <nav aria-label="Other admin navigation" style={{ display: "grid", gap: 8 }}>
            {visibleItems
              .filter((item) => !groupedKeys.has(String(item.key)))
              .sort(routeSort)
              .map((item) => (
                <SidebarLink
                  key={item.key}
                  item={item}
                  pathname={location.pathname}
                />
              ))}
          </nav>
        </section>
      ) : null}
    </aside>
  );
}
