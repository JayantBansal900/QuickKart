export interface User {
  id: number;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  phoneNumber?: string;
  emailVerified?: boolean;
  accountStatus?: string;
}

export interface AuthResponse {
  token: string | null;
  type?: string;
  id: number;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  phoneNumber?: string;
  emailVerified?: boolean;
  accountStatus?: string;
  message?: string;
}

export interface VerifyOtpRequest {
  email: string;
  otp: string;
}

export interface ResendOtpRequest {
  email: string;
}

export interface UserProfileResponse {
  id: number;
  name: string;
  email: string;
  phoneNumber?: string;
  role: 'USER' | 'ADMIN';
  emailVerified: boolean;
  accountStatus: string;
  createdAt?: string;
}

export interface UpdateProfileRequest {
  name: string;
  phoneNumber?: string;
}

export interface UserAdminResponse {
  id: number;
  name: string;
  email: string;
  phoneNumber?: string;
  role: 'USER' | 'ADMIN';
  emailVerified: boolean;
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | 'PENDING_VERIFICATION';
  createdAt?: string;
  lastLoginAt?: string;
}

/** Server-side paginated result (matches product-service PageResponse). */
export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}

export type ProductSort =
  | 'featured'
  | 'price-asc'
  | 'price-desc'
  | 'discount-desc'
  | 'rating-desc'
  | 'name'
  | 'newest';

export interface ProductSearchQuery {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  page?: number;
  size?: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

/** One dependency in the admin System Status page. */
export interface ComponentStatus {
  name: string;
  status: 'UP' | 'DOWN';
  latencyMs: number;
  detail: string;
}

export interface SystemStatusResponse {
  overall: 'UP' | 'DEGRADED';
  checkedAt: string;
  components: ComponentStatus[];
}

export interface AdminAnalyticsResponse {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalOrders: number;
  /** Value of all non-cancelled orders, including COD not yet collected. */
  totalRevenue: number;
  /** COD payments actually collected (orders delivered). */
  collectedRevenue: number;
  totalUsers: number;
  verifiedUsersCount: number;
  pendingOrdersCount: number;
}

export interface Product {
  id: number;
  name: string;
  brand?: string;
  description: string;
  price: number;
  discountPercentage?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  stockQuantity: number;
  category?: string;
  sku?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  availability?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductRequest {
  name: string;
  brand?: string;
  description: string;
  price: number;
  discountPercentage?: number;
  rating?: number;
  reviewCount?: number;
  stockQuantity: number;
  category?: string;
  sku?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  availability?: string;
}

export interface CartItemResponse {
  id?: number;
  productId: number;
  productName: string;
  price: number;
  availableQuantity?: number;
  quantity: number;
  subtotal: number;
  imageUrl?: string;
}

export interface CartResponse {
  cartId: number;
  fingerprint: string;
  items: CartItemResponse[];
  totalAmount: number;
}

export interface AddCartItemRequest {
  productId: number;
  quantity: number;
}

export interface UpdateCartItemRequest {
  quantity: number;
}

export interface OrderItemResponse {
  id?: number;
  productId: number;
  productName: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface OrderResponse {
  id: number;
  userId: number;
  userEmail?: string;
  orderDate?: string;
  createdAt?: string;
  status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  totalAmount: number;
  paymentMethod?: string;
  paymentStatus?: string;
  recipientName?: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellable?: boolean;
  items: OrderItemResponse[];
}

export interface CheckoutRequest {
  paymentMethod: 'COD';
  idempotencyKey: string;
  cartFingerprint: string;
  recipientName: string;
  deliveryAddress: string;
  deliveryPhone: string;
}

export interface UpdateOrderStatusRequest {
  status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
}
