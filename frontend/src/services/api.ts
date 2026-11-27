import {
  AuthResponse,
  User,
  UserProfileResponse,
  UpdateProfileRequest,
  UserAdminResponse,
  AdminAnalyticsResponse,
  VerifyOtpRequest,
  ResendOtpRequest,
  Product,
  ProductRequest,
  CartResponse,
  AddCartItemRequest,
  UpdateCartItemRequest,
  OrderResponse,
  CheckoutRequest,
  UpdateOrderStatusRequest,
  SystemStatusResponse,
  PageResponse,
  ProductSearchQuery,
  CategoryCount,
  Category,
  CategoryRequest,
  Review,
  ReviewEligibility,
  StockMovement,
  AnalyticsInsights,
  PaymentMethod,
  Coupon,
  CouponRequest,
  CouponQuote,
  OrderReturn,
  AdminCart,
  ReturnReason,
} from '../types';

/** Builds "?a=1&b=2" from the defined, non-empty values. */
function queryString(params: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  }
  const text = qs.toString();
  return text ? `?${text}` : '';
}

export interface AdminPageQuery {
  q?: string;
  page?: number;
  size?: number;
}

import { API_BASE_URL, apiFetch, handleResponse, TOKEN_KEY } from './http';
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export const api = {
  // ─── Auth API ───────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await apiFetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await handleResponse<AuthResponse>(res);

    return data;
  },

  /** Second sign-in step: the emailed code gives the session. */
  async verifyLogin(email: string, otp: string): Promise<AuthResponse> {
    const res = await apiFetch(`${API_BASE_URL}/auth/login/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });
    return handleResponse<AuthResponse>(res);
  },

  async register(
    name: string,
    email: string,
    password: string,
    phoneNumber?: string
  ): Promise<AuthResponse> {
    const res = await apiFetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, phoneNumber }),
    });
    const data = await handleResponse<AuthResponse>(res);
    // Registration has no authentication token; verification is required.

    return data;
  },

  async verifyOtp(request: VerifyOtpRequest): Promise<AuthResponse> {
    const res = await apiFetch(`${API_BASE_URL}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data = await handleResponse<AuthResponse>(res);

    return data;
  },

  async resendOtp(request: ResendOtpRequest): Promise<{ message: string }> {
    const res = await apiFetch(`${API_BASE_URL}/auth/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return handleResponse<{ message: string }>(res);
  },

  /** Always resolves with the same message, whether or not the account exists. */
  async forgotPassword(request: { email: string }): Promise<{ message: string }> {
    const res = await apiFetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return handleResponse<{ message: string }>(res);
  },

  async resetPassword(request: { email: string; otp: string; newPassword: string }): Promise<{ message: string }> {
    const res = await apiFetch(`${API_BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return handleResponse<{ message: string }>(res);
  },

  // ─── User Profile API ────────────────────────────────────────────────────────

  async getMyProfile(): Promise<UserProfileResponse> {
    const res = await apiFetch(`${API_BASE_URL}/user/profile`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<UserProfileResponse>(res);
  },

  async updateMyProfile(request: UpdateProfileRequest): Promise<UserProfileResponse> {
    const res = await apiFetch(`${API_BASE_URL}/user/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });
    return handleResponse<UserProfileResponse>(res);
  },

  // ─── Admin User Management API ───────────────────────────────────────────────

  /** Paged, newest first. */
  async getAdminUsers(query: AdminPageQuery & { role?: string; status?: string } = {}): Promise<PageResponse<UserAdminResponse>> {
    const res = await apiFetch(`${API_BASE_URL}/admin/users${queryString({ ...query })}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<PageResponse<UserAdminResponse>>(res);
  },

  async getAdminUserById(id: number): Promise<UserAdminResponse> {
    const res = await apiFetch(`${API_BASE_URL}/admin/users/${id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<UserAdminResponse>(res);
  },

  async updateAdminUserStatus(id: number, status: string): Promise<UserAdminResponse> {
    const res = await apiFetch(`${API_BASE_URL}/admin/users/${id}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    return handleResponse<UserAdminResponse>(res);
  },

  // ─── Admin Analytics API ─────────────────────────────────────────────────────

  async getAdminAnalytics(): Promise<AdminAnalyticsResponse> {
    const res = await apiFetch(`${API_BASE_URL}/admin/analytics`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<AdminAnalyticsResponse>(res);
  },

  async getAnalyticsInsights(days = 30): Promise<AnalyticsInsights> {
    const res = await apiFetch(`${API_BASE_URL}/admin/analytics/insights?days=${days}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<AnalyticsInsights>(res);
  },

  // ─── Categories ──────────────────────────────────────────────────────────────

  /** Active categories for the storefront, in display order, with product counts. */
  async getCategories(): Promise<Category[]> {
    const res = await apiFetch(`${API_BASE_URL}/categories`);
    const data = await handleResponse<unknown>(res);
    return Array.isArray(data) ? data : [];
  },

  async getAdminCategories(): Promise<Category[]> {
    const res = await apiFetch(`${API_BASE_URL}/admin/categories`, { headers: getAuthHeaders() });
    const data = await handleResponse<unknown>(res);
    return Array.isArray(data) ? data : [];
  },

  async createCategory(request: CategoryRequest): Promise<Category> {
    const res = await apiFetch(`${API_BASE_URL}/admin/categories`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });
    return handleResponse<Category>(res);
  },

  async updateCategory(id: number, request: CategoryRequest): Promise<Category> {
    const res = await apiFetch(`${API_BASE_URL}/admin/categories/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });
    return handleResponse<Category>(res);
  },

  async deleteCategory(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE_URL}/admin/categories/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    return handleResponse<void>(res);
  },

  // ─── Reviews ─────────────────────────────────────────────────────────────────

  async getReviews(productId: number, page = 0, size = 5): Promise<PageResponse<Review>> {
    const res = await apiFetch(`${API_BASE_URL}/products/${productId}/reviews?page=${page}&size=${size}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<PageResponse<Review>>(res);
  },

  async getReviewEligibility(productId: number): Promise<ReviewEligibility> {
    const res = await apiFetch(`${API_BASE_URL}/products/${productId}/reviews/eligibility`, { headers: getAuthHeaders() });
    return handleResponse<ReviewEligibility>(res);
  },

  async saveReview(productId: number, review: { rating: number; title?: string; comment?: string }): Promise<Review> {
    const res = await apiFetch(`${API_BASE_URL}/products/${productId}/reviews`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(review),
    });
    return handleResponse<Review>(res);
  },

  async deleteReview(productId: number, reviewId: number): Promise<void> {
    const res = await apiFetch(`${API_BASE_URL}/products/${productId}/reviews/${reviewId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<void>(res);
  },

  // ─── Admin System Status API ─────────────────────────────────────────────────

  async getSystemStatus(): Promise<SystemStatusResponse> {
    const res = await apiFetch(`${API_BASE_URL}/admin/system/status`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<SystemStatusResponse>(res);
  },

  // ─── Admin Inventory API ─────────────────────────────────────────────────────

  /** Relative change: +n restocks, -n corrects. Server rejects results below zero. */
  async adjustStock(id: number, adjustment: number): Promise<Product> {
    const res = await apiFetch(`${API_BASE_URL}/admin/products/${id}/stock`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ adjustment }),
    });
    return handleResponse<Product>(res);
  },

  // ─── Product API ─────────────────────────────────────────────────────────────

  /**
   * Storefront catalog search. Filtering, sorting and pagination run on the server; only the
   * requested page comes back. Empty/default values are left out of the URL.
   */
  async searchProducts(query: ProductSearchQuery = {}, signal?: AbortSignal): Promise<PageResponse<Product>> {
    const params = new URLSearchParams();
    if (query.q?.trim()) params.set('q', query.q.trim());
    if (query.category && query.category !== 'ALL') params.set('category', query.category);
    if (query.minPrice != null) params.set('minPrice', String(query.minPrice));
    if (query.maxPrice != null) params.set('maxPrice', String(query.maxPrice));
    if (query.sort && query.sort !== 'featured') params.set('sort', query.sort);
    if (query.variantSize) params.set('variantSize', query.variantSize);
    if (query.color) params.set('color', query.color);
    if (query.page) params.set('page', String(query.page));
    if (query.size) params.set('size', String(query.size));
    const qs = params.toString();
    const res = await apiFetch(`${API_BASE_URL}/products${qs ? `?${qs}` : ''}`, { signal });
    return handleResponse<PageResponse<Product>>(res);
  },

  async getCategoryCounts(): Promise<CategoryCount[]> {
    const res = await apiFetch(`${API_BASE_URL}/products/categories`);
    const data = await handleResponse<unknown>(res);
    return Array.isArray(data) ? data : [];
  },

  /** Admin catalog page (includes discontinued). stock: ALL | LOW | OUT; sort: newest | stock. */
  async getAdminProducts(
    query: AdminPageQuery & { category?: string; stock?: 'ALL' | 'LOW' | 'OUT'; sort?: 'newest' | 'stock' } = {},
  ): Promise<PageResponse<Product>> {
    const res = await apiFetch(`${API_BASE_URL}/admin/products${queryString({ ...query })}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<PageResponse<Product>>(res);
  },

  async getStockMovements(productId: number, page = 0, size = 10): Promise<PageResponse<StockMovement>> {
    const res = await apiFetch(`${API_BASE_URL}/admin/products/${productId}/stock-movements?page=${page}&size=${size}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<PageResponse<StockMovement>>(res);
  },

  async getProductById(id: number): Promise<Product> {
    const res = await apiFetch(`${API_BASE_URL}/products/${id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<Product>(res);
  },

  async createProduct(product: ProductRequest): Promise<Product> {
    const res = await apiFetch(`${API_BASE_URL}/admin/products`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(product),
    });
    return handleResponse<Product>(res);
  },

  async updateProduct(id: number, product: ProductRequest): Promise<Product> {
    const res = await apiFetch(`${API_BASE_URL}/admin/products/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(product),
    });
    return handleResponse<Product>(res);
  },

  /** Uploads a product photo (JPEG/PNG/WebP, max 3 MB). The server checks the file's real type. */
  async uploadProductImage(id: number, file: File): Promise<Product> {
    const token = localStorage.getItem(TOKEN_KEY);
    const body = new FormData();
    body.append('file', file);
    // No Content-Type header: the browser sets multipart/form-data with the right boundary.
    const res = await apiFetch(`${API_BASE_URL}/admin/products/${id}/image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    return handleResponse<Product>(res);
  },

  async deleteProduct(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE_URL}/admin/products/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<void>(res);
  },

  // ─── Cart API ────────────────────────────────────────────────────────────────

  async getCart(): Promise<CartResponse> {
    const res = await apiFetch(`${API_BASE_URL}/cart`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<CartResponse>(res);
  },

  async addToCart(item: AddCartItemRequest): Promise<CartResponse> {
    const res = await apiFetch(`${API_BASE_URL}/cart/items`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(item),
    });
    return handleResponse<CartResponse>(res);
  },

  async updateCartItemQuantity(productId: number, request: UpdateCartItemRequest, variantId?: number | null): Promise<CartResponse> {
    const res = await apiFetch(`${API_BASE_URL}/cart/items/${productId}${variantId ? `?variantId=${variantId}` : ''}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });
    return handleResponse<CartResponse>(res);
  },

  async removeFromCart(productId: number, variantId?: number | null): Promise<CartResponse> {
    const res = await apiFetch(`${API_BASE_URL}/cart/items/${productId}${variantId ? `?variantId=${variantId}` : ''}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<CartResponse>(res);
  },

  async clearCart(): Promise<CartResponse> {
    const res = await apiFetch(`${API_BASE_URL}/cart`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<CartResponse>(res);
  },

  // ─── Order API ───────────────────────────────────────────────────────────────

  async checkout(request: CheckoutRequest): Promise<OrderResponse> {
    const res = await apiFetch(`${API_BASE_URL}/orders/checkout`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });
    return handleResponse<OrderResponse>(res);
  },

  /** Payment methods checkout accepts right now (COD always; UPI/CARD only while the simulated gateway is on). */
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const res = await apiFetch(`${API_BASE_URL}/orders/payment-methods`, { headers: getAuthHeaders() });
    const data = await handleResponse<{ methods?: PaymentMethod[] }>(res);
    return Array.isArray(data?.methods) ? data.methods : ['COD'];
  },

  // ─── Coupons ─────────────────────────────────────────────────────────────────

  async getOffers(): Promise<Coupon[]> {
    const res = await apiFetch(`${API_BASE_URL}/cart/offers`, { headers: getAuthHeaders() });
    const data = await handleResponse<unknown>(res);
    return Array.isArray(data) ? data : [];
  },

  /** What a coupon would take off the current cart (nothing is reserved). */
  async previewCoupon(code: string): Promise<CouponQuote> {
    const res = await apiFetch(`${API_BASE_URL}/cart/coupon`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ code }),
    });
    return handleResponse<CouponQuote>(res);
  },

  async getAdminCoupons(): Promise<Coupon[]> {
    const res = await apiFetch(`${API_BASE_URL}/admin/coupons`, { headers: getAuthHeaders() });
    const data = await handleResponse<unknown>(res);
    return Array.isArray(data) ? data : [];
  },

  async saveCoupon(request: CouponRequest, id?: number): Promise<Coupon> {
    const res = await apiFetch(`${API_BASE_URL}/admin/coupons${id ? `/${id}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });
    return handleResponse<Coupon>(res);
  },

  async deleteCoupon(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE_URL}/admin/coupons/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    return handleResponse<void>(res);
  },

  // ─── Returns ─────────────────────────────────────────────────────────────────

  async requestReturn(orderId: number, reason: ReturnReason, comment?: string): Promise<OrderResponse> {
    const res = await apiFetch(`${API_BASE_URL}/orders/${orderId}/return`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason, comment }),
    });
    return handleResponse<OrderResponse>(res);
  },

  async getAdminReturns(status = 'REQUESTED', page = 0): Promise<PageResponse<OrderReturn>> {
    const res = await apiFetch(`${API_BASE_URL}/admin/returns${queryString({ status, page, size: 25 })}`, { headers: getAuthHeaders() });
    return handleResponse<PageResponse<OrderReturn>>(res);
  },

  async resolveReturn(id: number, decision: 'APPROVE' | 'REJECT', note?: string): Promise<OrderReturn> {
    const res = await apiFetch(`${API_BASE_URL}/admin/returns/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ decision, note }),
    });
    return handleResponse<OrderReturn>(res);
  },

  // ─── Admin: open carts ───────────────────────────────────────────────────────

  async getAdminCarts(): Promise<AdminCart[]> {
    const res = await apiFetch(`${API_BASE_URL}/admin/carts`, { headers: getAuthHeaders() });
    const data = await handleResponse<unknown>(res);
    return Array.isArray(data) ? data : [];
  },

  // ─── Wishlist ────────────────────────────────────────────────────────────────

  async getWishlist(): Promise<Product[]> {
    const res = await apiFetch(`${API_BASE_URL}/wishlist`, { headers: getAuthHeaders() });
    const data = await handleResponse<unknown>(res);
    return Array.isArray(data) ? data : [];
  },

  async getWishlistIds(): Promise<number[]> {
    const res = await apiFetch(`${API_BASE_URL}/wishlist/ids`, { headers: getAuthHeaders() });
    const data = await handleResponse<unknown>(res);
    return Array.isArray(data) ? data : [];
  },

  async setWishlisted(productId: number, saved: boolean): Promise<void> {
    const res = await apiFetch(`${API_BASE_URL}/wishlist/${productId}`, { method: saved ? 'PUT' : 'DELETE', headers: getAuthHeaders() });
    return handleResponse<void>(res);
  },

  /** Simulated payment gateway (test mode): no card data is sent, the outcome is chosen by the caller. */
  async payOrder(id: number, outcome: 'SUCCESS' | 'FAILURE' = 'SUCCESS'): Promise<OrderResponse> {
    const res = await apiFetch(`${API_BASE_URL}/orders/${id}/pay`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ outcome }),
    });
    return handleResponse<OrderResponse>(res);
  },

  async cancelOrder(id: number): Promise<OrderResponse> {
    const response = await apiFetch(`${API_BASE_URL}/orders/${id}/cancel`, {method:'POST',headers:getAuthHeaders()});
    return handleResponse<OrderResponse>(response);
  },

  async getMyOrders(): Promise<OrderResponse[]> {
    const res = await apiFetch(`${API_BASE_URL}/orders`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse<unknown>(res);
    return Array.isArray(data) ? data : (data && typeof data === 'object' && 'content' in data && Array.isArray(data.content) ? data.content : []);
  },

  async getOrderById(id: number): Promise<OrderResponse> {
    const res = await apiFetch(`${API_BASE_URL}/orders/${id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<OrderResponse>(res);
  },

  /** Paged, newest first; q matches order #, customer email or recipient. */
  async getAdminOrders(query: AdminPageQuery & { status?: string } = {}): Promise<PageResponse<OrderResponse>> {
    const res = await apiFetch(`${API_BASE_URL}/admin/orders${queryString({ ...query })}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<PageResponse<OrderResponse>>(res);
  },

  async updateOrderStatus(id: number, request: UpdateOrderStatusRequest): Promise<OrderResponse> {
    const res = await apiFetch(`${API_BASE_URL}/admin/orders/${id}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });
    return handleResponse<OrderResponse>(res);
  },
};
