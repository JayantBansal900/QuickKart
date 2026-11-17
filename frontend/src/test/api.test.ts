import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { TOKEN_KEY } from "../services/http";
beforeEach(() => localStorage.clear());
it("registration never persists even an unexpected returned token", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ token: "unexpected" }), { status: 201 }),
      ),
  );
  await api.register("Test", "test@example.invalid", "password");
  expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
});
it("handles non-JSON failures without reading the response body twice", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("<html>bad gateway</html>", { status: 502 }),
      ),
  );
  await expect(api.getProducts()).rejects.toThrow("Request failed (502)");
});
it("a delayed response from an old token cannot clear the new session", async () => {
  localStorage.setItem(TOKEN_KEY, "old");
  let finish!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const request = api.getCart();
  localStorage.setItem(TOKEN_KEY, "new");
  finish(new Response("{}", { status: 401 }));
  await expect(request).rejects.toThrow("Session changed");
  expect(localStorage.getItem(TOKEN_KEY)).toBe("new");
});
