// File: apps/web/src/App.tsx

import {
  Suspense,
  lazy,
  type ComponentType,
  type ReactNode,
} from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import RequireRole from "./components/RequireRole";
import SiteLayout from "./components/SiteLayout";
import type { Role } from "./services/auth";

type RouteConfig =
  | {
      index: true;
      element: ReactNode;
      path?: never;
    }
  | {
      path: string;
      element: ReactNode;
      index?: false;
    };

const ADMIN_ROLES: Role[] = ["ADMIN"];
const OWNER_ROLES: Role[] = ["OWNER", "ADMIN"];
const CONSUMER_ROLES: Role[] = ["CONSUMER", "ADMIN"];

function isComponentExport(value: unknown): value is ComponentType<unknown> {
  return typeof value === "function";
}

function lazyPage<TModule extends Record<string, unknown>>(
  loader: () => Promise<TModule>,
) {
  return lazy(async () => {
    const mod = await loader();

    const defaultExport = (mod as { default?: unknown }).default;
    if (isComponentExport(defaultExport)) {
      return { default: defaultExport };
    }

    const preferredNamedExport = Object.entries(mod)
      .filter(([key, value]) => key !== "default" && isComponentExport(value))
      .sort(([a], [b]) => {
        const aIsPascal = /^[A-Z]/.test(a);
        const bIsPascal = /^[A-Z]/.test(b);

        if (aIsPascal && !bIsPascal) return -1;
        if (!aIsPascal && bIsPascal) return 1;
        return a.localeCompare(b);
      })[0]?.[1];

    if (preferredNamedExport && isComponentExport(preferredNamedExport)) {
      return { default: preferredNamedExport };
    }

    throw new Error("No React component export found in lazy-loaded module.");
  });
}

const AdminLayout = lazyPage(() => import("./admin/components/AdminLayout"));

const AdminAuctionsPage = lazyPage(() =>
  import("./admin/pages/AdminAuctionsPage"),
);
const AdminOffersPage = lazyPage(() => import("./admin/pages/AdminOffersPage"));
const AdminOverviewPage = lazyPage(() =>
  import("./admin/pages/AdminOverviewPage"),
);
const AdminOwnersPage = lazyPage(() => import("./admin/pages/AdminOwnersPage"));
const AdminShopsPage = lazyPage(() => import("./admin/pages/AdminShopsPage"));
const AdminSubscriptionsPage = lazyPage(() =>
  import("./admin/pages/AdminSubscriptionsPage"),
);

const AdminItemsPage = lazyPage(() => import("./pages/AdminItemsPage"));
const AdminUsersPage = lazyPage(() => import("./pages/AdminUsersPage"));
const AuctionDetailPage = lazyPage(() => import("./pages/AuctionDetailPage"));
const AuctionsPage = lazyPage(() => import("./pages/AuctionsPage"));
const BulkUploadPage = lazyPage(() => import("./pages/BulkUploadPage"));
const CreateAuctionPage = lazyPage(() => import("./pages/CreateAuctionPage"));
const CreateItemPage = lazyPage(() => import("./pages/CreateItemPage"));
const CreateShopPage = lazyPage(() => import("./pages/CreateShopPage"));
const HomePage = lazyPage(() => import("./pages/HomePage"));
const ItemDetailPage = lazyPage(() => import("./pages/ItemDetailPage"));
const LoginPage = lazyPage(() => import("./pages/LoginPage"));
const MarketplacePage = lazyPage(() => import("./pages/MarketplacePage"));
const MyBidsPage = lazyPage(() => import("./pages/MyBidsPage"));
const MyWinsPage = lazyPage(() => import("./pages/MyWinsPage"));
const OffersPage = lazyPage(() => import("./pages/OffersPage"));
const OwnerAuctionsPage = lazyPage(() => import("./pages/OwnerAuctionsPage"));
const OwnerDashboardPage = lazyPage(() =>
  import("./pages/OwnerDashboardPage"),
);
const OwnerInventoryPage = lazyPage(() => import("./pages/OwnerInventoryPage"));
const OwnerLocationsPage = lazyPage(() => import("./pages/OwnerLocationsPage"));
const OwnerStaffPage = lazyPage(() => import("./pages/OwnerStaffPage"));
const OwnerSubscriptionPage = lazyPage(() =>
  import("./pages/OwnerSubscriptionPage"),
);
const RegisterPage = lazyPage(() => import("./pages/RegisterPage"));
const SavedSearchesPage = lazyPage(() => import("./pages/SavedSearchesPage"));
const ScanConsolePage = lazyPage(() => import("./pages/ScanConsolePage"));
const ShopDetailPage = lazyPage(() => import("./pages/ShopDetailPage"));
const ShopsPage = lazyPage(() => import("./pages/ShopsPage"));
const WatchlistPage = lazyPage(() => import("./pages/WatchlistPage"));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <div className="text-center">
        <div className="text-sm text-muted-foreground">Loading page...</div>
      </div>
    </div>
  );
}

function FeaturePlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="rounded-2xl border bg-background p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function placeholderRoute(title: string, description: string): ReactNode {
  return <FeaturePlaceholderPage title={title} description={description} />;
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

function renderRoute(config: RouteConfig, key: string) {
  if ("index" in config && config.index) {
    return <Route key={key} index element={withSuspense(config.element)} />;
  }

  return (
    <Route
      key={key}
      path={config.path}
      element={withSuspense(config.element)}
    />
  );
}

function renderRouteGroup(
  routes: RouteConfig[],
  keyPrefix: string,
  allowedRoles?: Role[],
) {
  const children = routes.map((route, index) =>
    renderRoute(
      route,
      `${keyPrefix}-${"path" in route ? route.path : `index-${index}`}`,
    ),
  );

  if (!allowedRoles) return children;

  return (
    <Route
      key={`${keyPrefix}-guard`}
      element={<RequireRole allowed={allowedRoles} />}
    >
      {children}
    </Route>
  );
}

const publicRoutes: RouteConfig[] = [
  { index: true, element: <HomePage /> },
  { path: "/marketplace", element: <MarketplacePage /> },
  { path: "/shops", element: <ShopsPage /> },
  { path: "/shops/:id", element: <ShopDetailPage /> },
  { path: "/items/:id", element: <ItemDetailPage /> },
  { path: "/auctions", element: <AuctionsPage /> },
  { path: "/auctions/:id", element: <AuctionDetailPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
];

const consumerRoutes: RouteConfig[] = [
  { path: "/my-bids", element: <MyBidsPage /> },
  { path: "/bids", element: <Navigate to="/my-bids" replace /> },
  { path: "/my-wins", element: <MyWinsPage /> },
  { path: "/watchlist", element: <WatchlistPage /> },
  { path: "/saved-searches", element: <SavedSearchesPage /> },
  { path: "/offers", element: <OffersPage /> },
];

const ownerRoutes: RouteConfig[] = [
  { path: "/owner", element: <OwnerDashboardPage /> },
  { path: "/owner/dashboard", element: <Navigate to="/owner" replace /> },
  { path: "/owner/shops/new", element: <CreateShopPage /> },
  { path: "/owner/items/new", element: <CreateItemPage /> },
  { path: "/owner/inventory", element: <OwnerInventoryPage /> },
  { path: "/owner/locations", element: <OwnerLocationsPage /> },
  { path: "/owner/staff", element: <OwnerStaffPage /> },
  { path: "/owner/auctions", element: <OwnerAuctionsPage /> },
  { path: "/owner/auctions/new", element: <CreateAuctionPage /> },
  { path: "/owner/scan-console", element: <ScanConsolePage /> },
  { path: "/owner/bulk-upload", element: <BulkUploadPage /> },
  { path: "/owner/subscription", element: <OwnerSubscriptionPage /> },
];

const adminCoreRoutes: RouteConfig[] = [
  { index: true, element: <AdminOverviewPage /> },
  { path: "overview", element: <Navigate to="/admin" replace /> },
  { path: "users", element: <AdminUsersPage /> },
  { path: "owners", element: <AdminOwnersPage /> },
  { path: "shops", element: <AdminShopsPage /> },
  { path: "inventory", element: <AdminItemsPage /> },
  { path: "items", element: <Navigate to="/admin/inventory" replace /> },
  { path: "auctions", element: <AdminAuctionsPage /> },
  { path: "offers", element: <AdminOffersPage /> },
  { path: "subscriptions", element: <AdminSubscriptionsPage /> },
  {
    path: "subscription",
    element: <Navigate to="/admin/subscriptions" replace />,
  },
];

const adminPlaceholderRoutes: RouteConfig[] = [
  {
    path: "orders",
    element: placeholderRoute(
      "Admin orders",
      "Reserved for a future admin orders workspace.",
    ),
  },
  {
    path: "reviews",
    element: placeholderRoute(
      "Admin reviews",
      "Reserved for a future admin reviews workspace.",
    ),
  },
  {
    path: "support",
    element: placeholderRoute(
      "Admin support",
      "Reserved for a future admin support workspace.",
    ),
  },
  {
    path: "revenue",
    element: placeholderRoute(
      "Admin revenue",
      "Reserved for a future admin revenue workspace.",
    ),
  },
  {
    path: "analytics",
    element: placeholderRoute(
      "Admin analytics",
      "Reserved for a future admin analytics workspace.",
    ),
  },
  {
    path: "risk",
    element: placeholderRoute(
      "Admin risk",
      "Reserved for a future admin risk workspace.",
    ),
  },
  {
    path: "audit",
    element: placeholderRoute(
      "Admin audit",
      "Reserved for a future admin audit workspace.",
    ),
  },
  {
    path: "system",
    element: placeholderRoute(
      "Admin system",
      "Reserved for a future admin system workspace.",
    ),
  },
  {
    path: "settings",
    element: placeholderRoute(
      "Admin settings",
      "Reserved for a future admin settings workspace.",
    ),
  },
];

const adminChildRoutes: RouteConfig[] = [
  ...adminCoreRoutes,
  ...adminPlaceholderRoutes,
];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          {renderRouteGroup(publicRoutes, "public")}
          {renderRouteGroup(consumerRoutes, "consumer", CONSUMER_ROLES)}
          {renderRouteGroup(ownerRoutes, "owner", OWNER_ROLES)}
        </Route>

        <Route element={<RequireRole allowed={ADMIN_ROLES} />}>
          <Route path="/admin" element={withSuspense(<AdminLayout />)}>
            {adminChildRoutes.map((route, index) =>
              renderRoute(
                route,
                `admin-${"path" in route ? route.path : `index-${index}`}`,
              ),
            )}
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}