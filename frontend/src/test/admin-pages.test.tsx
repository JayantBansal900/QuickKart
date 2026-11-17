import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { TOKEN_KEY } from "../services/http";
import { AdminInventoryPage } from "../pages/admin/AdminInventoryPage";
import { AdminUsersPage } from "../pages/admin/AdminUsersPage";
import { AdminOrdersPage, NEXT_STATUS } from "../pages/admin/AdminOrdersPage";
import { AdminSystemPage } from "../pages/admin/AdminSystemPage";

const admin = { id: 1, name: "Boss", email: "boss@example.invalid", role: "ADMIN", emailVerified: true, accountStatus: "ACTIVE" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<typeof fetch>();

function mount(page: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <AuthProvider>{page}</AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TOKEN_KEY, "admin-token");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("admin inventory", () => {
  it("sends a relative restock and shows the new stock", async () => {
    const products = [{ id: 7, name: "Teapot", price: 10, stockQuantity: 0, availability: "OUT_OF_STOCK" }];
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/user/profile")) return json(admin);
      if (url.endsWith("/products")) return json(products);
      if (url.endsWith("/admin/products/7/stock") && init?.method === "PATCH")
        return json({ ...products[0], stockQuantity: 10, availability: "IN_STOCK" });
      return json({ message: "unexpected" }, 404);
    });
    mount(<AdminInventoryPage />);
    await screen.findByText("Teapot");
    fireEvent.click(screen.getByRole("button", { name: "+10" }));
    await screen.findByText("Teapot: stock 0 → 10");
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ adjustment: 10 });
  });

  it("refuses an adjustment that would make stock negative without calling the API", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/user/profile")
        ? json(admin)
        : json([{ id: 3, name: "Mug", price: 5, stockQuantity: 2, availability: "IN_STOCK" }]),
    );
    mount(<AdminInventoryPage />);
    await screen.findByText("Mug");
    fireEvent.change(screen.getByLabelText("Stock adjustment for Mug"), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/cannot go below 0/);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });
});

describe("admin users", () => {
  it("lets admins manage customers but never other admins", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/user/profile")
        ? json(admin)
        : json([
            { id: 1, name: "Boss", email: "boss@example.invalid", role: "ADMIN", emailVerified: true, accountStatus: "ACTIVE" },
            { id: 2, name: "Asha", email: "asha@example.invalid", role: "USER", emailVerified: true, accountStatus: "ACTIVE" },
          ]),
    );
    mount(<AdminUsersPage />);
    await screen.findByText("Asha");
    expect(screen.getByLabelText("Account status for asha@example.invalid")).toBeTruthy();
    expect(screen.queryByLabelText("Account status for boss@example.invalid")).toBeNull();
  });
});

describe("admin orders", () => {
  it("only offers the next legal status", () => {
    expect(NEXT_STATUS.CONFIRMED).toEqual(["PROCESSING"]);
    expect(NEXT_STATUS.DELIVERED).toEqual([]);
    expect(NEXT_STATUS.CANCELLED).toEqual([]);
  });

  it("filters orders by status", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/user/profile")
        ? json(admin)
        : json([
            { id: 11, userId: 2, userEmail: "a@example.invalid", status: "CONFIRMED", totalAmount: 100, items: [] },
            { id: 12, userId: 3, userEmail: "b@example.invalid", status: "DELIVERED", totalAmount: 50, items: [] },
          ]),
    );
    mount(<AdminOrdersPage />);
    await screen.findByText("a@example.invalid");
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "DELIVERED" } });
    expect(screen.queryByText("a@example.invalid")).toBeNull();
    const row = screen.getByText("b@example.invalid").closest("tr")!;
    expect(within(row).getByText("Final")).toBeTruthy();
  });
});

describe("admin system status", () => {
  it("renders each component's health", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/user/profile")
        ? json(admin)
        : json({
            overall: "DEGRADED",
            checkedAt: "2026-11-17T10:00:00Z",
            components: [
              { name: "PostgreSQL", status: "UP", latencyMs: 3, detail: "Healthy" },
              { name: "Kafka", status: "DOWN", latencyMs: 2000, detail: "Broker unreachable" },
            ],
          }),
    );
    mount(<AdminSystemPage />);
    await screen.findByText("Broker unreachable");
    expect(screen.getByText("DEGRADED")).toBeTruthy();
    expect(screen.getByText("PostgreSQL")).toBeTruthy();
  });
});
