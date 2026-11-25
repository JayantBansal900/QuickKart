import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, UploadCloud, X } from 'lucide-react';
import { Product, ProductRequest } from '../types';

/** Used until the admin category list has loaded. */
const DEFAULT_CATEGORIES = ['T-Shirts', 'Shirts', 'Jeans', 'Trousers', 'Jackets', 'Hoodies & Sweatshirts', 'Footwear', 'Accessories'];

/** One-click size sets for the usual kinds of product. */
const SIZE_PRESETS = [
  { label: 'S – XXL', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { label: 'Waist 28 – 36', sizes: ['28', '30', '32', '34', '36'] },
  { label: 'UK 6 – 11', sizes: ['6', '7', '8', '9', '10', '11'] },
];

type VariantRow = { size: string; color: string; stock: string };
const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

interface AdminProductModalProps {
  isOpen: boolean;
  product: Product | null;
  /** Category names from the admin Categories page. */
  categories?: string[];
  onClose: () => void;
  /** Saves the product fields and, when a photo was chosen, uploads it afterwards. */
  onSubmit: (productData: ProductRequest, photo: File | null) => Promise<void>;
}

type FormState = {
  name: string; brand: string; sku: string; description: string; category: string;
  price: string; discountPercentage: string; stockQuantity: string; rating: string; reviewCount: string;
};

const empty: FormState = {
  name: '', brand: 'VAYU', sku: '', description: '', category: 'T-Shirts',
  price: '', discountPercentage: '', stockQuantity: '', rating: '', reviewCount: '',
};

function fromProduct(p: Product): FormState {
  return {
    name: p.name, brand: p.brand || '', sku: p.sku || '', description: p.description || '',
    category: p.category || 'T-Shirts', price: String(p.price ?? ''),
    discountPercentage: String(p.discountPercentage ?? ''), stockQuantity: String(p.stockQuantity ?? ''),
    rating: p.rating != null ? String(p.rating) : '', reviewCount: p.reviewCount != null ? String(p.reviewCount) : '',
  };
}

export const AdminProductModal: React.FC<AdminProductModalProps> = ({ isOpen, product, categories, onClose, onSubmit }) => {
  const CATEGORIES = categories && categories.length ? categories : DEFAULT_CATEGORIES;
  const [form, setForm] = useState<FormState>(empty);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [presetColour, setPresetColour] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(product ? fromProduct(product) : empty);
    setRows((product?.variants ?? []).map((v) => ({ size: v.size, color: v.color ?? '', stock: String(v.stockQuantity) })));
    setPresetColour('');
    setPhoto(null);
    setPreview(null);
    setError(null);
  }, [product, isOpen]);

  // Revoke object URLs so previews don't leak memory.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isSaving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen) return null;

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return setError('Choose a JPEG, PNG or WebP image.');
    if (file.size > MAX_BYTES) return setError('That image is larger than 3 MB.');
    setError(null);
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  };

  const currentImage = preview || product?.imageUrl || null;
  const hasSizes = rows.length > 0;
  const sizeTotal = rows.reduce((sum, r) => sum + (Number(r.stock) || 0), 0);
  const updateRow = (index: number, patch: Partial<VariantRow>) => setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addPreset = (sizes: string[]) =>
    setRows((list) => [
      ...list,
      ...sizes
        .filter((size) => !list.some((r) => r.size.toLowerCase() === size.toLowerCase() && r.color.trim().toLowerCase() === presetColour.trim().toLowerCase()))
        .map((size) => ({ size, color: presetColour.trim(), stock: '10' })),
    ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    const usable = rows.filter((r) => r.size.trim());
    const keys = usable.map((r) => `${r.size.trim().toLowerCase()}|${r.color.trim().toLowerCase()}`);
    if (new Set(keys).size !== keys.length) {
      setError('Each size and colour can only appear once.');
      setIsSaving(false);
      return;
    }
    try {
      await onSubmit(
        {
          name: form.name.trim(),
          brand: form.brand.trim() || undefined,
          sku: form.sku.trim() || undefined,
          description: form.description.trim(),
          category: form.category,
          price: Number(form.price),
          discountPercentage: form.discountPercentage !== '' ? Number(form.discountPercentage) : undefined,
          stockQuantity: usable.length ? usable.reduce((sum, r) => sum + (Number(r.stock) || 0), 0) : Number(form.stockQuantity),
          variants: usable.length ? usable.map((r) => ({ size: r.size.trim(), color: r.color.trim() || undefined, stockQuantity: Math.max(0, Math.floor(Number(r.stock) || 0)) })) : undefined,
          rating: form.rating !== '' ? Number(form.rating) : undefined,
          reviewCount: form.reviewCount !== '' ? Number(form.reviewCount) : undefined,
          // Keep the existing picture unless a new photo is uploaded right after saving.
          imageUrl: product?.imageUrl ?? undefined,
          thumbnailUrl: product?.thumbnailUrl ?? undefined,
        },
        photo,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !isSaving) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-card animate-scale-in sm:rounded-xl"
      >
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 id="product-modal-title" className="text-lg font-semibold tracking-tight text-fg">
              {product ? 'Edit product' : 'New product'}
            </h2>
            <p className="text-xs text-muted">{product ? `#${product.id} · ${product.sku || 'no SKU'}` : 'Add it to the catalog with a photo, price and stock.'}</p>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-subtle hover:text-fg">
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="grid flex-1 gap-6 overflow-y-auto p-6 md:grid-cols-[280px_1fr]">
          {/* Photo */}
          <div className="space-y-3">
            <span className="qk-label">Photo</span>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files?.[0]); }}
              onClick={() => fileInput.current?.click()}
              className={`group relative grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed transition-colors ${
                dragging ? 'border-accent bg-accent-soft' : 'border-line bg-subtle hover:border-muted'
              }`}
            >
              {currentImage ? (
                <>
                  <img src={currentImage} alt="" className="h-full w-full object-cover" />
                  <span className="absolute inset-x-3 bottom-3 rounded-full bg-black/60 py-1.5 text-center text-xs font-medium text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                    Click or drop to replace
                  </span>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 px-6 text-center text-muted">
                  <UploadCloud className="h-8 w-8" strokeWidth={1.5} />
                  <p className="text-sm font-medium text-fg">Drop a photo here</p>
                  <p className="text-xs">or click to browse · JPEG, PNG, WebP · up to 3 MB</p>
                </div>
              )}
            </div>
            <input ref={fileInput} type="file" accept={ACCEPTED.join(',')} className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
            {photo ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-subtle px-3 py-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-fg"><ImagePlus className="h-4 w-4 flex-none text-accent" /><span className="truncate">{photo.name}</span></span>
                <button type="button" aria-label="Remove chosen photo" onClick={() => { setPhoto(null); setPreview(null); }} className="text-muted hover:text-sale">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted">Square photos on a plain background look best.</p>
            )}
          </div>

          {/* Fields */}
          <div className="space-y-5">
            {error && <div role="alert" className="rounded-xl bg-sale-soft px-4 py-3 text-sm text-sale">{error}</div>}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="qk-label sm:col-span-2">Product name
                <input className="qk-input" required maxLength={255} value={form.name} onChange={set('name')} placeholder="VAYU Essential Crew Tee" />
              </label>
              <label className="qk-label">Brand
                <input className="qk-input" value={form.brand} onChange={set('brand')} placeholder="VAYU" />
              </label>
              <label className="qk-label">Category
                <select className="qk-input cursor-pointer" value={form.category} onChange={set('category')}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="qk-label">Price (₹)
                <input className="qk-input" type="number" required min="1" step="1" value={form.price} onChange={set('price')} placeholder="26990" />
              </label>
              <label className="qk-label">Discount (%)
                <input className="qk-input" type="number" min="0" max="90" step="1" value={form.discountPercentage} onChange={set('discountPercentage')} placeholder="10" />
              </label>
              <label className="qk-label">Stock
                <input className="qk-input" type="number" required min="0" step="1" value={hasSizes ? String(sizeTotal) : form.stockQuantity} onChange={set('stockQuantity')} readOnly={hasSizes} title={hasSizes ? 'The total of the sizes below' : undefined} placeholder="50" />
              </label>
            </div>

            <fieldset className="rounded-xl border border-line p-4">
              <legend className="px-1 text-sm font-medium text-fg">Sizes &amp; colours</legend>
              <p className="text-xs text-muted">{hasSizes ? `Stock is the total of the sizes: ${sizeTotal}. A size you remove is set to 0 (past orders keep it).` : 'Leave empty for one-size products such as a wallet or a cap.'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input aria-label="Colour for new sizes" className="qk-input h-9 w-40" value={presetColour} onChange={(e) => setPresetColour(e.target.value)} placeholder="Colour (e.g. Navy)" maxLength={40} />
                {SIZE_PRESETS.map((p) => (
                  <button key={p.label} type="button" onClick={() => addPreset(p.sizes)} className="rounded-sm border border-line px-2.5 py-1.5 text-xs text-fg hover:border-fg">+ {p.label}</button>
                ))}
                <button type="button" onClick={() => setRows((list) => [...list, { size: '', color: presetColour.trim(), stock: '10' }])} className="rounded-sm border border-line px-2.5 py-1.5 text-xs text-fg hover:border-fg">+ One size row</button>
              </div>
              {hasSizes && (
                <ul className="mt-3 space-y-2">
                  {rows.map((r, i) => (
                    <li key={i} className="grid grid-cols-[1fr_1.4fr_1fr_auto] items-center gap-2">
                      <input aria-label={`Size ${i + 1}`} className="qk-input h-9" value={r.size} onChange={(e) => updateRow(i, { size: e.target.value })} placeholder="Size" maxLength={20} />
                      <input aria-label={`Colour ${i + 1}`} className="qk-input h-9" value={r.color} onChange={(e) => updateRow(i, { color: e.target.value })} placeholder="Colour" maxLength={40} />
                      <input aria-label={`Stock ${i + 1}`} className="qk-input h-9" type="number" min="0" step="1" value={r.stock} onChange={(e) => updateRow(i, { stock: e.target.value })} />
                      <button type="button" aria-label={`Remove size row ${i + 1}`} onClick={() => setRows((list) => list.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-subtle hover:text-sale"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>

            <label className="qk-label">Description
              <textarea className="qk-input" rows={4} required value={form.description} onChange={set('description')} placeholder="What makes this product worth buying?" />
            </label>

            <details className="rounded-xl border border-line px-4 py-3 text-sm">
              <summary className="cursor-pointer select-none font-medium text-fg">More details</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="qk-label">SKU
                  <input className="qk-input font-mono" value={form.sku} onChange={set('sku')} placeholder="VY-TEE-010" />
                </label>
                <label className="qk-label">Rating
                  <input className="qk-input" type="number" min="1" max="5" step="0.1" value={form.rating} onChange={set('rating')} placeholder="4.5" />
                </label>
                <label className="qk-label">Reviews
                  <input className="qk-input" type="number" min="0" step="1" value={form.reviewCount} onChange={set('reviewCount')} placeholder="120" />
                </label>
              </div>
            </details>
          </div>

          <footer className="flex items-center justify-end gap-3 border-t border-line pt-5 md:col-span-2">
            <button type="button" onClick={onClose} disabled={isSaving} className="qk-btn qk-btn-ghost">Cancel</button>
            <button type="submit" disabled={isSaving} className="qk-btn qk-btn-primary min-w-36">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : product ? 'Save changes' : 'Create product'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
