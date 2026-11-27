import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Header';

const LINKS = [
  { to: '/', label: 'Shop' },
  { to: '/account/orders', label: 'Orders' },
  { to: '/account/wishlist', label: 'Wishlist' },
  { to: '/account/profile', label: 'Account' },
];

/** Small footer: brand, a few links and the payment line. */
export const Footer: React.FC = () => (
  <footer className="mt-auto border-t border-line print:hidden">
    <div className="qk-container flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
      <Logo />
      <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="text-sm text-muted transition-colors hover:text-fg">{l.label}</Link>
        ))}
      </nav>
    </div>
    <div className="border-t border-line">
      <div className="qk-container flex flex-col gap-1 py-5 text-xs text-muted sm:flex-row sm:justify-between">
        <span>© {new Date().getFullYear()} QuickKart · a portfolio project, no real payments</span>
        <span>UPI, card or cash on delivery · 7-day returns</span>
      </div>
    </div>
  </footer>
);
