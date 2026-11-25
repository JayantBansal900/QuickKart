import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { TOKEN_KEY } from "../services/http";
import { AdminCouponsPage } from "../pages/admin/AdminCouponsPage";
import { AdminReturnsPage } from "../pages/admin/AdminReturnsPage";
import { AdminCartsPage } from "../pages/admin/AdminCartsPage";
import { AdminOrdersPage } from "../pages/admin/AdminOrdersPage";

const admin = { id: 1, name: "Boss", email: "boss@example.invalid", role: "ADMIN", emailVerified: true, accountStatus: "ACTIVE" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const page = <T,>(content: T[]) => ({ content, page: 0, size: 25, totalElements: content.length, totalPages: 1, last: true });
const fetchMock = vi.fn<typeof fetch>();
const order = (over: Record<string, unknown> = {}) => ({
  id: 41, userId: 2, userEmail: "asha@example.invalid", status: "PROCESSING", totalAmount: 900, paymentMethod: "COD",
  paymentStatus: "COLLECTION_PENDING", recipientName: "Asha", deliveryAddress: "1 Test Road", items: [], cancellable: true, ...over,
});

function mount(element: React.ReactElement) {
  return render(<MemoryRouter initialEntries={["/admin"]}><AuthProvider>{element}</AuthProvider></MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOKEN_KEY, "admin-token");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("admin coupons", () => {
  it("lists coupons and creates a new one", async () => {
    const posted: unknown[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/user/profile")) return json(admin);
      if (url.endsWith("/admin/coupons") && init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return json({ id: 2, code: "SAVE5", discountType: "PERCENT", discountValue: 5, minOrderAmount: 0, usedCount: 0, oncePerCustomer: true, active: true }, 201);
      }
      return json([{ id: 1, code: "WELCOME10", description: "10% off", discountType: "PERCENT", discountValue: 10, maxDiscount: 500, minOrderAmount: 0, usedCount: 3, oncePerCustomer: true, active: true }]);
    });
    mount(<AdminCouponsPage />);
    expect(await screen.findByText("WELCOME10")).toBeTruthy();
    expect(screen.getByText(/10% off \(max ₹500/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /New coupon/ }));
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "save5" } });
    fireEvent.change(screen.getByLabelText("Percent off"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save coupon" }));
    await waitFor(() => expect(posted).toEqual([expect.objectContaining({ code: "save5", discountType: "PERCENT", discountValue: 5 })]));
  });
});

describe("admin returns", () => {
  it("approves a return after confirmation", async () => {
    const patches: string[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/user/profile")) return json(admin);
      if (init?.method === "PATCH") {
        patches.push(String(init.body));
        return json({});
      }
      return json(page([{ id: 7, orderId: 41, reason: "DAMAGED", comment: "Box crushed", status: "REQUESTED", requestedAt: "2026-11-24T10:00:00", order: order({ status: "DELIVERED" }) }]));
    });
    mount(<AdminReturnsPage />);
    expect(await screen.findByText("Arrived damaged")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve and refund" }));
    await waitFor(() => expect(patches).toEqual([JSON.stringify({ decision: "APPROVE" })]));
  });
});

describe("admin carts", () => {
  it("shows open carts and their value", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/user/profile")
        ? json(admin)
        : json([{ cartId: 1, userId: 2, customerName: "Asha", customerEmail: "asha@example.invalid", itemCount: 3, total: 1500, updatedAt: "2026-11-20T10:00:00", items: [{ productId: 5, productName: "Kettle", quantity: 3, price: 500 }] }]),
    );
    mount(<AdminCartsPage />);
    expect(await screen.findByText("asha@example.invalid")).toBeTruthy();
    expect(screen.getAllByText("₹1,500.00").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Asha/ }));
    expect(screen.getByText("3 × Kettle")).toBeTruthy();
  });
});

describe("admin dispatch", () => {
  it("asks for courier and tracking before marking an order shipped", async () => {
    const patches: string[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/user/profile")) return json(admin);
      if (init?.method === "PATCH") {
        patches.push(String(init.body));
        return json(order({ status: "SHIPPED", courier: "Blue Dart", trackingNumber: "BD123456", cancellable: false }));
      }
      return json(page([order()]));
    });
    mount(<AdminOrdersPage />);
    await screen.findByText("asha@example.invalid");
    fireEvent.change(screen.getByLabelText("Update status for order 41"), { target: { value: "SHIPPED" } });
    const dialog = await screen.findByRole("dialog", { name: /Dispatch order #41/ });
    expect(patches).toEqual([]); // nothing sent yet
    fireEvent.change(within(dialog).getByLabelText("Courier"), { target: { value: "Blue Dart" } });
    fireEvent.change(within(dialog).getByLabelText(/Tracking number/), { target: { value: "BD123456" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark as shipped" }));
    await waitFor(() => expect(JSON.parse(patches[0])).toEqual({ status: "SHIPPED", courier: "Blue Dart", trackingNumber: "BD123456" }));
  });
});
