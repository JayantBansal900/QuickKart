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
} from '../types';

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

  async getAdminUsers(): Promise<UserAdminResponse[]> {
    const res = await apiFetch(`${API_BASE_URL}/admin/users`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse<unknown>(res);
    return Array.isArray(data) ? data : [];
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

  /** Full catalog for admin screens (admin-only endpoint; the public one is paginated). */
  async getProducts(): Promise<Product[]> {
    const res = await apiFetch(`${API_BASE_URL}/admin/products`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse<unknown>(res);
    return Array.isArray(data) ? data : [];
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

  async updateCartItemQuantity(productId: number, request: UpdateCartItemRequest): Promise<CartResponse> {
    const res = await apiFetch(`${API_BASE_URL}/cart/items/${productId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    });
    return handleResponse<CartResponse>(res);
  },

  async removeFromCart(productId: number): Promise<CartResponse> {
    const res = await apiFetch(`${API_BASE_URL}/cart/items/${productId}`, {
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

  async getAllAdminOrders(): Promise<OrderResponse[]> {
    const res = await apiFetch(`${API_BASE_URL}/admin/orders`, {
      headers: getAuthHeaders(),
    });
    const data = await handleResponse<unknown>(res);
    return Array.isArray(data) ? data : (data && typeof data === 'object' && 'content' in data && Array.isArray(data.content) ? data.content : []);
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
