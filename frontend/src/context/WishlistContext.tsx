import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

interface WishlistState {
  ids: Set<number>;
  count: number;
  isSaved: (productId: number) => boolean;
  /** Saves or removes a product; asks guests to sign in. Resolves to the new state. */
  toggle: (productId: number) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const WishlistContext = createContext<WishlistState | null>(null);

/** Customer wishlist ids, shared by product cards, the product dialog, the header and the wishlist page. */
export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, openAuthModal } = useAuth();
  const [ids, setIds] = useState<Set<number>>(new Set());
  const enabled = isAuthenticated && user?.role === 'USER';

  const refresh = useCallback(async () => {
    if (!enabled) {
      setIds(new Set());
      return;
    }
    try {
      setIds(new Set(await api.getWishlistIds()));
    } catch {
      // The heart icons just show as empty if the list can't be loaded.
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh, user?.id]);

  const toggle = useCallback(
    async (productId: number) => {
      if (!isAuthenticated) {
        openAuthModal('login');
        return false;
      }
      const save = !ids.has(productId);
      // Optimistic, rolled back if the server refuses.
      setIds((current) => {
        const next = new Set(current);
        if (save) next.add(productId);
        else next.delete(productId);
        return next;
      });
      try {
        await api.setWishlisted(productId, save);
        return save;
      } catch (err) {
        setIds((current) => {
          const next = new Set(current);
          if (save) next.delete(productId);
          else next.add(productId);
          return next;
        });
        throw err;
      }
    },
    [ids, isAuthenticated, openAuthModal],
  );

  const value = useMemo<WishlistState>(
    () => ({ ids, count: ids.size, isSaved: (id) => ids.has(id), toggle, refresh }),
    [ids, toggle, refresh],
  );
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

/** Safe outside the provider (tests, admin pages): behaves like an empty wishlist. */
export function useWishlist(): WishlistState {
  return (
    useContext(WishlistContext) ?? {
      ids: new Set<number>(),
      count: 0,
      isSaved: () => false,
      toggle: async () => false,
      refresh: async () => undefined,
    }
  );
}
