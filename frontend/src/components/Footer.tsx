import React from 'react';
import { Link } from 'react-router-dom';
import { INFO_LINKS } from '../pages/infoLinks';
import { Logo } from './Header';

const SHOP_LINKS = [
  { to: '/', label: 'All products' },
  { to: '/categories', label: 'Categories' },
  { to: '/?sort=discount-desc', label: 'Deals' },
  { to: '/?sort=popular', label: 'Popular' },
];

const ACCOUNT_LINKS = [
  { to: '/account/profile', label: 'My account' },
  { to: '/account/orders', label: 'Orders' },
  { to: '/cart', label: 'Cart' },
];

function Column({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="text-sm text-muted transition-colors hover:text-fg">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Customer-facing footer: shopping links only — no infrastructure or admin details. */
export const Footer: React.FC = () => (
  <footer className="mt-auto border-t border-line bg-subtle/60">
    <div className="qk-container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
      <div className="max-w-xs">
        <Logo />
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Everyday essentials and things you’ll love, from brands you trust. Pay by UPI, card or cash on delivery.
        </p>
      </div>
      <Column title="Shop" links={SHOP_LINKS} />
      <Column title="Account" links={ACCOUNT_LINKS} />
      <nav aria-label="Store information">
        <Column title="Help" links={INFO_LINKS.map((l) => ({ to: `/info/${l.slug}`, label: l.label }))} />
      </nav>
    </div>
    <div className="border-t border-line">
      <div className="qk-container flex flex-col gap-2 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} QuickKart. All rights reserved.</span>
        <span>Prices include GST · Made in India</span>
      </div>
    </div>
  </footer>
);
