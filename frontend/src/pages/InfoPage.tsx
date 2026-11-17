import React, { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { INFO_LINKS } from './infoLinks';

type Section = { heading: string; body: React.ReactNode };
type Page = { title: string; intro: string; sections: Section[] };

const SUPPORT_EMAIL = 'support@quickkart.example';

/**
 * Store information pages linked from the footer. QuickKart is a portfolio project, so these
 * describe how this demo store behaves rather than a real company's legal terms.
 */
const PAGES: Record<string, Page> = {
  about: {
    title: 'About QuickKart',
    intro: 'QuickKart is a full-stack e-commerce store built as an engineering portfolio project.',
    sections: [
      { heading: 'What you can do here', body: 'Browse 144 hand-picked products in 8 categories, search and filter on the server, pay by cash on delivery or through a simulated UPI / card gateway, track every order step by step and review what you bought.' },
      { heading: 'How it is built', body: 'A React storefront talks to Spring Boot services behind an API gateway, with PostgreSQL, a Redis cache and Kafka events for emails. Orders are protected against overselling and double submission.' },
      { heading: 'Is this a real shop?', body: 'No. Products and prices are realistic examples, no real money is charged and nothing is shipped.' },
    ],
  },
  contact: {
    title: 'Contact & support',
    intro: 'Questions about an order or your account? Here is how to get help.',
    sections: [
      { heading: 'Your orders', body: <>Open <Link to="/account/orders" className="underline">My Orders</Link> to track a delivery, pay for an order that is waiting for payment, or cancel an order before it ships.</> },
      { heading: 'Your account', body: <>Change your name, phone and delivery address in <Link to="/account/profile" className="underline">My Account</Link>. Forgot your password? Use <Link to="/forgot-password" className="underline">reset password</Link>: a code is emailed to you.</> },
      { heading: 'Email', body: <>Write to <span className="font-medium text-fg">{SUPPORT_EMAIL}</span> (demo address). Include your order number if it is about an order.</> },
    ],
  },
  shipping: {
    title: 'Shipping & delivery',
    intro: 'Every order moves through the same steps, and you get an email at the important ones.',
    sections: [
      { heading: 'Order steps', body: 'Placed → Confirmed → Packed → Shipped → Out for delivery → Delivered. Online orders start as "Awaiting payment" until the payment succeeds.' },
      { heading: 'Emails', body: 'You get an email when the order is placed (or the payment succeeds), when it ships, when it is out for delivery, when it is delivered and if it is cancelled.' },
      { heading: 'Charges', body: 'There is no shipping charge or extra tax in this demo store. The total you confirm at checkout is the total you pay.' },
    ],
  },
  returns: {
    title: 'Cancellations & refunds',
    intro: 'You can cancel an order yourself until it ships.',
    sections: [
      { heading: 'Cancelling', body: 'Open My Orders and choose Cancel order. This is possible while the order is placed, confirmed or being packed. The items go straight back on sale.' },
      { heading: 'Refunds', body: 'If you paid online, cancelling refunds the full amount immediately (simulated). Cash on delivery orders are never charged before delivery.' },
      { heading: 'Unpaid orders', body: 'An online order that is not paid within 30 minutes is cancelled automatically and its items are released.' },
    ],
  },
  privacy: {
    title: 'Privacy',
    intro: 'What this store stores about you, and why.',
    sections: [
      { heading: 'What we keep', body: 'Your name, email, password (stored only as a BCrypt hash), optional phone number and saved delivery address, your cart, orders and reviews.' },
      { heading: 'What others see', body: 'Reviews show your first name and the initial of your last name. Your email is never shown to other shoppers.' },
      { heading: 'Emails', body: 'We only send account emails (verification and password codes) and updates about your own orders. No marketing emails.' },
      { heading: 'Cookies', body: 'The store keeps your sign-in token and theme choice in your browser. There are no tracking or advertising cookies.' },
    ],
  },
  terms: {
    title: 'Terms of use',
    intro: 'The simple rules for using this demo store.',
    sections: [
      { heading: 'Demo only', body: 'QuickKart is a portfolio project. Orders are not fulfilled and no real payments are taken.' },
      { heading: 'Accounts', body: 'Use a real email address you own: it must be verified with a code. Accounts that abuse the store can be suspended by an administrator.' },
      { heading: 'Reviews', body: 'Only customers who received a product can review it. Keep reviews honest and about the product; administrators may remove reviews that are not.' },
    ],
  },
};


export function InfoPage() {
  const { slug = '' } = useParams();
  const page = PAGES[slug];
  useEffect(() => {
    if (page) document.title = `${page.title} · QuickKart`;
    document.getElementById('main-content')?.scrollIntoView?.();
  }, [page]);
  if (!page) return <Navigate replace to="/" />;

  return (
    <div className="qk-container max-w-3xl py-12">
      <p className="qk-eyebrow">QuickKart</p>
      <h1 className="qk-display mt-1 text-5xl text-fg">{page.title}</h1>
      <p className="mt-3 text-lg text-muted">{page.intro}</p>
      <div className="mt-10 space-y-8">
        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-base font-semibold text-fg">{section.heading}</h2>
            <p className="mt-2 leading-relaxed text-muted">{section.body}</p>
          </section>
        ))}
      </div>
      <nav aria-label="More information" className="mt-14 flex flex-wrap gap-2 border-t border-line pt-6">
        {INFO_LINKS.filter((l) => l.slug !== slug).map((l) => (
          <Link key={l.slug} to={`/info/${l.slug}`} className="rounded-full border border-line px-3.5 py-1.5 text-sm text-fg hover:bg-subtle">
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
