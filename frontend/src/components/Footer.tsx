import React from 'react';
import { Link } from 'react-router-dom';
import { Banknote, PackageSearch, ShieldCheck } from 'lucide-react';
import { Logo } from './Header';

const PROMISES = [
  { icon: Banknote, title: 'Cash on delivery', text: 'Pay when your order arrives.' },
  { icon: PackageSearch, title: 'Live stock', text: 'Availability is checked again at checkout.' },
  { icon: ShieldCheck, title: 'Verified accounts', text: 'Every account confirms its email.' },
];

/** Customer-facing footer: shopping links only — no infrastructure or admin details. */
export const Footer: React.FC = () => (
  <footer className="mt-auto border-t border-line bg-surface">
    <div className="qk-container grid gap-6 py-10 sm:grid-cols-3">
      {PROMISES.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-subtle text-fg">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-fg">{title}</p>
            <p className="mt-0.5 text-sm text-muted">{text}</p>
          </div>
        </div>
      ))}
    </div>
    <div className="border-t border-line">
      <div className="qk-container flex flex-col gap-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="hidden sm:inline">© {new Date().getFullYear()} QuickKart</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/" className="hover:text-fg">Shop</Link>
          <Link to="/account/orders" className="hover:text-fg">Orders</Link>
          <Link to="/account/profile" className="hover:text-fg">Account</Link>
          <Link to="/cart" className="hover:text-fg">Cart</Link>
        </nav>
        <span className="sm:hidden">© {new Date().getFullYear()} QuickKart</span>
      </div>
    </div>
  </footer>
);
