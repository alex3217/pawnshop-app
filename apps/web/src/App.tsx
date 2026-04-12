// File: apps/web/src/App.tsx

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import RequireRole from "./components/RequireRole";
import SiteLayout from "./components/SiteLayout";

import AdminItemsPage from "./pages/AdminItemsPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AuctionDetailPage from "./pages/AuctionDetailPage";
import AuctionsPage from "./pages/AuctionsPage";
import CreateAuctionPage from "./pages/CreateAuctionPage";
import CreateShopPage from "./pages/CreateShopPage";
import CreateItemPage from "./pages/CreateItemPage";
import HomePage from "./pages/HomePage";
import ItemDetailPage from "./pages/ItemDetailPage";
import LoginPage from "./pages/LoginPage";
import MarketplacePage from "./pages/MarketplacePage";
import MyBidsPage from "./pages/MyBidsPage";
import OwnerAuctionsPage from "./pages/OwnerAuctionsPage";
import OffersPage from "./pages/OffersPage";
import OwnerDashboardPage from "./pages/OwnerDashboardPage";
import OwnerInventoryPage from "./pages/OwnerInventoryPage";
import OwnerSubscriptionPage from "./pages/OwnerSubscriptionPage";
import RegisterPage from "./pages/RegisterPage";
import ShopDetailPage from "./pages/ShopDetailPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          {/* Public */}
          <Route index element={<HomePage />} />
          <Route path="/auctions" element={<AuctionsPage />} />
          <Route path="/auctions/:id" element={<AuctionDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/shops/:id" element={<ShopDetailPage />} />
          <Route path="/items/:id" element={<ItemDetailPage />} />

          {/* Buyer / authenticated */}
          <Route element={<RequireRole allowed={["CONSUMER", "ADMIN"]} />}>
            <Route path="/my-bids" element={<MyBidsPage />} />
            <Route path="/offers" element={<OffersPage />} />
            <Route path="/bids" element={<Navigate to="/my-bids" replace />} />
          </Route>

          {/* Owner */}
          <Route element={<RequireRole allowed={["OWNER", "ADMIN"]} />}>
            <Route path="/owner" element={<OwnerDashboardPage />} />
            <Route path="/owner/shops/new" element={<CreateShopPage />} />
            <Route
              path="/owner/dashboard"
              element={<Navigate to="/owner" replace />}
            />
            <Route path="/owner/auctions" element={<OwnerAuctionsPage />} />
            <Route path="/owner/auctions/new" element={<CreateAuctionPage />} />
            <Route path="/owner/items/new" element={<CreateItemPage />} />
            <Route path="/owner/inventory" element={<OwnerInventoryPage />} />
            <Route
              path="/owner/subscription"
              element={<OwnerSubscriptionPage />}
            />
          </Route>

          {/* Admin */}
          <Route element={<RequireRole allowed={["ADMIN"]} />}>
            <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/items" element={<AdminItemsPage />} />
            <Route
              path="/admin/subscription"
              element={<OwnerSubscriptionPage />}
            />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}