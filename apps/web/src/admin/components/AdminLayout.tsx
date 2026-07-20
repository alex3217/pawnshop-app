import { useLayoutEffect } from "react";
import { Outlet } from "react-router-dom";
import Breadcrumbs from "../../components/Breadcrumbs";
import PageBackButton from "../../components/PageBackButton";
import ScrollToTopButton from "../../components/ScrollToTopButton";
import { logout } from "../../services/auth";
import AdminSidebar from "./AdminSidebar";

export default function AdminLayout() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");

    /*
     * Admin and Super Admin are dedicated operational workspaces.
     * Keep them consistently dark regardless of the public-site theme.
     */
    root.setAttribute("data-theme", "dark");

    return () => {
      if (previousTheme) {
        root.setAttribute("data-theme", previousTheme);
      } else {
        root.removeAttribute("data-theme");
      }
    };
  }, []);

  return (
    <div className="admin-layout" style={{ minHeight: "100vh", background: "#0b1020", color: "#eef2ff" }}>
      <div
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "24px 20px 40px",
          display: "grid",
          gap: 20,
        }}
      >
        <div
          className="page-card admin-layout__header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div>
            <div className="section-title">PawnLoop Marketplace Admin</div>
            <div className="section-subtitle">
              Configure, moderate, and monitor the platform.
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              logout();
              window.location.href = "/login";
            }}
          >
            Logout
          </button>
        </div>

        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          <AdminSidebar />

          <main style={{ flex: 1, minWidth: 0, display: "grid", gap: 16 }}>
            <Breadcrumbs />
            <PageBackButton />
            <Outlet />
          </main>
        </div>
      </div>
      <ScrollToTopButton />
    </div>
  );
}
