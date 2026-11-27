import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProductDetailsModal } from "../components/ProductDetailsModal";
import { ProductCard } from "../components/ProductCard";
import { AdminProductModal } from "../components/AdminProductModal";
import { coloursOf, sizesOf } from "../components/VariantPicker";
import type { Product } from "../types";

const cart = vi.hoisted(() => ({ addToCart: vi.fn(), isLoading: false }));
vi.mock("../context/CartContext", () => ({ useCart: () => cart }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ isAuthenticated: true, openAuthModal: vi.fn() }) }));
vi.mock("../components/WishlistButton", () => ({ WishlistButton: () => null }));
vi.mock("../components/ProductReviews", () => ({ ProductReviews: () => null }));
vi.mock("../services/api", () => ({
  api: {
    searchProducts: vi.fn().mockResolvedValue({ content: [], page: 0, size: 5, totalElements: 0, totalPages: 0, last: true }),
    getProductById: vi.fn(),
  },
}));

const tee: Product = {
  id: 11, name: "Levi's Classic Crew Tee", brand: "Levi's", description: "Soft cotton tee.", price: 699, stockQuantity: 9,
  category: "Fashion", availability: "IN_STOCK",
  variants: [
    { id: 1, size: "M", color: "Black", stockQuantity: 4 },
    { id: 2, size: "L", color: "Black", stockQuantity: 0 },
    { id: 3, size: "S", color: "Black", stockQuantity: 5 },
    { id: 4, size: "M", color: "White", stockQuantity: 0 },
  ],
};

beforeEach(() => {
  cart.addToCart.mockReset().mockResolvedValue(undefined);
});

describe("variant helpers", () => {
  it("lists colours once and orders sizes naturally", () => {
    expect(coloursOf(tee.variants!)).toEqual(["Black", "White"]);
    expect(sizesOf(tee.variants!, "Black").map((v) => v.size)).toEqual(["S", "M", "L"]);
    expect(sizesOf([{ id: 1, size: "32", stockQuantity: 1 }, { id: 2, size: "28", stockQuantity: 1 }], "").map((v) => v.size)).toEqual(["28", "32"]);
  });
});

describe("product page size picker", () => {
  it("needs a size before adding, disables sold-out sizes and sends the chosen size", async () => {
    render(<ProductDetailsModal product={tee} onClose={() => undefined} />);
    expect(screen.getByRole("radio", { name: "L, sold out" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: /Add to cart/ }));
    expect(await screen.findByText("Please choose a size first.")).toBeTruthy();
    expect(cart.addToCart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: "M" }));
    expect(screen.getByText("Only 4 left in M")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add to cart/ }));
    await waitFor(() => expect(cart.addToCart).toHaveBeenCalledWith(11, 1, 1));
  });

  it("switching colour shows that colour's sizes", () => {
    render(<ProductDetailsModal product={tee} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("radio", { name: "White" }));
    expect(screen.getByRole("radio", { name: "M, sold out" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "S" })).toBeNull();
  });

  it("products without sizes add straight to the cart", async () => {
    const wallet: Product = { id: 5, name: "Leather Wallet", description: "d", price: 1299, stockQuantity: 8, category: "Accessories" };
    render(<ProductDetailsModal product={wallet} onClose={() => undefined} />);
    expect(screen.queryByRole("radiogroup", { name: "Colour" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Add to cart/ }));
    await waitFor(() => expect(cart.addToCart).toHaveBeenCalledWith(5, 1, undefined));
  });
});

describe("product card", () => {
  it("asks for a size instead of adding when the product has sizes", () => {
    const open = vi.fn();
    render(<ProductCard product={tee} onViewDetails={open} />);
    expect(screen.getByText("2 colours")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose a size for Levi's Classic Crew Tee" }));
    expect(open).toHaveBeenCalledWith(tee);
    expect(cart.addToCart).not.toHaveBeenCalled();
  });
});

describe("admin sizes editor", () => {
  it("adds a size set in one click and saves the total as the stock", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AdminProductModal isOpen product={null} categories={["Fashion"]} onClose={() => undefined} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Test Tee" } });
    fireEvent.change(screen.getByLabelText("Price (₹)"), { target: { value: "799" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "A tee." } });
    fireEvent.change(screen.getByLabelText("Colour for new sizes"), { target: { value: "Navy" } });
    fireEvent.click(screen.getByRole("button", { name: "+ S – XXL" }));
    fireEvent.change(screen.getByLabelText("Stock 1"), { target: { value: "0" } });
    expect(screen.getByText(/Stock is the total of the sizes: 40/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Create product" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const sent = onSubmit.mock.calls[0][0];
    expect(sent.stockQuantity).toBe(40);
    expect(sent.variants).toHaveLength(5);
    expect(sent.variants[0]).toEqual({ size: "S", color: "Navy", stockQuantity: 0 });
    expect(within(screen.getByRole("dialog")).getByLabelText("Colour for new sizes")).toBeTruthy();
  });

  it("refuses the same size and colour twice", async () => {
    const onSubmit = vi.fn();
    render(<AdminProductModal isOpen product={null} categories={["Fashion"]} onClose={() => undefined} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Dup Tee" } });
    fireEvent.change(screen.getByLabelText("Price (₹)"), { target: { value: "799" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "A tee." } });
    fireEvent.click(screen.getByRole("button", { name: "+ One size row" }));
    fireEvent.click(screen.getByRole("button", { name: "+ One size row" }));
    fireEvent.change(screen.getByLabelText("Size 1"), { target: { value: "M" } });
    fireEvent.change(screen.getByLabelText("Size 2"), { target: { value: "m" } });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("Each size and colour can only appear once.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("size label", () => {
  it("names shoe and waist sizes", async () => {
    const { sizeLabelFor } = await import("../components/VariantPicker");
    expect(sizeLabelFor([{ id: 1, size: "8", stockQuantity: 1 }])).toBe("Size (UK)");
    expect(sizeLabelFor([{ id: 1, size: "32", stockQuantity: 1 }])).toBe("Waist (in)");
    expect(sizeLabelFor([{ id: 1, size: "M", stockQuantity: 1 }])).toBe("Size");
  });
});
