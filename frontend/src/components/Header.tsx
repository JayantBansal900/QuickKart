import { Link, useLocation, useNavigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { Heart, LogOut, Menu, Moon, Search, ShoppingBag, Sun, User, X } from 'lucide-react';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';

export type AppView = 'store' | 'orders' | 'admin' | 'profile';

interface HeaderProps {
  currentView: AppView;
  onSelectView: (view: AppView) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

/** Shown until /api/categories answers (and if it fails). */
const FALLBACK_CATEGORIES = [
  { key: 'ELECTRONICS', name: 'Electronics' },
  { key: 'FASHION', name: 'Fashion' },
  { key: 'HOME & LIVING', name: 'Home & Living' },
  { key: 'SPORTS', name: 'Sports' },
  { key: 'BOOKS', name: 'Books' },
  { key: 'BEAUTY', name: 'Beauty' },
  { key: 'GROCERIES', name: 'Groceries' },
  { key: 'ACCESSORIES', name: 'Accessories' },
];

/** Wordmark used in the header and footer. */
/** QuickKart brand mark: a shopping bag with a lightning bolt (quick delivery), plus the wordmark. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-fg" />
      <path d="M11.5 11V9.5a4.5 4.5 0 0 1 9 0V11" fill="none" className="stroke-bg" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M7.5 11.5h17l-1.3 13.1a2 2 0 0 1-2 1.9H10.8a2 2 0 0 1-2-1.9z" className="fill-bg" />
      <path d="M17.4 13.6l-4.6 6h3.1l-1.3 4.6 4.8-6.3h-3.2z" fill="#f5b700" />
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-[19px] leading-none tracking-[-0.03em] text-fg">
        <span className="font-extrabold">Quick</span>
        <span className="font-medium">Kart</span>
      </span>
    </span>
  );
}

const iconButton =
  'relative grid h-10 w-10 place-items-center rounded-md text-fg transition-colors hover:bg-subtle';

export const Header: React.FC<HeaderProps> = ({
  currentView, onSelectView, isSidebarOpen, onToggleSidebar,
}) => {
  const { count: wishlistCount } = useWishlist();
  const { user, isAuthenticated, isAdmin, logout, openAuthModal } = useAuth();
  const { itemsCount } = useCart();
  const { resolved, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  useEffect(() => {
    let active = true;
    api.getCategories()
      .then((list) => { if (active && list.length > 0) setCategories(list.map((c) => ({ key: c.key, name: c.name }))); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Header search simply drives the catalog's ?q= parameter on the home page.
  const params = new URLSearchParams(location.search);
  const urlQuery = params.get('q') ?? '';
  const activeCategory = location.pathname === '/' ? (params.get('category') ?? '').toUpperCase() : '';
  const [query, setQuery] = useState(urlQuery);
  useEffect(() => setQuery(urlQuery), [urlQuery]);
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : '/');
    document.getElementById('catalog-results')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  const openCategory = (key: string) => {
    navigate(`/?category=${encodeURIComponent(key)}`);
    setTimeout(() => document.getElementById('catalog-results')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 50);
  };

  const subNav = (active: boolean) =>
    `relative shrink-0 py-3 text-[13px] font-medium transition-colors ${
      active ? 'text-fg after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-fg' : 'text-muted hover:text-fg'
    }`;

  return (
    <header className="sticky top-0 z-40 print:hidden bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="bg-fg text-bg">
        <p className="qk-container py-2 text-center text-xs font-medium tracking-wide">
          Free delivery on every order<span className="hidden sm:inline"> · Pay by UPI, card or cash on delivery</span>
        </p>
      </div>

      <div className="border-b border-line">
        <div className="qk-container flex h-16 items-center gap-3 md:gap-8">
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`${iconButton} shrink-0 md:hidden`}
            aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isSidebarOpen}
          >
            {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <button type="button" onClick={() => onSelectView('store')} aria-label="QuickKart Home" className="shrink-0">
            <Logo />
          </button>

          <form role="search" onSubmit={submitSearch} className="relative mx-auto hidden w-full max-w-xl sm:block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for products, brands and more"
              aria-label="Search products"
              className="h-10 w-full rounded-md border border-transparent bg-subtle pl-10 pr-4 text-sm text-fg outline-none transition-colors placeholder:text-muted focus:border-fg focus:bg-surface"
            />
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:ml-0">
            <Link to="/search" aria-label="Search" className={`${iconButton} sm:hidden`}>
              <Search className="h-5 w-5" />
            </Link>

            <button
              type="button"
              onClick={toggle}
              className={iconButton}
              aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={resolved === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {resolved === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>

            {isAuthenticated ? (
              <>
                <button
                  type="button"
                  onClick={() => onSelectView('profile')}
                  className={`flex h-10 items-center gap-2 rounded-md px-2 transition-colors hover:bg-subtle ${
                    currentView === 'profile' ? 'bg-subtle' : ''
                  }`}
                  aria-label="My Account"
                  title="My Account"
                >
                  <User className="h-[18px] w-[18px]" />
                  <span className="hidden max-w-28 truncate text-sm font-medium text-fg lg:block">{user?.name}</span>
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className={`${iconButton} text-muted hover:text-fg`}
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
                className="flex h-10 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-fg transition-colors hover:bg-subtle"
              >
                <User className="h-[18px] w-[18px]" />
                <span className="hidden sm:inline">Sign In</span>
              </button>
            )}

            {!isAdmin && (
              <button
                type="button"
                onClick={() => (isAuthenticated ? navigate('/account/wishlist') : openAuthModal('login'))}
                className={iconButton}
                aria-label={`Wishlist${wishlistCount > 0 ? ` — ${wishlistCount} saved` : ''}`}
              >
                <Heart className="h-[18px] w-[18px]" />
                {wishlistCount > 0 && (
                  <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-sale px-1 text-[10px] font-bold text-white">
                    {wishlistCount > 99 ? '99+' : wishlistCount}
                  </span>
                )}
              </button>
            )}

            {!isAdmin && (
              <button
                type="button"
                onClick={() => (isAuthenticated ? navigate('/cart') : openAuthModal('login'))}
                className={iconButton}
                aria-label={`Cart${itemsCount > 0 ? ` — ${itemsCount} items` : ''}`}
              >
                <ShoppingBag className="h-[18px] w-[18px]" />
                {itemsCount > 0 && (
                  <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-fg px-1 text-[10px] font-bold text-bg">
                    {itemsCount > 99 ? '99+' : itemsCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <nav aria-label="Primary" className="hidden border-b border-line md:block">
        <div className="qk-container qk-scrollbar-none flex items-center gap-7 overflow-x-auto">
          <button
            type="button"
            onClick={() => onSelectView('store')}
            className={subNav(currentView === 'store' && location.pathname === '/' && !activeCategory)}
          >
            Shop
          </button>
          {categories.map((c) => (
            <button key={c.key} type="button" onClick={() => openCategory(c.key)} className={subNav(activeCategory === c.key)}>
              {c.name}
            </button>
          ))}
          <Link to="/categories" className={subNav(location.pathname === '/categories')}>
            Categories
          </Link>
          <span className="ml-auto" />
          {isAuthenticated && (
            <button type="button" onClick={() => onSelectView('orders')} className={subNav(currentView === 'orders')}>
              Orders
            </button>
          )}
          {isAdmin && (
            <button type="button" onClick={() => onSelectView('admin')} className={subNav(currentView === 'admin')}>
              Admin
            </button>
          )}
        </div>
      </nav>
    </header>
  );
};
