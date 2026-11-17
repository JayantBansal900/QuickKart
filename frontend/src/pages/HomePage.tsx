import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Gem,
  Home,
  Laptop,
  LayoutGrid,
  Search,
  Shirt,
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';

import { Category as ApiCategory, CategoryCount, PageResponse, Product, ProductSort } from '../types';
import { api } from '../services/api';
import { ProductCard } from '../components/ProductCard';
import { ProductDetailsModal } from '../components/ProductDetailsModal';
import { formatPrice } from '../utils/formatters';
import type { AppView } from '../components/Header';

type SortOption = ProductSort;

const PAGE_SIZE = 24;
const SORT_VALUES: SortOption[] = ['featured', 'price-asc', 'price-desc', 'discount-desc', 'rating-desc', 'popular', 'name', 'newest'];

/** Reads a non-negative number from the URL, ignoring anything malformed. */
function numberParam(value: string | null): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Returns `value` only after it has stopped changing for `delayMs` (avoids one request per keystroke). */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

type Category = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  imageUrl?: string | null;
};

interface HomePageProps {
  isSidebarOpen: boolean;
  onCloseSidebar: () => void;
  currentView: AppView;
  onSelectView: (view: AppView) => void;
}

/** Cover photo for a category tile (falls back to the icon if the file is missing). */
function categoryImage(id: string): string {
  return `/categories/${id === 'ALL' ? 'all' : id.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-')}.webp`;
}

/** Shown until /api/categories answers (and as a fallback if it fails). */
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'ALL', label: 'All products', icon: LayoutGrid },
  { id: 'ELECTRONICS', label: 'Electronics', icon: Laptop },
  { id: 'FASHION', label: 'Fashion', icon: Shirt },
  { id: 'HOME & LIVING', label: 'Home & Living', icon: Home },
  { id: 'SPORTS', label: 'Sports', icon: Dumbbell },
  { id: 'BOOKS', label: 'Books', icon: BookOpen },
  { id: 'BEAUTY', label: 'Beauty', icon: Sparkles },
  { id: 'GROCERIES', label: 'Groceries', icon: ShoppingBasket },
  { id: 'ACCESSORIES', label: 'Accessories', icon: Gem },
];

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'discount-desc', label: 'Biggest discount' },
  { value: 'rating-desc', label: 'Top rated' },
  { value: 'popular', label: 'Most popular' },
  { value: 'name', label: 'Name: A–Z' },
  { value: 'newest', label: 'Newest first' },
];

function ProductSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-square rounded-2xl bg-subtle" />
      <div className="mt-3 h-3 w-1/3 rounded-full bg-subtle" />
      <div className="mt-2 h-4 w-4/5 rounded-full bg-subtle" />
      <div className="mt-3 h-4 w-1/4 rounded-full bg-subtle" />
    </div>
  );
}

export const HomePage: React.FC<HomePageProps> = ({ isSidebarOpen, onCloseSidebar, onSelectView }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { productId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- Catalog filters live in the URL: shareable links, refresh-safe, back button works ----
  const searchQuery = searchParams.get('q') || '';
  const selectedCategory = (searchParams.get('category') || 'ALL').toUpperCase();
  const sortParam = searchParams.get('sort') as SortOption | null;
  const sortBy: SortOption = sortParam && SORT_VALUES.includes(sortParam) ? sortParam : 'featured';
  const page = Math.floor(numberParam(searchParams.get('page')) ?? 0);
  const minPrice = numberParam(searchParams.get('minPrice'));
  const maxPrice = numberParam(searchParams.get('maxPrice'));

  /** Applies URL changes; any filter change goes back to page 1 unless a page is set explicitly. */
  const updateParams = (changes: Record<string, string | number | null | undefined>) => {
    const next = new URLSearchParams(searchParams);
    if (!('page' in changes)) next.delete('page');
    for (const [key, value] of Object.entries(changes)) {
      const empty = value == null || value === '' || (key === 'category' && value === 'ALL') || (key === 'sort' && value === 'featured') || (key === 'page' && value === 0);
      if (empty) next.delete(key); else next.set(key, String(value));
    }
    setSearchParams(next, { replace: !('page' in changes) });
  };
  const scrollToCatalog = () =>
    document.getElementById('catalog-results')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  const setSearchQuery = (value: string) => updateParams({ q: value });
  const setSelectedCategory = (value: string) => updateParams({ category: value });
  const setSortBy = (value: SortOption) => updateParams({ sort: value });
  const goToPage = (value: number) => {
    updateParams({ page: value });
    scrollToCatalog();
  };

  const [selectedProduct, selectProduct] = useState<Product | null>(null);
  const [productError, setProductError] = useState('');
  const setSelectedProduct = (product: Product | null) =>
    navigate(product ? `/products/${product.id}${location.search}` : `/${location.search}`);
  useEffect(() => {
    let active = true;
    selectProduct(null);
    setProductError('');
    if (productId) {
      if (!/^[1-9][0-9]*$/.test(productId)) setProductError('Product not found.');
      else
        api.getProductById(Number(productId))
          .then((product) => { if (active) selectProduct(product); })
          .catch((error) => { if (active) setProductError(error instanceof Error ? error.message : 'Unable to load product.'); });
    }
    return () => { active = false; };
  }, [productId]);

  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // ---- Main catalog grid: one server request per (debounced) filter change ----
  const [results, setResults] = useState<PageResponse<Product> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const debouncedQuery = useDebounced(searchQuery, 300);

  useEffect(() => {
    // While the shopper is still typing, wait for the debounced value instead of firing a
    // request with the old search text (e.g. when the page number resets on the first keystroke).
    if (searchQuery !== debouncedQuery) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    api
      .searchProducts(
        { q: debouncedQuery, category: selectedCategory, sort: sortBy, page, size: PAGE_SIZE, minPrice, maxPrice },
        controller.signal,
      )
      .then((data) => setResults(data))
      .catch((err: unknown) => {
        // A newer filter change cancelled this request: not an error the shopper should see.
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch product catalog.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [searchQuery, debouncedQuery, selectedCategory, sortBy, page, minPrice, maxPrice, reloadKey]);

  const products = results?.content ?? [];
  const totalResults = results?.totalElements ?? 0;
  const totalPages = results?.totalPages ?? 0;

  // ---- Showcase sections and department counts: small, independent requests ----
  const [heroProducts, setHeroProducts] = useState<Product[]>([]);
  const [dealProducts, setDealProducts] = useState<Product[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<CategoryCount[]>([]);
  const [trendingProducts, setTrendingProducts] = useState<Product[]>([]);
  const [apiCategories, setApiCategories] = useState<ApiCategory[] | null>(null);
  useEffect(() => {
    let active = true;
    api.searchProducts({ sort: 'popular', size: 4 })
      .then((p) => active && setTrendingProducts(p.content)).catch(() => {});
    api.getCategories()
      .then((c) => active && setApiCategories(c)).catch(() => {});
    api.searchProducts({ sort: 'rating-desc', size: 3 })
      .then((p) => active && setHeroProducts(p.content)).catch(() => {});
    api.searchProducts({ sort: 'discount-desc', size: 8 })
      .then((p) => active && setDealProducts(p.content.filter((x) => (x.discountPercentage ?? 0) > 0 && x.stockQuantity > 0).slice(0, 4)))
      .catch(() => {});
    api.getCategoryCounts()
      .then((c) => active && setCategoryCounts(c)).catch(() => {});
    return () => { active = false; };
  }, []);
  // Admin-managed categories (order, names, images) with the default icons where they match.
  const categories: Category[] = useMemo(() => {
    if (!apiCategories || apiCategories.length === 0) return DEFAULT_CATEGORIES;
    const icons = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.icon]));
    return [
      DEFAULT_CATEGORIES[0],
      ...apiCategories.map((c) => ({ id: c.key, label: c.name, icon: icons.get(c.key) ?? LayoutGrid, imageUrl: c.imageUrl })),
    ];
  }, [apiCategories]);
  const countFor = (categoryId: string) =>
    categoryId === 'ALL'
      ? categoryCounts.reduce((sum, c) => sum + c.count, 0)
      : categoryCounts.find((c) => c.category === categoryId)?.count ?? 0;

  // ---- Price filter: typed values are applied on Enter/blur, not on every keystroke ----
  const [priceDraft, setPriceDraft] = useState({ min: minPrice?.toString() ?? '', max: maxPrice?.toString() ?? '' });
  useEffect(() => {
    setPriceDraft({ min: minPrice?.toString() ?? '', max: maxPrice?.toString() ?? '' });
  }, [minPrice, maxPrice]);
  const applyPrice = () => {
    let min = numberParam(priceDraft.min);
    let max = numberParam(priceDraft.max);
    if (min != null && max != null && min > max) [min, max] = [max, min];
    if (min !== minPrice || max !== maxPrice) updateParams({ minPrice: min, maxPrice: max });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSidebarOpen) onCloseSidebar();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen, onCloseSidebar]);

  // Instant search preview = first results of the same server search (no extra request).
  const instantSearchResults = useMemo(
    () => (searchQuery.trim() && debouncedQuery === searchQuery ? products.slice(0, 5) : []),
    [products, searchQuery, debouncedQuery],
  );

  const activeCategory =
    categories.find((cat) => cat.id === selectedCategory) ??
    { ...categories[0], id: selectedCategory, label: selectedCategory };

  const filterChips: { label: string; clear: () => void }[] = [
    ...(searchQuery.trim() ? [{ label: `“${searchQuery.trim()}”`, clear: () => updateParams({ q: null }) }] : []),
    ...(selectedCategory !== 'ALL' ? [{ label: activeCategory.label, clear: () => updateParams({ category: null }) }] : []),
    ...(minPrice != null || maxPrice != null
      ? [{
          label: `${minPrice != null ? formatPrice(minPrice) : '₹0'} – ${maxPrice != null ? formatPrice(maxPrice) : 'any'}`,
          clear: () => updateParams({ minPrice: null, maxPrice: null }),
        }]
      : []),
  ];
  const hasActiveFilters = filterChips.length > 0 || sortBy !== 'featured';
  const clearFilters = () => setSearchParams(new URLSearchParams(), { replace: true });
  const isBrowsing = !searchQuery.trim() && selectedCategory === 'ALL' && minPrice == null && maxPrice == null && page === 0;

  const firstShown = totalResults === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastShown = Math.min((page + 1) * PAGE_SIZE, totalResults);
  const totalProducts = countFor('ALL');

  return (
    <div className="relative">
      {/* ---------- Mobile category drawer (opened from the header menu on shop pages) ---------- */}
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={onCloseSidebar}
          className="fixed inset-0 z-50 animate-fade-in cursor-default bg-black/40 backdrop-blur-sm md:hidden"
        />
      )}
      <aside
        inert={!isSidebarOpen}
        aria-hidden={!isSidebarOpen}
        className={`fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col bg-surface shadow-2xl transition-transform duration-300 ease-out md:hidden ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <span className="text-sm font-semibold text-fg">Browse</span>
          <button type="button" onClick={onCloseSidebar} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-full hover:bg-subtle">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Categories">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => { setSelectedCategory(cat.id); onCloseSidebar(); scrollToCatalog(); }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors ${
                  active ? 'bg-subtle font-semibold text-fg' : 'text-fg hover:bg-subtle'
                }`}
              >
                <Icon className="h-5 w-5 text-muted" />
                <span className="flex-1">{cat.label}</span>
                <span className="text-xs text-muted">{countFor(cat.id)}</span>
              </button>
            );
          })}
          <div className="my-3 h-px bg-line" />
          <button type="button" onClick={() => { onSelectView('orders'); onCloseSidebar(); }} className="flex w-full rounded-xl px-3 py-2.5 text-left text-[15px] text-fg hover:bg-subtle">
            My orders
          </button>
          <button type="button" onClick={() => { onSelectView('profile'); onCloseSidebar(); }} className="flex w-full rounded-xl px-3 py-2.5 text-left text-[15px] text-fg hover:bg-subtle">
            My account
          </button>
        </nav>
      </aside>

      {/* ---------- Hero ---------- */}
      {isBrowsing && (
        <section className="qk-container pt-6 md:pt-10">
          <div className="relative grid items-stretch gap-8 overflow-hidden rounded-[32px] bg-surface p-6 ring-1 ring-line md:p-10 lg:grid-cols-[1.1fr_1fr] lg:p-14">
            <div className="flex animate-rise flex-col justify-center">
              <p className="qk-eyebrow">New season · Free cash on delivery</p>
              <h1 className="qk-display mt-5 text-[52px] text-fg sm:text-7xl lg:text-[88px]">
                Good things,
                <span className="block italic text-muted">delivered.</span>
              </h1>
              <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
                Headphones to handlooms, cookware to cricket bats — {totalProducts > 0 ? `${totalProducts} hand-picked products` : 'hand-picked products'} from brands you already trust. Pay when it reaches you.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <button type="button" onClick={scrollToCatalog} className="qk-btn qk-btn-primary h-12 px-7">
                  Start shopping <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { setSortBy('discount-desc'); scrollToCatalog(); }}
                  className="qk-btn qk-btn-ghost h-12 px-7"
                >
                  Today’s deals
                </button>
              </div>
              <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-line pt-6 text-sm">
                <div><dt className="text-muted">Brands</dt><dd className="mt-1 text-lg font-semibold text-fg">90+</dd></div>
                <div><dt className="text-muted">Payment</dt><dd className="mt-1 text-lg font-semibold text-fg">On delivery</dd></div>
                <div><dt className="text-muted">Returns</dt><dd className="mt-1 text-lg font-semibold text-fg">Easy cancel</dd></div>
              </dl>
            </div>

            <div className="grid min-h-[360px] grid-cols-2 grid-rows-2 gap-3 md:gap-4">
              {heroProducts.length === 0
                ? [0, 1, 2].map((i) => (
                    <div key={i} className={`animate-pulse rounded-3xl bg-subtle ${i === 0 ? 'row-span-2' : ''}`} />
                  ))
                : heroProducts.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProduct(p)}
                      className={`group relative overflow-hidden rounded-3xl bg-subtle text-left ${i === 0 ? 'row-span-2' : ''}`}
                    >
                      {p.imageUrl && (
                        <img src={p.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 dark:brightness-[0.9]" />
                      )}
                      <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent" />
                      <span className="absolute inset-x-4 bottom-4 text-white">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="mt-0.5 block text-sm font-semibold opacity-90">{formatPrice(p.price)}</span>
                      </span>
                    </button>
                  ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Category rail ---------- */}
      <section className="qk-container pt-16" aria-labelledby="categories-heading">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="qk-eyebrow">Browse</p>
            <h2 id="categories-heading" className="qk-display mt-1 text-4xl text-fg">Shop by category</h2>
          </div>
        </div>
        <div
          className="qk-scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:overflow-visible md:px-0"
          style={{ gridTemplateColumns: `repeat(${Math.min(categories.length, 9)}, minmax(0, 1fr))` }}
        >
          {categories.map((cat) => {
            const Icon = cat.icon;
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => { setSelectedCategory(cat.id); scrollToCatalog(); }}
                aria-pressed={active}
                className="group flex w-32 shrink-0 flex-col gap-2.5 text-left md:w-auto"
              >
                <span className={`relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-subtle ring-2 transition-all ${active ? 'ring-fg' : 'ring-transparent group-hover:ring-line'}`}>
                  <Icon className="h-6 w-6 text-muted" />
                  <img
                    src={cat.imageUrl || categoryImage(cat.id)}
                    alt=""
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 dark:brightness-[0.9]"
                  />
                </span>
                <span className="px-0.5">
                  <span className={`block text-sm font-semibold leading-tight ${active ? 'text-fg' : 'text-fg/90'}`}>{cat.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{countFor(cat.id)} items</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- Deals ---------- */}
      {isBrowsing && sortBy === 'featured' && dealProducts.length > 0 && (
        <section className="qk-container pt-14" aria-labelledby="deals-heading">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="qk-eyebrow">Limited time</p>
              <h2 id="deals-heading" className="qk-display mt-1 text-4xl text-fg">Today’s best deals</h2>
              <p className="mt-1 text-sm text-muted">The biggest discounts in the store right now.</p>
            </div>
            <button
              type="button"
              onClick={() => { setSortBy('discount-desc'); scrollToCatalog(); }}
              className="flex shrink-0 items-center gap-1 text-sm font-medium text-fg hover:text-accent"
            >
              View all <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-6">
            {dealProducts.map((p) => (
              <ProductCard key={`deal-${p.id}`} product={p} onViewDetails={setSelectedProduct} />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Trending ---------- */}
      {isBrowsing && sortBy === 'featured' && trendingProducts.length > 0 && (
        <section className="qk-container pt-14" aria-labelledby="trending-heading">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="qk-eyebrow">Trending</p>
              <h2 id="trending-heading" className="qk-display mt-1 text-4xl text-fg">Popular right now</h2>
              <p className="mt-1 text-sm text-muted">The products shoppers review and buy the most.</p>
            </div>
            <button
              type="button"
              onClick={() => { setSortBy('popular'); scrollToCatalog(); }}
              className="flex shrink-0 items-center gap-1 text-sm font-medium text-fg hover:text-accent"
            >
              View all <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-6">
            {trendingProducts.map((p) => (
              <ProductCard key={`trend-${p.id}`} product={p} onViewDetails={setSelectedProduct} />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Catalog ---------- */}
      <section id="catalog-results" className="qk-container scroll-mt-20 pb-20 pt-14" aria-labelledby="catalog-heading">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="catalog-heading" className="qk-display text-4xl text-fg">
              {searchQuery.trim() ? 'Search results' : activeCategory.label}
            </h2>
            <p className="mt-1 text-sm text-muted" aria-live="polite">
              {isLoading && !results
                ? 'Loading catalog...'
                : totalResults === 0
                  ? 'No matching items'
                  : `Showing ${firstShown}–${lastShown} of ${totalResults} ${totalResults === 1 ? 'item' : 'items'}`}
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="sticky top-16 z-30 -mx-4 mt-5 border-y border-line bg-bg/85 px-4 py-3 backdrop-blur-xl md:mx-0 md:rounded-2xl md:border md:px-3">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search catalog"
                placeholder="Search in catalog…"
                className="qk-input h-11 rounded-full pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-subtle hover:text-fg"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {isSearchFocused && instantSearchResults.length > 0 && (
                <div className="absolute inset-x-0 top-[calc(100%+8px)] z-40 animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-card">
                  {instantSearchResults.map((prod) => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => { setSelectedProduct(prod); setIsSearchFocused(false); }}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-subtle"
                    >
                      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-subtle">
                        {prod.thumbnailUrl && <img src={prod.thumbnailUrl} alt="" className="h-full w-full object-cover" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{prod.name}</span>
                        <span className="block text-xs text-muted">{prod.category}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-fg">{formatPrice(prod.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="qk-scrollbar-none flex items-center gap-2 overflow-x-auto">
              <select
                aria-label="Category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="qk-input h-11 w-auto shrink-0 cursor-pointer rounded-full pr-8"
              >
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>

              <div className="flex h-11 shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3.5">
                <span className="text-sm text-muted">₹</span>
                {(['min', 'max'] as const).map((bound, i) => (
                  <React.Fragment key={bound}>
                    {i === 1 && <span className="px-1 text-muted">–</span>}
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      aria-label={bound === 'min' ? 'Minimum price' : 'Maximum price'}
                      placeholder={bound === 'min' ? 'Min' : 'Max'}
                      value={priceDraft[bound]}
                      onChange={(e) => setPriceDraft((d) => ({ ...d, [bound]: e.target.value }))}
                      onBlur={applyPrice}
                      onKeyDown={(e) => { if (e.key === 'Enter') applyPrice(); }}
                      className="w-16 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
                    />
                  </React.Fragment>
                ))}
              </div>

              <label className="relative flex shrink-0 items-center">
                <SlidersHorizontal className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted" />
                <select
                  aria-label="Sort by"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="qk-input h-11 w-auto cursor-pointer rounded-full pl-9 pr-8"
                >
                  {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {filterChips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={chip.clear}
                  className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-3 py-1 text-xs font-medium text-fg hover:bg-line"
                  aria-label={`Remove filter ${chip.label}`}
                >
                  {chip.label} <X className="h-3 w-3" />
                </button>
              ))}
              <button type="button" onClick={clearFilters} className="text-xs font-medium text-muted underline-offset-4 hover:text-fg hover:underline">
                Clear all
              </button>
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="mt-6 flex items-center gap-3 rounded-2xl border border-sale/30 bg-sale-soft p-4 text-sm text-sale">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="font-semibold underline">Try again</button>
          </div>
        )}

        <div className="mt-8">
          {isLoading && !results ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-20 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-subtle text-muted">
                <Search className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-fg">No products found</h3>
              <p className="mt-2 max-w-sm text-sm text-muted">Try a different keyword, widen the price range or clear your filters.</p>
              <button type="button" onClick={clearFilters} className="qk-btn qk-btn-primary mt-6">View all products</button>
            </div>
          ) : (
            <>
              <div
                aria-busy={isLoading}
                className={`grid grid-cols-2 gap-x-4 gap-y-8 transition-opacity md:grid-cols-3 md:gap-x-6 lg:grid-cols-4 ${isLoading ? 'opacity-50' : ''}`}
              >
                {products.map((prod) => (
                  <ProductCard key={prod.id} product={prod} onViewDetails={setSelectedProduct} />
                ))}
              </div>

              {totalPages > 1 && (
                <nav aria-label="Catalog pages" className="mt-14 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => goToPage(page - 1)}
                    disabled={page === 0 || isLoading}
                    className="qk-btn qk-btn-ghost"
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>
                  <span className="min-w-24 text-center text-sm text-muted" aria-live="polite">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => goToPage(page + 1)}
                    disabled={results?.last !== false || isLoading}
                    className="qk-btn qk-btn-ghost"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </nav>
              )}
            </>
          )}
        </div>
      </section>

      {productError && (
        <div role="alert" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 animate-rise items-center gap-3 rounded-full border border-line bg-surface px-5 py-3 text-sm shadow-card">
          <span className="text-fg">{productError}</span>
          <button type="button" onClick={() => setSelectedProduct(null)} className="font-semibold text-accent">Back to shopping</button>
        </div>
      )}
      <ProductDetailsModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onDirectCheckout={() => navigate('/checkout')}
        onSelectProduct={(p) => setSelectedProduct(p)}
      />
    </div>
  );
};
