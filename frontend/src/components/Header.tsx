import { Link, useLocation, useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { LogOut, Menu, Moon, Search, ShoppingBag, Sun, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';

export type AppView = 'store' | 'orders' | 'admin' | 'profile';

interface HeaderProps {
  currentView: AppView;
  onSelectView: (view: AppView) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

/** Wordmark used in the header and footer. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-fg text-bg">
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
          <path
            d="M12 3.5a8.5 8.5 0 1 0 5.2 15.2l2.4 2.4 1.9-1.9-2.4-2.4A8.5 8.5 0 0 0 12 3.5Zm0 3a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span className="text-[17px] font-bold tracking-tight text-fg">
        quick<span className="text-accent">kart</span>
      </span>
    </span>
  );
}

export const Header: React.FC<HeaderProps> = ({
  currentView, onSelectView, isSidebarOpen, onToggleSidebar,
}) => {
  const { user, isAuthenticated, isAdmin, logout, openAuthModal } = useAuth();
  const { itemsCount } = useCart();
  const { resolved, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // Header search simply drives the catalog's ?q= parameter on the home page.
  const urlQuery = new URLSearchParams(location.search).get('q') ?? '';
  const [query, setQuery] = useState(urlQuery);
  useEffect(() => setQuery(urlQuery), [urlQuery]);
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : '/');
    document.getElementById('catalog-results')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const navItem = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-subtle text-fg' : 'text-muted hover:text-fg'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/70">
      <div className="qk-container flex h-16 items-center gap-3 md:gap-6">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-fg transition-colors hover:bg-subtle md:hidden"
          aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isSidebarOpen}
        >
          {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <button type="button" onClick={() => onSelectView('store')} aria-label="QuickKart Home" className="shrink-0">
          <Logo />
        </button>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          <button type="button" onClick={() => onSelectView('store')} className={navItem(currentView === 'store')}>
            Shop
          </button>
          <Link to="/categories" className={navItem(location.pathname === '/categories')}>
            Categories
          </Link>
          {isAuthenticated && (
            <button type="button" onClick={() => onSelectView('orders')} className={navItem(currentView === 'orders')}>
              Orders
            </button>
          )}
          {isAdmin && (
            <button type="button" onClick={() => onSelectView('admin')} className={navItem(currentView === 'admin')}>
              Admin
            </button>
          )}
        </nav>

        <form role="search" onSubmit={submitSearch} className="relative ml-auto hidden max-w-md flex-1 sm:block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, brands…"
            aria-label="Search products"
            className="h-10 w-full rounded-full border border-transparent bg-subtle pl-10 pr-4 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-line focus:bg-surface"
          />
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
          <Link
            to="/search"
            aria-label="Search"
            className="grid h-10 w-10 place-items-center rounded-full text-fg transition-colors hover:bg-subtle sm:hidden"
          >
            <Search className="h-5 w-5" />
          </Link>

          <button
            type="button"
            onClick={toggle}
            className="grid h-10 w-10 place-items-center rounded-full text-fg transition-colors hover:bg-subtle"
            aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={resolved === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {resolved === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {isAuthenticated && !isAdmin && (
            <button
              type="button"
              onClick={() => navigate('/cart')}
              className="relative grid h-10 w-10 place-items-center rounded-full text-fg transition-colors hover:bg-subtle"
              aria-label={`Cart${itemsCount > 0 ? ` — ${itemsCount} items` : ''}`}
            >
              <ShoppingBag className="h-5 w-5" />
              {itemsCount > 0 && (
                <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg">
                  {itemsCount > 99 ? '99+' : itemsCount}
                </span>
              )}
            </button>
          )}

          {isAuthenticated ? (
            <>
              <button
                type="button"
                onClick={() => onSelectView('profile')}
                className={`ml-1 flex h-10 items-center gap-2 rounded-full pl-1 pr-1 transition-colors hover:bg-subtle lg:pr-3 ${
                  currentView === 'profile' ? 'bg-subtle' : ''
                }`}
                aria-label="My Account"
                title="My Account"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                  {(user?.name?.trim()?.[0] ?? 'U').toUpperCase()}
                </span>
                <span className="hidden max-w-28 truncate text-sm font-medium text-fg lg:block">{user?.name}</span>
              </button>
              <button
                type="button"
                onClick={logout}
                className="grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-subtle hover:text-fg"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              aria-label="Account sign in"
              className="qk-btn qk-btn-primary ml-1 h-10 w-10 px-0 sm:w-auto sm:px-4"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
