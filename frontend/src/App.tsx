import React, { lazy, Suspense, useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { MotionConfig } from "motion/react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { CartProvider, useCart } from "./context/CartContext";
import { Header, AppView } from "./components/Header";
import { Footer } from "./components/Footer";
import { CartDrawer } from "./components/CartDrawer";
import { CheckoutModal } from "./components/CheckoutModal";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthPage } from "./pages/AuthPage";
import { HomePage } from "./pages/HomePage";
const OrdersPage = lazy(() =>
  import("./pages/OrdersPage").then((m) => ({ default: m.OrdersPage })),
);
const ProfilePage = lazy(() =>
  import("./pages/CustomerProfilePage").then((m) => ({
    default: m.CustomerProfilePage,
  })),
);
// Admin area is code-split: customers never download the admin bundle.
const AdminLayout = lazy(() =>
  import("./components/admin/AdminLayout").then((m) => ({ default: m.AdminLayout })),
);
const AdminLoginPage = lazy(() =>
  import("./pages/admin/AdminLoginPage").then((m) => ({ default: m.AdminLoginPage })),
);
const AdminOverviewPage = lazy(() =>
  import("./pages/admin/AdminOverviewPage").then((m) => ({ default: m.AdminOverviewPage })),
);
const AdminProductsPage = lazy(() =>
  import("./pages/admin/AdminProductsPage").then((m) => ({ default: m.AdminProductsPage })),
);
const AdminInventoryPage = lazy(() =>
  import("./pages/admin/AdminInventoryPage").then((m) => ({ default: m.AdminInventoryPage })),
);
const AdminOrdersPage = lazy(() =>
  import("./pages/admin/AdminOrdersPage").then((m) => ({ default: m.AdminOrdersPage })),
);
const AdminUsersPage = lazy(() =>
  import("./pages/admin/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })),
);
const AdminSystemPage = lazy(() =>
  import("./pages/admin/AdminSystemPage").then((m) => ({ default: m.AdminSystemPage })),
);
const paths: Record<AppView, string> = {
  store: "/",
  orders: "/account/orders",
  profile: "/account/profile",
  admin: "/admin",
};
function CommerceRoute({ checkout = false }: { checkout?: boolean }) {
  const navigate = useNavigate();
  const { openCartDrawer, closeCartDrawer } = useCart();
  useEffect(() => {
    if (!checkout) openCartDrawer();
    return () => closeCartDrawer();
  }, [checkout, openCartDrawer, closeCartDrawer]);
  return (
    <>
      <div className="qk-container py-16 text-center">
        <p className="text-sm text-muted">Your cart is open on the right.</p>
        <Link to="/" className="qk-btn qk-btn-ghost mt-4">Continue shopping</Link>
      </div>
      {checkout && (
        <CheckoutModal
          isOpen
          onClose={() => navigate("/cart")}
          onOrderSuccess={(order) => navigate("/account/orders", { replace: true, state: {confirmedOrderId: order.id} })}
        />
      )}
    </>
  );
}
export function ApplicationShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const shopRoute =
    ["/", "/search"].includes(location.pathname) ||
    location.pathname.startsWith("/products/");
  const [sidebar, setSidebar] = useState(false);
  const currentView: AppView = location.pathname.startsWith("/admin")
    ? "admin"
    : location.pathname === "/account/orders"
      ? "orders"
      : location.pathname.startsWith("/account")
        ? "profile"
        : "store";
  const select = (view: AppView) => {
    navigate(paths[view]);
    setSidebar(false);
  };
  useEffect(() => {
    setSidebar(false);
  }, [location.pathname]);
  return (
    <div className="flex min-h-screen flex-col bg-bg font-sans text-fg antialiased">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-bg">
        Skip to content
      </a>
      <Header
        currentView={currentView}
        onSelectView={select}
        isSidebarOpen={sidebar}
        onToggleSidebar={() => setSidebar((value) => !value)}
      />
      {sidebar && !shopRoute && (
        <nav
          aria-label="Mobile navigation"
          className="animate-fade-in border-b border-line bg-surface md:hidden"
          onKeyDown={(e) => {
            if (e.key === "Escape") setSidebar(false);
          }}
        >
          <div className="qk-container flex flex-col py-2 text-[15px] font-medium">
            {[
              ["/", "Shop"],
              ["/account/orders", "My Orders"],
              ["/account/profile", "My Account"],
              ["/cart", "Cart"],
              ...(isAdmin ? [["/admin", "Admin"]] : []),
            ].map(([to, label]) => (
              <Link key={to} to={to} className="rounded-xl px-3 py-3 text-fg hover:bg-subtle">
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}
      <main id="main-content" className="w-full flex-1">
        <Suspense
          fallback={
            <p role="status" className="qk-container py-16 text-sm text-muted">
              Loading page…
            </p>
          }
        >
          <Routes>
            {["/", "/search", "/products/:productId"].map((path) => (
              <Route
                key={path}
                path={path}
                element={
                  <HomePage
                    isSidebarOpen={sidebar}
                    onCloseSidebar={() => setSidebar(false)}
                    currentView="store"
                    onSelectView={select}
                  />
                }
              />
            ))}
            {["/login", "/register", "/verify-email"].map((path) => (
              <Route key={path} path={path} element={<AuthPage />} />
            ))}
            <Route element={<ProtectedRoute />}>
              <Route
                path="/account"
                element={<Navigate replace to="/account/profile" />}
              />
              <Route
                path="/account/profile"
                element={
                  <ProfilePage
                    onNavigateToOrders={() => select("orders")}
                    onNavigateToStore={() => select("store")}
                  />
                }
              />
              <Route
                path="/account/orders"
                element={
                  <OrdersPage onNavigateToStore={() => select("store")} />
                }
              />
              <Route path="/cart" element={<CommerceRoute />} />
              <Route path="/checkout" element={<CommerceRoute checkout />} />
            </Route>
            <Route
              path="/profile"
              element={<Navigate replace to="/account/profile" />}
            />
            <Route
              path="/orders"
              element={<Navigate replace to="/account/orders" />}
            />
            <Route
              path="*"
              element={
                <div className="qk-container flex flex-col items-center py-24 text-center">
                  <p className="text-6xl font-bold tracking-tight text-fg">404</p>
                  <h1 className="mt-4 text-xl font-semibold text-fg">Page not found</h1>
                  <p className="mt-2 text-sm text-muted">The page you’re looking for doesn’t exist or has moved.</p>
                  <Link to="/" className="qk-btn qk-btn-primary mt-6">Return to shopping</Link>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      {user && <CartDrawer onProceedToCheckout={() => navigate("/checkout")} />}
    </div>
  );
}
/**
 * Administrator experience: its own login page and its own layout (no storefront header, cart or
 * footer). Frontend guards are UX only — every /api/admin call is authorised again on the server.
 */
function AdminRoutes() {
  return (
    <Suspense fallback={<p role="status" className="p-8">Loading admin…</p>}>
      <Routes>
        <Route path="login" element={<AdminLoginPage />} />
        <Route element={<ProtectedRoute admin />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="dashboard" element={<Navigate replace to="/admin" />} />
            <Route path="products" element={<AdminProductsPage />} />
            <Route path="inventory" element={<AdminInventoryPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="system" element={<AdminSystemPage />} />
            <Route path="*" element={<Navigate replace to="/admin" />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
function SessionContent() {
  const { user, status } = useAuth();
  return (
    <CartProvider key={`${status}:${user?.id ?? "guest"}`}>
      <Routes>
        <Route path="/admin/*" element={<AdminRoutes />} />
        <Route path="*" element={<ApplicationShell />} />
      </Routes>
    </CartProvider>
  );
}
export function ApplicationProviders() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <AuthProvider>
          <SessionContent />
        </AuthProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <ApplicationProviders />
    </BrowserRouter>
  );
}
