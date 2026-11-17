import React from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  Boxes,
  LayoutDashboard,
  LogOut,
  Package,
  ShoppingBag,
  Store,
  Users,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/inventory", label: "Inventory", icon: Boxes },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { to: "/admin/users", label: "Customers", icon: Users },
  { to: "/admin/system", label: "System Status", icon: Activity },
];

/**
 * Separate shell for the administrator experience: own sidebar, own colours, no storefront
 * header/cart. Rendered only inside <ProtectedRoute admin />.
 */
export function AdminLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900 md:flex-row">
      <aside className="flex-none bg-slate-900 text-slate-200 md:sticky md:top-0 md:h-screen md:w-60">
        <div className="flex items-center justify-between gap-2 px-5 py-4 md:block">
          <Link to="/admin" className="block text-lg font-black tracking-tight text-white">
            QuickKart <span className="text-emerald-400">Admin</span>
          </Link>
          <p className="hidden truncate text-xs text-slate-400 md:mt-1 md:block" title={user?.email}>
            {user?.email}
          </p>
        </div>
        <nav aria-label="Admin navigation" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-slate-800 px-3 py-3 md:absolute md:bottom-0 md:block md:w-60">
          <Link to="/" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
            <Store className="h-4 w-4" /> View store
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-only account bar (desktop shows these in the sidebar footer). */}
        <div className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 py-2 text-xs md:hidden">
          <Link to="/" className="font-semibold text-slate-600">View store</Link>
          <button type="button" onClick={logout} className="font-semibold text-slate-600">Sign out</button>
        </div>
        <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
