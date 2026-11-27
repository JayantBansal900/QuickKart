import React from 'react';
import { ProductVariant } from '../types';

/** Distinct colours of a product, in the order they were created. */
export function coloursOf(variants: ProductVariant[]): string[] {
  return [...new Set(variants.map((v) => (v.color ?? '').trim()).filter(Boolean))];
}

/** Sizes in a sensible order: S-XXL and numeric sizes follow their natural order, others keep theirs. */
const ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
export function sizesOf(variants: ProductVariant[], color: string): ProductVariant[] {
  const list = variants.filter((v) => (v.color ?? '').trim() === color);
  return [...list].sort((a, b) => {
    const ia = ORDER.indexOf(a.size.toUpperCase());
    const ib = ORDER.indexOf(b.size.toUpperCase());
    if (ia >= 0 && ib >= 0) return ia - ib;
    const na = Number(a.size);
    const nb = Number(b.size);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return 0;
  });
}

interface VariantPickerProps {
  variants: ProductVariant[];
  color: string;
  size: number | null; // chosen variant id
  onColor: (color: string) => void;
  onSize: (variantId: number) => void;
  /** Waist / UK size wording for the label. */
  sizeLabel?: string;
}

/** Colour swatches (as text chips) and a size row. Sold-out sizes are shown struck through and cannot be picked. */
export const VariantPicker: React.FC<VariantPickerProps> = ({ variants, color, size, onColor, onSize, sizeLabel = 'Size' }) => {
  const colours = coloursOf(variants);
  const sizes = sizesOf(variants, color);
  const chosen = sizes.find((s) => s.id === size);
  return (
    <div className="mt-6 space-y-5">
      {colours.length > 0 && (
        <div role="radiogroup" aria-label="Colour">
          <p className="text-sm text-fg"><span className="font-semibold">Colour</span><span className="text-muted"> · {color}</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {colours.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                onClick={() => onColor(c)}
                className={`rounded-sm border px-3.5 py-2 text-sm transition-colors ${c === color ? 'border-fg bg-fg text-bg' : 'border-line text-fg hover:border-fg'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
      <div role="radiogroup" aria-label={sizeLabel}>
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-fg"><span className="font-semibold">{sizeLabel}</span>{chosen && <span className="text-muted"> · {chosen.size}</span>}</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {sizes.map((s) => {
            const soldOut = s.stockQuantity <= 0;
            const active = s.id === size;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={soldOut ? `${s.size}, sold out` : s.size}
                disabled={soldOut}
                onClick={() => onSize(s.id)}
                className={`min-w-12 rounded-sm border px-3 py-2 text-sm tabular-nums transition-colors ${
                  active ? 'border-fg bg-fg text-bg'
                    : soldOut ? 'cursor-not-allowed border-line text-muted/50 line-through'
                    : 'border-line text-fg hover:border-fg'}`}
              >
                {s.size}
              </button>
            );
          })}
        </div>
        {chosen && chosen.stockQuantity > 0 && chosen.stockQuantity <= 5 && (
          <p className="mt-2 text-xs font-medium text-sale">Only {chosen.stockQuantity} left in {chosen.size}</p>
        )}
      </div>
    </div>
  );
};

/** "Size (UK)" for shoe sizes, "Waist (in)" for jeans and trousers, otherwise "Size". */
export function sizeLabelFor(variants: ProductVariant[]): string {
  const numbers = variants.map((v) => Number(v.size)).filter((n) => !Number.isNaN(n));
  if (numbers.length === 0 || numbers.length !== variants.length) return 'Size';
  return Math.max(...numbers) <= 13 ? 'Size (UK)' : 'Waist (in)';
}
