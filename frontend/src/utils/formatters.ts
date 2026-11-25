/**
 * Formats a monetary amount into canonical Indian Rupee (INR) currency representation.
 * Uses en-IN locale with symbol ₹ (e.g. ₹1,299.00 or ₹25.50).
 */
export const formatINR = (amount: number | null | undefined): string => {
  const value = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Storefront display price: whole rupees without ".00" (₹4,699), paise only when present (₹25.50).
 * Use formatINR where exact two-decimal totals matter (cart, checkout, orders).
 */
export const formatPrice = (amount: number | null | undefined): string => {
  const value = Number(amount) || 0;
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(whole ? Math.round(value) : value);
};

/** "M · Navy" for a line that has a size and/or colour, or an empty string. */
export function variantLabel(item: { size?: string | null; color?: string | null }): string {
  return [item.size, item.color].filter(Boolean).join(' · ');
}
