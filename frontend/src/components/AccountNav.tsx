import React from 'react';
import { NavLink } from 'react-router-dom';
import { Heart, Package, User } from 'lucide-react';
import { useWishlist } from '../context/WishlistContext';

/** Tabs shared by the customer account pages. */
export function AccountNav() {
  const { count } = useWishlist();
  const tabs = [
    { to: '/account/profile', label: 'Profile', icon: User },
    { to: '/account/orders', label: 'Orders', icon: Package },
    { to: '/account/wishlist', label: count ? `Wishlist (${count})` : 'Wishlist', icon: Heart },
  ];
  return (
    <nav aria-label="Account" className="mb-8 flex gap-1 overflow-x-auto border-b border-line print:hidden">
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg'
            }`
          }
        >
          <Icon className="h-4 w-4" /> {label}
        </NavLink>
      ))}
    </nav>
  );
}
