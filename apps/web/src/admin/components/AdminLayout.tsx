import { useLayoutEffect } from "react";
import { Outlet } from "react-router-dom";

import Breadcrumbs from "../../components/Breadcrumbs";
import PageBackButton from "../../components/PageBackButton";
import ScrollToTopButton from "../../components/ScrollToTopButton";
import { logout } from "../../services/auth";
import AdminSidebar from "./AdminSidebar";
import "./AdminLayout.css";

export default function AdminLayout() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousTheme =
      root.getAttribute("data-theme");

    /*
     * Admin and Super Admin are dedicated
     * operational workspaces and remain dark.
     */
    root.setAttribute("data-theme", "dark");

    return () => {
      if (previousTheme) {
        root.setAttribute(
          "data-theme",
          previousTheme,
        );
      } else {
        root.removeAttribute("data-theme");
      }
    };
  }, []);

  return (
    <div className="admin-layout">
      <div className="admin-layout__container">
        <header className="page-card admin-layout__header">
          <div>
            <div className="section-title">
              PawnLoop Marketplace Admin
            </div>

            <div className="section-subtitle">
              Configure, moderate, and monitor the
              platform.
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
        </header>

        <div className="admin-layout__body">
          <AdminSidebar />

          <main className="admin-layout__main">
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
