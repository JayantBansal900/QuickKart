import React, { useState, useEffect } from 'react';
import { X, Package, Loader2 } from 'lucide-react';
import { Product, ProductRequest } from '../types';

interface AdminProductModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onSubmit: (productData: ProductRequest) => Promise<void>;
}

export const AdminProductModal: React.FC<AdminProductModalProps> = ({
  isOpen,
  product,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number | string>('');
  const [discountPercentage, setDiscountPercentage] = useState<number | string>('');
  const [rating, setRating] = useState<number | string>('');
  const [reviewCount, setReviewCount] = useState<number | string>('');
  const [stockQuantity, setStockQuantity] = useState<number | string>('');
  const [category, setCategory] = useState('Electronics');
  const [imageUrl, setImageUrl] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setBrand(product.brand || '');
      setSku(product.sku || '');
      setDescription(product.description || '');
      setPrice(product.price);
      setDiscountPercentage(product.discountPercentage ?? 0);
      setRating(product.rating ?? 4.5);
      setReviewCount(product.reviewCount ?? 0);
      setStockQuantity(product.stockQuantity);
      setCategory(product.category || 'Electronics');
      setImageUrl(product.imageUrl || '');
    } else {
      setName('');
      setBrand('');
      setSku('');
      setDescription('');
      setPrice('');
      setDiscountPercentage('');
      setRating('');
      setReviewCount('');
      setStockQuantity('');
      setCategory('Electronics');
      setImageUrl('');
    }
  }, [product, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await onSubmit({
        name,
        brand: brand || undefined,
        sku: sku || undefined,
        description,
        price: Number(price),
        discountPercentage: discountPercentage !== '' ? Number(discountPercentage) : undefined,
        rating: rating !== '' ? Number(rating) : undefined,
        reviewCount: reviewCount !== '' ? Number(reviewCount) : undefined,
        stockQuantity: Number(stockQuantity),
        category,
        imageUrl,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save product.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-brand-border flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-brand-border bg-white text-brand-ebony flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Package className="w-5 h-5 text-brand-forest" />
            <h2 className="font-extrabold text-brand-ebony text-base tracking-tight">
              {product ? `Edit Product #${product.id}` : 'Add New Product'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-brand-warm-gray hover:text-brand-ebony hover:bg-brand-cream rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-brand-ebony/80 block uppercase tracking-wide">Product Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Wireless Noise-Canceling Headphones"
                className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl text-xs text-brand-ebony font-medium focus:outline-none focus:border-brand-forest"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-brand-ebony/80 block uppercase tracking-wide">Brand</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Sony"
                className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl text-xs text-brand-ebony font-medium focus:outline-none focus:border-brand-forest"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-brand-ebony/80 block uppercase tracking-wide">SKU</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. ELEC-001"
                className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl text-xs text-brand-ebony font-mono focus:outline-none focus:border-brand-forest"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-brand-ebony/80 block uppercase tracking-wide">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl text-xs text-brand-ebony font-mono font-semibold focus:outline-none focus:border-brand-forest cursor-pointer"
              >
                <option value="Electronics">Electronics</option>
                <option value="Fashion">Fashion</option>
                <option value="Home & Living">Home & Living</option>
                <option value="Sports">Sports</option>
                <option value="Books">Books</option>
                <option value="Beauty">Beauty</option>
                <option value="Groceries">Groceries</option>
                <option value="Accessories">Accessories</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-brand-ebony/80 block uppercase tracking-wide">Price (₹)</label>
              <input
                type="number"
                step="1"
                min="0"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="1499"
                className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl text-xs text-brand-ebony font-mono focus:outline-none focus:border-brand-forest"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-brand-ebony/80 block uppercase tracking-wide">Discount (%)</label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={discountPercentage}
                onChange={(e) => setDiscountPercentage(e.target.value)}
                placeholder="15"
                className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl text-xs text-brand-ebony font-mono focus:outline-none focus:border-brand-forest"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-brand-ebony/80 block uppercase tracking-wide">Rating (1-5)</label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="5"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                placeholder="4.5"
                className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl text-xs text-brand-ebony font-mono focus:outline-none focus:border-brand-forest"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-brand-ebony/80 block uppercase tracking-wide">Reviews</label>
              <input
                type="number"
                min="0"
                value={reviewCount}
                onChange={(e) => setReviewCount(e.target.value)}
                placeholder="120"
                className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl text-xs text-brand-ebony font-mono focus:outline-none focus:border-brand-forest"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono font-bold text-brand-ebony/80 block uppercase tracking-wide">Stock Qty</label>
              <input
                type="number"
                min="0"
                required
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                placeholder="50"
                className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl text-xs text-brand-ebony font-mono focus:outline-none focus:border-brand-forest"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono font-bold text-brand-ebony/80 block uppercase tracking-wide">Image Relative/Full URL</label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="/products/electronics/sony-headphones.svg"
              className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl text-xs text-brand-ebony font-mono focus:outline-none focus:border-brand-forest"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono font-bold text-brand-ebony/80 block uppercase tracking-wide">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide a detailed overview of the product features..."
              className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl text-xs text-brand-ebony font-medium focus:outline-none focus:border-brand-forest"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-brand-border flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-brand-warm-gray hover:text-brand-ebony transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 rounded-xl bg-brand-forest hover:bg-brand-forest/90 active:scale-95 text-white font-extrabold text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : product ? 'Update Product' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
