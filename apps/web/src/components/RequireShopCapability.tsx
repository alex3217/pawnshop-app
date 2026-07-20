import {
  useEffect,
  useState,
} from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

import { getAuthToken } from "../services/auth";
import {
  getMyShopAccess,
  type ShopAccessCapabilities,
} from "../services/shopAccess";

type ShopCapability =
  keyof ShopAccessCapabilities;

type RequireShopCapabilityProps = {
  capability: ShopCapability;
};

type AccessState =
  | {
      status: "loading";
      allowed: false;
      error: null;
    }
  | {
      status: "ready";
      allowed: boolean;
      error: null;
    }
  | {
      status: "error";
      allowed: false;
      error: string;
    };

export default function RequireShopCapability({
  capability,
}: RequireShopCapabilityProps) {
  const location = useLocation();
  const token = getAuthToken();

  const [state, setState] =
    useState<AccessState>({
      status: "loading",
      allowed: false,
      error: null,
    });

  useEffect(() => {
    if (!token) {
      setState({
        status: "ready",
        allowed: false,
        error: null,
      });
      return;
    }

    const controller =
      new AbortController();

    setState({
      status: "loading",
      allowed: false,
      error: null,
    });

    void getMyShopAccess(
      controller.signal,
    )
      .then((access) => {
        setState({
          status: "ready",
          allowed:
            access.capabilities[
              capability
            ] === true,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        setState({
          status: "error",
          allowed: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to load shop access.",
        });
      });

    return () => {
      controller.abort();
    };
  }, [capability, token]);

  if (!token) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from:
            location.pathname +
            location.search,
        }}
      />
    );
  }

  if (state.status === "loading") {
    return (
      <div className="page-stack">
        <div className="page-card">
          Loading shop permissions…
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="page-stack">
        <div
          className="alert alert-danger"
          role="alert"
        >
          {state.error}
        </div>
      </div>
    );
  }

  if (!state.allowed) {
    return (
      <div className="page-stack">
        <div
          className="page-card"
          style={{
            display: "grid",
            gap: 12,
          }}
        >
          <h1 style={{ margin: 0 }}>
            Shop access required
          </h1>

          <p
            className="muted"
            style={{ margin: 0 }}
          >
            Your account does not have the
            required permission for this shop
            workspace.
          </p>

          <div>
            <Link
              className="btn"
              to="/marketplace"
            >
              Return to Marketplace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
