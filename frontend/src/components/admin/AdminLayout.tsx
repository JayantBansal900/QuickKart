import React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  Boxes,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  ShoppingBag,
  Store,
  Sun,
  Users,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/inventory", label: "Inventory", icon: Boxes },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { to: "/admin/users", label: "Customers", icon: Users },
  { to: "/admin/system", label: "System status", icon: Activity },
];

/**
 * Separate shell for the administrator experience: own sidebar, no storefront header/cart.
 * Uses the same design tokens as the store, so light/dark mode work here too.
 */
export function AdminLayout() {
  const { user, logout } = useAuth();
  const { resolved: resolvedTheme, toggle: toggleTheme } = useTheme();
  const initial = (user?.name || user?.email || "A").charAt(0).toUpperCase();
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg md:flex-row">
      <aside className="flex-none border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-64 md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-5 py-4 md:py-6">
          <Link to="/admin" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-fg font-display text-xl leading-none text-bg">q</span>
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight">quickkart</span>
              <span className="qk-eyebrow !text-[10px]">Admin console</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-subtle hover:text-fg md:hidden"
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
        <nav aria-label="Admin navigation" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-fg text-bg" : "text-muted hover:bg-subtle hover:text-fg"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-line p-3 md:block">
          <div className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{initial}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{user?.name || "Administrator"}</span>
              <span className="block truncate text-xs text-muted" title={user?.email}>{user?.email}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-subtle hover:text-fg"
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-subtle hover:text-fg">
            <Store className="h-4 w-4" /> View store
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-subtle hover:text-sale"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-only account bar (desktop shows these in the sidebar footer). */}
        <div className="flex items-center justify-end gap-4 border-b border-line bg-surface px-4 py-2 text-xs md:hidden">
          <Link to="/" className="font-medium text-muted">View store</Link>
          <button type="button" onClick={logout} className="font-medium text-muted">Sign out</button>
        </div>
        <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-4 py-8 sm:px-8 md:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
