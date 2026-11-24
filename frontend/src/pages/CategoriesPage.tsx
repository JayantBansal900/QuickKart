import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../services/api';
import { Category } from '../types';

/** All storefront departments, as managed in the admin panel. */
export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Categories · QuickKart';
    api.getCategories().then(setCategories).catch(() => setError(true));
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <div className="qk-container py-12">
      <p className="qk-eyebrow">Browse</p>
      <h1 className="qk-display mt-1 text-5xl text-fg">All categories</h1>
      {error && <p role="alert" className="mt-6 text-sm text-sale">Categories could not be loaded. Please try again.</p>}
      <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {(categories ?? Array.from({ length: 8 }, () => null)).map((c, i) =>
          c ? (
            <li key={c.id}>
              <Link to={`/?category=${encodeURIComponent(c.key)}#catalog-results`} className="group block">
                <div className="aspect-[4/3] overflow-hidden rounded-xl bg-subtle">
                  {c.imageUrl && (
                    <img src={c.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 dark:brightness-[0.9]" />
                  )}
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-fg">{c.name}</h2>
                    <p className="text-sm text-muted">{c.description || `${c.productCount} products`}</p>
                  </div>
                  <span className="mt-1 flex flex-none items-center gap-1 text-sm text-muted group-hover:text-fg">
                    {c.productCount} <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            </li>
          ) : (
            <li key={i} className="animate-pulse">
              <div className="aspect-[4/3] rounded-xl bg-subtle" />
              <div className="mt-3 h-4 w-1/2 rounded-full bg-subtle" />
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
