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
  /** The password was right; finish with the code emailed to the account. */
  mfaRequired?: boolean;
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
  /** Default delivery address, pre-filled at checkout. */
  savedAddress?: string | null;
}

export interface UpdateProfileRequest {
  name: string;
  phoneNumber?: string;
  /** Omit to keep the saved address; '' removes it. */
  savedAddress?: string;
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
  | 'newest'
  | 'popular';

export interface ProductSearchQuery {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  /** Keep products that have this size / colour in stock. */
  variantSize?: string;
  color?: string;
  page?: number;
  size?: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

/** Admin-managed category. `key` is the upper-case name used by the catalog filter. */
export interface Category {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  active: boolean;
  productCount: number;
}

export interface CategoryRequest {
  name: string;
  description?: string;
  imageUrl?: string;
  sortOrder?: number;
  active?: boolean;
}

export interface Review {
  id: number;
  productId: number;
  authorName: string;
  rating: number;
  title?: string | null;
  comment?: string | null;
  verifiedPurchase: boolean;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewEligibility {
  canReview: boolean;
  reason?: string | null;
  myReview?: Review | null;
}

export interface StockMovement {
  id: number;
  change: number;
  stockAfter: number;
  reason: 'ORDER_PLACED' | 'ORDER_CANCELLED' | 'RESTOCK' | 'CORRECTION' | 'ADMIN_EDIT' | 'INITIAL_STOCK' | string;
  reference?: string | null;
  actor?: string | null;
  createdAt: string;
}

export interface AnalyticsInsights {
  days: number;
  revenue: number;
  orders: number;
  averageOrderValue: number;
  newCustomers: number;
  daily: { date: string; revenue: number; orders: number; registrations: number }[];
  ordersByStatus: { name: string; count: number }[];
  paymentMethods: { name: string; count: number }[];
  topProducts: { productId: number; name: string; units: number; revenue: number }[];
  categories: { category: string; units: number; revenue: number }[];
}

/** One dependency in the admin System Status page. */
export interface ComponentStatus {
  /** Opens the troubleshooting view: postgres, redis, kafka, product-service, order-service, outbox. */
  key: string;
  name: string;
  status: 'UP' | 'DOWN';
  latencyMs: number;
  detail: string;
}

export interface ComponentDetail {
  key: string;
  name: string;
  status: 'UP' | 'DOWN';
  latencyMs: number;
  facts: { label: string; value: string }[];
  problems: string[];
  advice: string[];
  actions: { id: string; label: string; description: string }[];
  checkedAt: string;
}

export interface ComponentActionResult {
  component: string;
  action: string;
  message: string;
  ranAt: string;
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
  /** Sizes and colours, each with its own stock. Empty for one-size products (a wallet, a cap). */
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id: number;
  size: string;
  color?: string | null;
  stockQuantity: number;
}

export interface VariantInput {
  size: string;
  color?: string;
  stockQuantity: number;
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
  /** When set, these sizes replace the product stock (the total becomes their sum). */
  variants?: VariantInput[];
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
  variantId?: number | null;
  size?: string | null;
  color?: string | null;
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
  variantId?: number;
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
  size?: string | null;
  color?: string | null;
}

export interface OrderResponse {
  id: number;
  userId: number;
  userEmail?: string;
  orderDate?: string;
  createdAt?: string;
  status: OrderStatus;
  totalAmount: number;
  paymentMethod?: string;
  paymentStatus?: string;
  recipientName?: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellable?: boolean;
  /** Online order waiting for (or retrying) payment. */
  payable?: boolean;
  subtotalAmount?: number;
  discountAmount?: number;
  couponCode?: string | null;
  courier?: string | null;
  trackingNumber?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  /** REQUESTED / APPROVED / REJECTED once the customer asked to return it. */
  returnStatus?: 'REQUESTED' | 'APPROVED' | 'REJECTED' | null;
  returnable?: boolean;
  items: OrderItemResponse[];
}

export type OrderStatus =
  | 'PENDING'
  | 'PLACED'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

export interface Coupon {
  id: number;
  code: string;
  description?: string | null;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  maxDiscount?: number | null;
  minOrderAmount: number;
  usageLimit?: number | null;
  usedCount: number;
  oncePerCustomer: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
  active: boolean;
}

export interface CouponRequest {
  code: string;
  description?: string;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  maxDiscount?: number | null;
  minOrderAmount?: number;
  usageLimit?: number | null;
  oncePerCustomer?: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
  active?: boolean;
}

export interface CouponQuote {
  code: string;
  description?: string | null;
  subtotal: number;
  discount: number;
  total: number;
}

export type ReturnReason = 'DAMAGED' | 'WRONG_ITEM' | 'NOT_AS_DESCRIBED' | 'NO_LONGER_NEEDED' | 'OTHER';

export interface OrderReturn {
  id: number;
  orderId: number;
  reason: ReturnReason;
  comment?: string | null;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED';
  adminNote?: string | null;
  requestedAt: string;
  resolvedAt?: string | null;
  order: OrderResponse;
}

export interface AdminCart {
  cartId: number;
  userId: number;
  customerName: string;
  customerEmail: string;
  itemCount: number;
  total: number;
  updatedAt?: string | null;
  items: { productId: number; productName: string; quantity: number; price: number }[];
}

export type PaymentMethod = 'COD' | 'UPI' | 'CARD';

export interface CheckoutRequest {
  paymentMethod: PaymentMethod;
  couponCode?: string;
  idempotencyKey: string;
  cartFingerprint: string;
  recipientName: string;
  deliveryAddress: string;
  deliveryPhone: string;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
  /** Required when shipping. */
  courier?: string;
  trackingNumber?: string;
}
