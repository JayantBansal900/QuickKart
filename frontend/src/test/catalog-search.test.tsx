import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { CartProvider } from "../context/CartContext";
import { HomePage } from "../pages/HomePage";
import { api } from "../services/api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const product = (id: number, name: string) => ({
  id, name, description: "d", price: 100 + id, stockQuantity: 5, category: "JACKETS",
});

const fetchMock = vi.fn<typeof fetch>();
/** Catalog-grid requests (size=24) — the hero/deals showcase requests use other sizes. */
const gridRequests = () =>
  fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => /\/products\?/.test(u) && u.includes("size=24"));

function Location() {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname + loc.search}</output>;
}

function mount(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <CartProvider>
          <Location />
          <Routes>
            <Route path="/" element={<HomePage isSidebarOpen={false} onCloseSidebar={() => {}} currentView="store" onSelectView={() => {}} />} />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/products/categories")) return json([{ category: "JACKETS", count: 30 }]);
    if (/\/products(\?|$)/.test(url)) {
      const page = Number(new URL(url, "http://x").searchParams.get("page") ?? 0);
      return json({
        content: [product(page * 24 + 1, `Item page ${page + 1}`)],
        page, size: 24, totalElements: 30, totalPages: 2, last: page >= 1,
      });
    }
    return json({ message: "unexpected" }, 404);
  });
});

describe("server-side catalog search", () => {
  it("requests one page from the server and shows total counts from the response", async () => {
    mount();
    expect(await screen.findAllByText("Item page 1")).not.toHaveLength(0);
    expect(screen.getByText("Showing 1–24 of 30 items")).toBeTruthy();
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(gridRequests()[0]).toMatch(/\/products\?size=24$/);
  });

  it("restores filters from the URL and sends them to the API", async () => {
    mount("/?q=phone&category=jackets&sort=price-asc&minPrice=100&page=1");
    await screen.findByText("Page 2 of 2");
    const url = new URL(gridRequests()[0], "http://x");
    expect(url.searchParams.get("q")).toBe("phone");
    expect(url.searchParams.get("category")).toBe("JACKETS");
    expect(url.searchParams.get("sort")).toBe("price-asc");
    expect(url.searchParams.get("minPrice")).toBe("100");
    expect(url.searchParams.get("page")).toBe("1");
  });

  it("debounces typing into a single search request and resets to page 1", async () => {
    mount("/?page=1");
    await screen.findByText("Page 2 of 2");
    const before = gridRequests().length;
    const box = screen.getByLabelText("Search catalog");
    for (const text of ["l", "la", "lap", "lapt", "laptop"]) fireEvent.change(box, { target: { value: text } });
    await waitFor(() => expect(gridRequests().length).toBe(before + 1), { timeout: 2000 });
    const last = new URL(gridRequests().at(-1)!, "http://x");
    expect(last.searchParams.get("q")).toBe("laptop");
    expect(last.searchParams.get("page")).toBeNull();
    expect(screen.getByTestId("location").textContent).toBe("/?q=laptop");
  });

  it("Next button loads the following page", async () => {
    mount();
    await screen.findByText("Page 1 of 2");
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    await screen.findByText("Page 2 of 2");
    expect(screen.getByTestId("location").textContent).toBe("/?page=1");
    expect((screen.getByRole("button", { name: /Next/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("department counts come from the categories endpoint", async () => {
    mount();
    expect((await screen.findAllByText("30 items")).length).toBeGreaterThan(0);
  });
});

describe("api.searchProducts", () => {
  it("omits default values from the query string", async () => {
    await api.searchProducts({ q: "  ", category: "ALL", sort: "featured", page: 0 });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/products$/);
  });
});
