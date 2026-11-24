import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Gem,
  Home,
  Laptop,
  LayoutGrid,
  RotateCcw,
  Search,
  Shirt,
  ShoppingBasket,
  SlidersHorizontal,
  Truck,
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
      <div className="aspect-square rounded-xl bg-subtle" />
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

  // Links such as /?category=BOOKS#catalog-results (from the Categories page) land on the results,
  // once they have loaded, instead of the top of the page.
  const scrolledToHash = React.useRef(false);
  useEffect(() => {
    if (scrolledToHash.current || !results || location.hash !== '#catalog-results') return;
    scrolledToHash.current = true;
    requestAnimationFrame(() => scrollToCatalog());
  }, [results, location.hash]);

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
        <section className="qk-container pt-4 md:pt-6">
          <div className="relative isolate flex min-h-[440px] items-end overflow-hidden rounded-xl bg-neutral-900 md:min-h-[540px]">
            <img
              src="/categories/all.webp"
              alt=""
              className="absolute inset-0 -z-10 h-full w-full object-cover opacity-90"
            />
            <span className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/30 to-black/0 md:bg-gradient-to-r md:from-black/75 md:via-black/35 md:to-transparent" />
            <div className="w-full animate-rise p-6 sm:p-10 lg:p-14">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">New season · Fresh arrivals</p>
              <h1 className="qk-display mt-4 max-w-2xl text-5xl text-white sm:text-6xl lg:text-7xl">
                Everything you love, delivered fast.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-white/80">
                {totalProducts > 0 ? `${totalProducts} products` : 'Hand-picked products'} from brands you already trust — electronics, fashion, home and more. Pay by UPI, card or cash on delivery.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button type="button" onClick={scrollToCatalog} className="qk-btn h-12 bg-white px-7 text-neutral-950 hover:bg-white/90">
                  Shop all <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { setSortBy('discount-desc'); scrollToCatalog(); }}
                  className="qk-btn h-12 border border-white/40 px-7 text-white hover:bg-white/10"
                >
                  Today’s deals
                </button>
              </div>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-1 divide-y divide-line rounded-xl border border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { icon: Truck, title: 'Free delivery', text: 'On every order, no minimum' },
              { icon: Banknote, title: 'Pay your way', text: 'UPI, card or cash on delivery' },
              { icon: RotateCcw, title: 'Easy cancellation', text: 'Cancel any time before shipping' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-center gap-3 px-5 py-4">
                <Icon className="h-5 w-5 shrink-0 text-fg" />
                <div>
                  <dt className="text-sm font-semibold text-fg">{title}</dt>
                  <dd className="text-xs text-muted">{text}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ---------- Category tiles ---------- */}
      {isBrowsing && (
        <section className="qk-container pt-14" aria-labelledby="categories-heading">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 id="categories-heading" className="qk-display text-2xl text-fg md:text-3xl">Shop by category</h2>
            <button type="button" onClick={() => navigate('/categories')} className="flex shrink-0 items-center gap-1 text-sm font-medium text-fg hover:underline">
              All categories <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="qk-scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0">
            {categories.filter((c) => c.id !== 'ALL').slice(0, 8).map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => { setSelectedCategory(cat.id); scrollToCatalog(); }}
                  aria-pressed={selectedCategory === cat.id}
                  className="group relative isolate grid aspect-[4/3] w-56 shrink-0 place-items-center overflow-hidden rounded-lg bg-subtle text-left md:w-auto"
                >
                  <Icon className="h-7 w-7 text-muted" />
                  <img
                    src={cat.imageUrl || categoryImage(cat.id)}
                    alt=""
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 dark:brightness-[0.85]"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                  <span className="absolute inset-x-4 bottom-3.5 text-white">
                    <span className="block text-base font-semibold leading-tight">{cat.label}</span>
                    <span className="mt-0.5 block text-xs text-white/75">{countFor(cat.id)} items</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------- Deals ---------- */}
      {isBrowsing && sortBy === 'featured' && dealProducts.length > 0 && (
        <section className="qk-container pt-14" aria-labelledby="deals-heading">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 id="deals-heading" className="qk-display text-2xl text-fg md:text-3xl">Today’s best deals</h2>
              <p className="mt-1 text-sm text-muted">The biggest discounts in the store right now.</p>
            </div>
            <button
              type="button"
              onClick={() => { setSortBy('discount-desc'); scrollToCatalog(); }}
              className="flex shrink-0 items-center gap-1 text-sm font-medium text-fg hover:underline"
            >
              View all <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-5">
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
              <h2 id="trending-heading" className="qk-display text-2xl text-fg md:text-3xl">Popular right now</h2>
              <p className="mt-1 text-sm text-muted">The products shoppers review and buy the most.</p>
            </div>
            <button
              type="button"
              onClick={() => { setSortBy('popular'); scrollToCatalog(); }}
              className="flex shrink-0 items-center gap-1 text-sm font-medium text-fg hover:underline"
            >
              View all <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-x-5">
            {trendingProducts.map((p) => (
              <ProductCard key={`trend-${p.id}`} product={p} onViewDetails={setSelectedProduct} />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Catalog ---------- */}
      <section id="catalog-results" className="qk-container scroll-mt-36 pb-20 pt-14" aria-labelledby="catalog-heading">
        <div className="flex flex-col gap-1 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="catalog-heading" className="qk-display text-2xl text-fg md:text-3xl">
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

        <div className="mt-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
          {/* Desktop filter sidebar */}
          <aside className="hidden lg:block" aria-label="Filters">
            <div className="sticky top-40 space-y-8">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-fg">Category</h3>
                <ul className="mt-3 space-y-0.5">
                  {categories.map((cat) => {
                    const active = selectedCategory === cat.id;
                    return (
                      <li key={cat.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                            active ? 'bg-subtle font-semibold text-fg' : 'text-muted hover:text-fg'
                          }`}
                        >
                          <span>{cat.label}</span>
                          <span className="text-xs text-muted">{countFor(cat.id)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-fg">Sort by</h3>
                <ul className="mt-3 space-y-0.5">
                  {sortOptions.map((o) => (
                    <li key={o.value}>
                      <button
                        type="button"
                        onClick={() => setSortBy(o.value)}
                        className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                          sortBy === o.value ? 'bg-subtle font-semibold text-fg' : 'text-muted hover:text-fg'
                        }`}
                      >
                        {o.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>

          <div className="min-w-0">
        {/* Toolbar */}
        <div>
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
                className="qk-input h-10 pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-subtle hover:text-fg"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {isSearchFocused && instantSearchResults.length > 0 && (
                <div className="absolute inset-x-0 top-[calc(100%+6px)] z-40 animate-scale-in overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-card">
                  {instantSearchResults.map((prod) => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => { setSelectedProduct(prod); setIsSearchFocused(false); }}
                      className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-subtle"
                    >
                      <span className="h-10 w-10 shrink-0 overflow-hidden rounded bg-subtle">
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
                className="qk-input h-10 w-auto shrink-0 cursor-pointer pr-8 lg:hidden"
              >
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>

              <div className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-3">
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

              <label className="relative flex shrink-0 items-center lg:hidden">
                <SlidersHorizontal className="pointer-events-none absolute left-3 h-4 w-4 text-muted" />
                <select
                  aria-label="Sort by"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="qk-input h-10 w-auto cursor-pointer pl-9 pr-8"
                >
                  {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {filterChips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={chip.clear}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-fg hover:bg-subtle"
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
          <div role="alert" className="mt-6 flex items-center gap-3 rounded-xl border border-sale/30 bg-sale-soft p-4 text-sm text-sale">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="font-semibold underline">Try again</button>
          </div>
        )}

        <div className="mt-8">
          {isLoading && !results ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-5 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-20 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-xl bg-subtle text-muted">
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
          </div>
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
