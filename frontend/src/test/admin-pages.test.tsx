import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { TOKEN_KEY } from "../services/http";
import { AdminInventoryPage } from "../pages/admin/AdminInventoryPage";
import { AdminUsersPage } from "../pages/admin/AdminUsersPage";
import { AdminOrdersPage, NEXT_STATUS } from "../pages/admin/AdminOrdersPage";
import { AdminSystemPage } from "../pages/admin/AdminSystemPage";
import { AdminAnalyticsPage } from "../pages/admin/AdminAnalyticsPage";
import { AdminCategoriesPage } from "../pages/admin/AdminCategoriesPage";

const admin = { id: 1, name: "Boss", email: "boss@example.invalid", role: "ADMIN", emailVerified: true, accountStatus: "ACTIVE" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const page = <T,>(content: T[]) => ({ content, page: 0, size: 25, totalElements: content.length, totalPages: 1, last: true });
const stats = { totalProducts: 144, lowStockCount: 1, outOfStockCount: 1, totalOrders: 2, totalRevenue: 150, collectedRevenue: 50, totalUsers: 3, verifiedUsersCount: 3, pendingOrdersCount: 1 };
const fetchMock = vi.fn<typeof fetch>();

function mount(element: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <AuthProvider>{element}</AuthProvider>
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
  it("asks the server for low stock first and sends a relative restock", async () => {
    const products = [{ id: 7, name: "Teapot", price: 10, stockQuantity: 0, availability: "OUT_OF_STOCK" }];
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/user/profile")) return json(admin);
      if (url.endsWith("/admin/analytics")) return json(stats);
      if (url.includes("/admin/products?")) return json(page(products));
      if (url.endsWith("/admin/products/7/stock") && init?.method === "PATCH")
        return json({ ...products[0], stockQuantity: 10, availability: "IN_STOCK" });
      return json({ message: "unexpected" }, 404);
    });
    mount(<AdminInventoryPage />);
    await screen.findByText("Teapot");
    const list = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes("/admin/products?"))!;
    expect(new URL(list, "http://test").searchParams.get("stock")).toBe("LOW");
    expect(new URL(list, "http://test").searchParams.get("sort")).toBe("stock");
    fireEvent.click(screen.getByRole("button", { name: "+10" }));
    await screen.findByText("Teapot: stock 0 → 10");
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ adjustment: 10 });
  });

  it("refuses an adjustment that would make stock negative without calling the API", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/user/profile")) return json(admin);
      if (url.endsWith("/admin/analytics")) return json(stats);
      return json(page([{ id: 3, name: "Mug", price: 5, stockQuantity: 2, availability: "IN_STOCK" }]));
    });
    mount(<AdminInventoryPage />);
    await screen.findByText("Mug");
    fireEvent.change(screen.getByLabelText("Stock adjustment for Mug"), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/cannot go below 0/);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("shows the stock history of a product", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/user/profile")) return json(admin);
      if (url.endsWith("/admin/analytics")) return json(stats);
      if (url.includes("/stock-movements")) {
        return json(page([{ id: 1, change: -2, stockAfter: 3, reason: "ORDER_PLACED", reference: "Order #41", actor: "a@example.invalid", createdAt: "2026-11-17T10:00:00" }]));
      }
      return json(page([{ id: 3, name: "Mug", price: 5, stockQuantity: 3, availability: "IN_STOCK" }]));
    });
    mount(<AdminInventoryPage />);
    await screen.findByText("Mug");
    fireEvent.click(screen.getByRole("button", { name: "Stock history for Mug" }));
    expect(await screen.findByText("Order placed · Order #41")).toBeTruthy();
    expect(screen.getByText("-2")).toBeTruthy();
  });
});

describe("admin users", () => {
  it("lets admins manage customers but never other admins", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/user/profile")
        ? json(admin)
        : json(page([
            { id: 1, name: "Boss", email: "boss@example.invalid", role: "ADMIN", emailVerified: true, accountStatus: "ACTIVE" },
            { id: 2, name: "Asha", email: "asha@example.invalid", role: "USER", emailVerified: true, accountStatus: "ACTIVE" },
          ])),
    );
    mount(<AdminUsersPage />);
    await screen.findByText("Asha");
    expect(screen.getByLabelText("Account status for asha@example.invalid")).toBeTruthy();
    expect(screen.queryByLabelText("Account status for boss@example.invalid")).toBeNull();
  });

  it("suspending asks for confirmation in a dialog and does nothing when cancelled", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/user/profile")
        ? json(admin)
        : json(page([{ id: 2, name: "Asha", email: "asha@example.invalid", role: "USER", emailVerified: true, accountStatus: "ACTIVE" }])),
    );
    mount(<AdminUsersPage />);
    await screen.findByText("Asha");
    fireEvent.change(screen.getByLabelText("Account status for asha@example.invalid"), { target: { value: "SUSPENDED" } });
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Suspend asha@example.invalid?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });
});

describe("admin orders", () => {
  it("only offers the next legal status", () => {
    expect(NEXT_STATUS.PLACED).toEqual(["CONFIRMED"]);
    expect(NEXT_STATUS.SHIPPED).toEqual(["OUT_FOR_DELIVERY"]);
    expect(NEXT_STATUS.PENDING).toEqual([]); // only a successful payment moves an online order on
    expect(NEXT_STATUS.DELIVERED).toEqual([]);
    expect(NEXT_STATUS.CANCELLED).toEqual([]);
  });

  it("filters by status on the server", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/user/profile")) return json(admin);
      const status = new URL(url, "http://test").searchParams.get("status");
      const all = [
        { id: 11, userId: 2, userEmail: "a@example.invalid", status: "CONFIRMED", totalAmount: 100, items: [] },
        { id: 12, userId: 3, userEmail: "b@example.invalid", status: "DELIVERED", totalAmount: 50, items: [] },
      ];
      return json(page(all.filter((o) => !status || o.status === status)));
    });
    mount(<AdminOrdersPage />);
    await screen.findByText("a@example.invalid");
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "DELIVERED" } });
    await waitFor(() => expect(screen.queryByText("a@example.invalid")).toBeNull());
    const row = screen.getByText("b@example.invalid").closest("tr")!;
    expect(within(row).getByText("Final")).toBeTruthy();
  });
});

describe("admin analytics", () => {
  it("shows totals, a daily chart and best sellers for the chosen range", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/user/profile")) return json(admin);
      const days = Number(new URL(url, "http://test").searchParams.get("days"));
      return json({
        days,
        revenue: 2500,
        orders: 2,
        averageOrderValue: 1250,
        newCustomers: 1,
        daily: Array.from({ length: days }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, revenue: i === 0 ? 2500 : 0, orders: i === 0 ? 2 : 0, registrations: 0 })),
        ordersByStatus: [{ name: "PLACED", count: 2 }],
        paymentMethods: [{ name: "UPI", count: 2 }],
        topProducts: [{ productId: 5, name: "Kettle", units: 3, revenue: 2500 }],
        categories: [{ category: "Home & Living", units: 3, revenue: 2500 }],
      });
    });
    mount(<AdminAnalyticsPage />);
    expect(await screen.findByText("Kettle")).toBeTruthy();
    expect(screen.getByRole("img", { name: /Revenue per day for the last 30 days/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await screen.findByRole("img", { name: /last 7 days/ });
    fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
    expect(screen.getAllByRole("row").length).toBe(8); // header + 7 days
  });
});

describe("admin categories", () => {
  it("lists categories and creates a new one", async () => {
    const created: unknown[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/user/profile")) return json(admin);
      if (url.endsWith("/admin/categories") && init?.method === "POST") {
        created.push(JSON.parse(String(init.body)));
        return json({ id: 9, key: "TOYS", name: "Toys", sortOrder: 90, active: true, productCount: 0 }, 201);
      }
      return json([{ id: 1, key: "BOOKS", name: "Books", description: "Read", sortOrder: 10, active: true, productCount: 18 }]);
    });
    mount(<AdminCategoriesPage />);
    expect(await screen.findByText("Books")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add category/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Toys" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(created).toEqual([expect.objectContaining({ name: "Toys", active: true })]));
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
              { key: "postgres", name: "PostgreSQL", status: "UP", latencyMs: 3, detail: "Healthy" },
              { key: "kafka", name: "Kafka", status: "DOWN", latencyMs: 2000, detail: "Broker unreachable" },
            ],
          }),
    );
    mount(<AdminSystemPage />);
    await screen.findByText("Broker unreachable");
    expect(screen.getByText("DEGRADED")).toBeTruthy();
    expect(screen.getByText("PostgreSQL")).toBeTruthy();
  });
});

describe("system troubleshooting", () => {
  const statusBody = {
    overall: "UP",
    checkedAt: "2026-11-27T10:00:00Z",
    components: [{ key: "redis", name: "Redis", status: "UP", latencyMs: 2, detail: "Healthy" }],
  };
  const redisDetail = (cached: string) => ({
    key: "redis", name: "Redis", status: "UP", latencyMs: 2, checkedAt: "2026-11-27T10:00:00Z",
    facts: [{ label: "Cached product pages", value: cached }],
    problems: [],
    advice: ["If the store shows an old price, clear the product cache."],
    actions: [{ id: "clear-product-cache", label: "Clear product cache", description: "Deletes only the cached product listings." }],
  });

  it("clicking a component shows its numbers, advice and a safe fix that runs after confirmation", async () => {
    const actions: string[] = [];
    let cached = "12";
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/user/profile")) return json(admin);
      if (url.endsWith("/admin/system/status")) return json(statusBody);
      if (url.endsWith("/actions/clear-product-cache") && init?.method === "POST") {
        actions.push(url);
        cached = "0";
        return json({ component: "redis", action: "clear-product-cache", message: "Cleared 12 cached product page(s).", ranAt: "2026-11-27T10:01:00Z" });
      }
      if (url.endsWith("/admin/system/components/redis")) return json(redisDetail(cached));
      return json({});
    });
    mount(<AdminSystemPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Troubleshoot Redis" }));
    const panel = await screen.findByRole("dialog", { name: /Redis/ });
    expect(await within(panel).findByText("Cached product pages")).toBeTruthy();
    expect(within(panel).getByText("No problems found.")).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "Clear product cache" }));
    const confirmBox = await screen.findByRole("alertdialog");
    expect(actions).toEqual([]); // nothing runs before the admin confirms
    fireEvent.click(within(confirmBox).getByRole("button", { name: "Clear product cache" }));
    expect(await within(panel).findByText("Cleared 12 cached product page(s).")).toBeTruthy();
    expect(actions).toHaveLength(1);
    expect(await within(panel).findByText("0")).toBeTruthy();
  });

  it("a component that is down lists the problem and what to do", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/user/profile")) return json(admin);
      if (url.endsWith("/admin/system/status")) return json({ ...statusBody, overall: "DEGRADED", components: [{ key: "kafka", name: "Kafka", status: "DOWN", latencyMs: 2000, detail: "Broker unreachable" }] });
      return json({
        key: "kafka", name: "Kafka", status: "DOWN", latencyMs: 2000, checkedAt: "2026-11-27T10:00:00Z",
        facts: [], problems: ["The Kafka broker is unreachable."], advice: ["Start it again: docker compose up -d --wait kafka"], actions: [],
      });
    });
    mount(<AdminSystemPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Troubleshoot Kafka" }));
    const panel = await screen.findByRole("dialog", { name: /Kafka/ });
    expect(await within(panel).findByText("The Kafka broker is unreachable.")).toBeTruthy();
    expect(within(panel).getByText(/docker compose up -d --wait kafka/)).toBeTruthy();
    expect(within(panel).queryByText("Fix from here")).toBeNull();
  });
});
