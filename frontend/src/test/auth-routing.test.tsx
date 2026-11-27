import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router-dom";
import { ApplicationProviders } from "../App";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { AuthPage } from "../pages/AuthPage";
import { AdminLoginPage } from "../pages/admin/AdminLoginPage";
import { api } from "../services/api";
import { TOKEN_KEY } from "../services/http";
import { safeDestination } from "../routing";
const identity = {
  id: 42,
  name: "Test Customer",
  email: "test@example.invalid",
  role: "USER",
  emailVerified: true,
  accountStatus: "ACTIVE",
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input) => {
    const path = String(input);
    if (path.endsWith("/user/profile")) return response(identity);
    if (path.endsWith("/cart"))
      return response({ cartId: 1, items: [], totalAmount: 0 });
    if (path.includes("/products/categories")) return response([]);
    if (/\/products(\?|$)/.test(path))
      return response({ content: [], page: 0, size: 24, totalElements: 0, totalPages: 0, last: true });
    if (path.endsWith("/orders")) return response([]);
    return response({ message: "Unexpected test request" }, 404);
  });
});
function State() {
  const auth = useAuth();
  return (
    <>
      <output data-testid="status">
        {auth.status}:{auth.user?.role}
      </output>
      <button onClick={auth.logout}>Logout test</button>
      <button onClick={() => void api.getCart().catch(() => {})}>
        Protected request
      </button>
    </>
  );
}
function mount(path = "/login") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <State />
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />
          <Route path="/verify-email" element={<AuthPage />} />
          <Route path="/forgot-password" element={<AuthPage />} />
          <Route path="/reset-password" element={<AuthPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route
              path="/account/profile"
              element={<h1>Protected profile</h1>}
            />
          </Route>
          <Route element={<ProtectedRoute admin />}>
            <Route path="/admin" element={<h1>Admin content</h1>} />
          </Route>
          <Route path="/" element={<h1>Shop home</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}
async function credentials() {
  await screen.findByLabelText("Email Address");
  fireEvent.change(screen.getByLabelText("Email Address"), {
    target: { value: "test@example.invalid" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "correct-password" },
  });
}
describe("authentication and route regressions", () => {
  it("registration creates no session, then valid OTP establishes it", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/auth/register")
        ? response(
            {
              ...identity,
              emailVerified: false,
              accountStatus: "PENDING_VERIFICATION",
              token: null,
            },
            201,
          )
        : response({ ...identity, token: "verified-token" }),
    );
    mount("/register");
    await credentials();
    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "Test Customer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    await screen.findByRole("heading", { name: "Verify Your Email" });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated:");
    fireEvent.change(screen.getByLabelText("Verification Code"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Verify & Activate Account" }),
    );
    await screen.findByRole("heading", { name: "Protected profile" });
    expect(localStorage.getItem(TOKEN_KEY)).toBe("verified-token");
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      "/api/auth/register",
      "/api/auth/verify-otp",
    ]);
  });
  it.each([
    "Invalid OTP",
    "OTP expired",
    "Maximum OTP attempts exceeded",
    "Email already verified",
  ])("displays verification rejection: %s", async (message) => {
    fetchMock.mockResolvedValue(response({ message }, 400));
    mount("/verify-email");
    await screen.findByLabelText("Email Address");
    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "test@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Verification Code"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Verify & Activate Account" }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
  it("valid login establishes a session and safe destination", async () => {
    fetchMock.mockResolvedValue(
      response({ ...identity, token: "login-token" }),
    );
    mount("/login?next=%2Faccount%2Fprofile");
    await credentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByText("Protected profile");
    expect(screen.getByTestId("status").textContent).toBe("authenticated:USER");
  });
  it.each([401, 403, 429])(
    "rejected login %s neither authenticates nor retries",
    async (status) => {
      fetchMock.mockResolvedValue(
        response({ message: "Login rejected" }, status),
      );
      mount();
      await credentials();
      fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
      await screen.findByRole("alert");
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it("does not trust a forged cached administrator", async () => {
    localStorage.setItem(
      "quickkart_user",
      JSON.stringify({ ...identity, role: "ADMIN" }),
    );
    mount("/admin");
    await screen.findByRole("heading", { name: "Administrator Sign In" });
    expect(screen.queryByText("Admin content")).toBeNull();
  });
  it("restores only after backend validation and rejects customer admin access", async () => {
    localStorage.setItem(TOKEN_KEY, "existing");
    let finish!: (r: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount("/admin");
    expect(screen.getByText("Checking your session…")).toBeTruthy();
    expect(screen.queryByText("Admin content")).toBeNull();
    finish(response(identity));
    await screen.findByText("Access denied");
    expect(screen.getByTestId("status").textContent).toBe("authenticated:USER");
  });
  it("accepts backend validated admin", async () => {
    localStorage.setItem(TOKEN_KEY, "existing");
    fetchMock.mockResolvedValue(response({ ...identity, role: "ADMIN" }));
    mount("/admin");
    await screen.findByText("Admin content");
  });
  it("clears an expired session on restoration", async () => {
    localStorage.setItem(TOKEN_KEY, "expired");
    fetchMock.mockResolvedValue(response({ message: "Expired" }, 401));
    mount("/account/profile");
    await screen.findByRole("heading", { name: "Sign In" });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(screen.queryByText("Protected profile")).toBeNull();
  });
  it("clears a rejected session and protected UI after a request", async () => {
    localStorage.setItem(TOKEN_KEY, "existing");
    mount("/account/profile");
    await screen.findByText("Protected profile");
    fetchMock.mockResolvedValue(response({ message: "Suspended" }, 401));
    fireEvent.click(screen.getByText("Protected request"));
    await screen.findByRole("heading", { name: "Sign In" });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
  it("logout clears frontend identity and cached data", async () => {
    localStorage.setItem(TOKEN_KEY, "existing");
    mount("/account/profile");
    await screen.findByText("Protected profile");
    fireEvent.click(screen.getByText("Logout test"));
    await screen.findByRole("heading", { name: "Sign In" });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem("quickkart_user")).toBeNull();
    expect(screen.queryByText("Protected profile")).toBeNull();
  });
  it("outage prevents protected rendering without claiming token invalid", async () => {
    localStorage.setItem(TOKEN_KEY, "existing");
    fetchMock.mockRejectedValue(new TypeError("offline"));
    mount("/account/profile");
    await screen.findByRole("alert");
    expect(screen.queryByText("Protected profile")).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBe("existing");
  });
  it("normal forbidden response does not log out valid customer", async () => {
    localStorage.setItem(TOKEN_KEY, "existing");
    mount("/account/profile");
    await screen.findByText("Protected profile");
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/user/profile")
        ? response(identity)
        : response({ message: "Forbidden" }, 403),
    );
    fireEvent.click(screen.getByText("Protected request"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(localStorage.getItem(TOKEN_KEY)).toBe("existing");
    expect(screen.getByText("Protected profile")).toBeTruthy();
  });
  it("anonymous 403 is reconciled against authoritative profile", async () => {
    localStorage.setItem(TOKEN_KEY, "existing");
    mount("/account/profile");
    await screen.findByText("Protected profile");
    fetchMock.mockImplementation(async (input) =>
      response(
        { message: "Rejected" },
        String(input).endsWith("/user/profile") ? 401 : 403,
      ),
    );
    fireEvent.click(screen.getByText("Protected request"));
    await screen.findByRole("heading", { name: "Sign In" });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
  it("stale restoration cannot reauthenticate after logout", async () => {
    localStorage.setItem(TOKEN_KEY, "existing");
    let finish!: (r: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount("/account/profile");
    fireEvent.click(screen.getByText("Logout test"));
    finish(response(identity));
    await screen.findByRole("heading", { name: "Sign In" });
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated:");
  });
  it("rejects an authentication response without a token", async () => {
    fetchMock.mockResolvedValue(response({ ...identity, token: null }));
    mount();
    await credentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByRole("alert");
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated:");
  });
});
describe("actual application navigation", () => {
  it("direct profile URL restores identity and provides working shopping and profile navigation", async () => {
    localStorage.setItem(TOKEN_KEY, "existing");
    window.history.replaceState({}, "", "/account/profile");
    render(
      <BrowserRouter>
        <ApplicationProviders />
      </BrowserRouter>,
    );
    await screen.findByRole("heading", { name: "Test Customer" });
    fireEvent.click(screen.getByLabelText("QuickKart Home"));
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    fireEvent.click(screen.getByLabelText("My Account"));
    await screen.findByRole("heading", { name: "Test Customer" });
    expect(window.location.pathname).toBe("/account/profile");
  });
  it("unknown routes render a useful fallback", async () => {
    render(
      <MemoryRouter initialEntries={["/missing"]}>
        <ApplicationProviders />
      </MemoryRouter>,
    );
    await screen.findByText("Page not found");
    expect(
      screen.getByRole("link", { name: "Return to shopping" }),
    ).toBeTruthy();
  });
  it("direct product URLs load actual API product data and browser history returns to shopping", async () => {
    const fallback = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      String(input).endsWith("/products/535")
        ? response({
            id: 535,
            name: "Controlled test product",
            description: "Test fixture only",
            price: 10,
            stockQuantity: 2,
            category: "BOOKS",
          })
        : fallback(input, init),
    );
    window.history.replaceState({}, "", "/");
    window.history.pushState({}, "", "/products/535");
    render(
      <BrowserRouter>
        <ApplicationProviders />
      </BrowserRouter>,
    );
    await screen.findByText("Controlled test product");
    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    await waitFor(() =>
      expect(screen.queryByText("Controlled test product")).toBeNull(),
    );
  });
});
describe("safe redirect handling", () => {
  it.each([
    "https://evil.invalid",
    "//evil.invalid",
    "/\\evil.invalid",
    "/login",
    "/register",
    "/verify-email",
  ])("rejects %s", (value) =>
    expect(safeDestination(value)).toBe("/account/profile"),
  );
  it("preserves same-origin destination and search", () =>
    expect(safeDestination("/account/orders?filter=pending")).toBe(
      "/account/orders?filter=pending",
    ));
});

it("cross-tab logout invalidates protected content", async () => {
  localStorage.setItem(TOKEN_KEY, "existing");
  mount("/account/profile");
  await screen.findByText("Protected profile");
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(
    new StorageEvent("storage", { key: TOKEN_KEY, newValue: null }),
  );
  await screen.findByRole("heading", { name: "Sign In" });
  expect(screen.queryByText("Protected profile")).toBeNull();
});
it("resend cooldown prevents duplicate OTP requests", async () => {
  fetchMock.mockResolvedValue(response({ message: "Code sent" }));
  mount("/verify-email");
  await screen.findByLabelText("Email Address");
  fireEvent.change(screen.getByLabelText("Email Address"), {
    target: { value: "test@example.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Resend Code" }));
  const button = await screen.findByRole("button", { name: "Resend in 60s" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("rate-limit feedback disables resubmission and never auto-retries", async () => {
  fetchMock.mockResolvedValue(response({ message: "Too many attempts" }, 429));
  mount();
  await credentials();
  fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
  await screen.findByRole("alert");
  expect(
    (
      screen.getByRole("button", {
        name: "Try again in 60s",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("keyboard focus reaches labeled auth inputs", async () => {
  mount();
  await screen.findByRole("heading", { name: "Sign In" });
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByLabelText("Email Address"));
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByLabelText("Password"));
});
it("mobile menu works from account authentication pages", async () => {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <ApplicationProviders />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Sign In" });
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
  expect(
    screen.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "My Account" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("navigation", { name: "Mobile navigation" }),
    ).toBeNull(),
  );
});

it("an administrator account with Customer chosen gets no session", async () => {
  fetchMock.mockResolvedValue(
    response({ ...identity, role: "ADMIN", token: "admin-token" }),
  );
  mount("/login");
  await credentials();
  fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/Choose .Admin. above/);
  expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
});
it.each([
  { emailVerified: false, accountStatus: "ACTIVE" },
  { emailVerified: true, accountStatus: "SUSPENDED" },
  { emailVerified: true, accountStatus: "DISABLED" },
])("refuses non-active or unverified session responses: %o", async (state) => {
  fetchMock.mockResolvedValue(
    response({ ...identity, ...state, token: "invalid-state" }),
  );
  mount();
  await credentials();
  fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
  await screen.findByRole("alert");
  expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  expect(screen.getByTestId("status").textContent).toBe("unauthenticated:");
});

describe("dedicated administrator login", () => {
  async function adminCredentials() {
    await screen.findByLabelText("Admin Email");
    fireEvent.change(screen.getByLabelText("Admin Email"), {
      target: { value: "someone@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In to Admin" }));
  }
  it("rejects a customer account without creating any session", async () => {
    fetchMock.mockResolvedValue(response({ ...identity, token: "customer-token" }));
    mount("/admin/login");
    await adminCredentials();
    expect((await screen.findByRole("alert")).textContent).toMatch(/administrator access/i);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated:");
    expect(screen.queryByText("Admin content")).toBeNull();
  });
  it("signs an administrator in and lands on the admin area", async () => {
    fetchMock.mockResolvedValue(response({ ...identity, role: "ADMIN", token: "admin-token" }));
    mount("/admin/login");
    await adminCredentials();
    await screen.findByText("Admin content");
    expect(localStorage.getItem(TOKEN_KEY)).toBe("admin-token");
  });
  it("unauthenticated admin URLs redirect to the admin login, not the customer login", async () => {
    mount("/admin");
    await screen.findByRole("heading", { name: "Administrator Sign In" });
  });
});

describe("forgot and reset password", () => {
  it("requests a code, resets the password and returns to sign in without creating a session", async () => {
    fetchMock.mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith("/auth/forgot-password"))
        return response({ message: "If an account exists for this email, a reset code has been sent." });
      if (path.endsWith("/auth/reset-password"))
        return response({ message: "Your password has been reset." });
      return response({ message: "Unexpected" }, 404);
    });
    mount("/login");
    fireEvent.click(await screen.findByRole("link", { name: "Forgot password?" }));
    await screen.findByRole("heading", { name: "Forgot Password" });
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "test@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Reset Code" }));

    await screen.findByRole("heading", { name: "Reset Password" });
    expect((screen.getByLabelText("Email Address") as HTMLInputElement).value).toBe("test@example.invalid");
    fireEvent.change(screen.getByLabelText("Reset Code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "brand-new-pass" } });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), { target: { value: "different-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/don't match/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // mismatch is caught before any request

    fireEvent.change(screen.getByLabelText("Confirm New Password"), { target: { value: "brand-new-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
    await screen.findByRole("heading", { name: "Sign In" });
    expect(screen.getByText(/Password updated/)).toBeTruthy();

    const resetCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/auth/reset-password"))!;
    expect(JSON.parse(String(resetCall[1]?.body))).toEqual({
      email: "test@example.invalid", otp: "123456", newPassword: "brand-new-pass",
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    // the email address never appears in the URL
    expect(window.location.search).not.toContain("example.invalid");
  });
});

describe("two-step sign-in (emailed code)", () => {
  const pending = (role: "USER" | "ADMIN") => ({
    token: null, email: "test@example.invalid", role, emailVerified: true, accountStatus: "ACTIVE",
    mfaRequired: true, message: "We sent a 6-digit sign-in code to te***@example.invalid.",
  });

  it("a correct password asks for the code, and only the code creates the session", async () => {
    const verified: string[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.endsWith("/auth/login")) return response(pending("USER"));
      if (path.endsWith("/auth/login/verify")) {
        verified.push(String(init?.body));
        return response({ ...identity, token: "mfa-token" });
      }
      if (path.endsWith("/user/profile")) return response(identity);
      return response({ content: [], items: [] });
    });
    mount("/login");
    await credentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText(/te\*\*\*@example.invalid/)).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull(); // no session after the password alone

    fireEvent.change(screen.getByLabelText("Sign-in code"), { target: { value: "12 34 56" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await screen.findByRole("heading", { name: "Protected profile" });
    expect(JSON.parse(verified[0])).toEqual({ email: "test@example.invalid", otp: "123456" });
    expect(localStorage.getItem(TOKEN_KEY)).toBe("mfa-token");
  });

  it("a wrong code shows the error and keeps the code screen", async () => {
    fetchMock.mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith("/auth/login")) return response(pending("USER"));
      if (path.endsWith("/auth/login/verify")) return response({ message: "Invalid sign-in code. 4 attempt(s) remaining." }, 400);
      return response({});
    });
    mount("/login");
    await credentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    fireEvent.change(await screen.findByLabelText("Sign-in code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByText(/4 attempt\(s\) remaining/)).toBeTruthy();
    expect(screen.getByLabelText("Sign-in code")).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("the admin console also asks for the code and refuses customer accounts before it", async () => {
    fetchMock.mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith("/auth/login")) return response(pending("ADMIN"));
      if (path.endsWith("/auth/login/verify")) return response({ ...identity, role: "ADMIN", token: "admin-token" });
      if (path.endsWith("/user/profile")) return response({ ...identity, role: "ADMIN" });
      return response({});
    });
    mount("/admin/login");
    fireEvent.change(await screen.findByLabelText("Admin Email"), { target: { value: "test@example.invalid" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In to Admin" }));
    fireEvent.change(await screen.findByLabelText("Sign-in code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await screen.findByRole("heading", { name: "Admin content" });
    expect(localStorage.getItem(TOKEN_KEY)).toBe("admin-token");
  });

  it("a customer account is turned away at the admin console without a code step", async () => {
    fetchMock.mockImplementation(async () => response(pending("USER")));
    mount("/admin/login");
    fireEvent.change(await screen.findByLabelText("Admin Email"), { target: { value: "test@example.invalid" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In to Admin" }));
    expect(await screen.findByText("This account does not have administrator access.")).toBeTruthy();
    expect(screen.queryByLabelText("Sign-in code")).toBeNull();
  });
});

describe("one sign-in page for customers and the admin", () => {
  const pending = (role: "USER" | "ADMIN") => ({
    token: null, email: "test@example.invalid", role, emailVerified: true, accountStatus: "ACTIVE",
    mfaRequired: true, message: "We sent a 6-digit sign-in code to te***@example.invalid.",
  });

  it("choosing Admin on the store sign-in page opens the admin console", async () => {
    fetchMock.mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith("/auth/login")) return response(pending("ADMIN"));
      if (path.endsWith("/auth/login/verify")) return response({ ...identity, role: "ADMIN", token: "admin-token" });
      if (path.endsWith("/user/profile")) return response({ ...identity, role: "ADMIN" });
      return response({});
    });
    mount("/login");
    await credentials();
    fireEvent.click(screen.getByRole("radio", { name: "Admin" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    fireEvent.change(await screen.findByLabelText("Sign-in code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await screen.findByRole("heading", { name: "Admin content" });
    expect(localStorage.getItem(TOKEN_KEY)).toBe("admin-token");
  });

  it("an admin account left on Customer is told to choose Admin", async () => {
    fetchMock.mockImplementation(async () => response(pending("ADMIN")));
    mount("/login");
    await credentials();
    expect(screen.getByRole("radio", { name: "Customer" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText(/Choose .Admin. above/)).toBeTruthy();
    expect(screen.queryByLabelText("Sign-in code")).toBeNull();
  });

  it("a customer account cannot sign in with Admin chosen", async () => {
    fetchMock.mockImplementation(async () => response(pending("USER")));
    mount("/login");
    await credentials();
    fireEvent.click(screen.getByRole("radio", { name: "Admin" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(await screen.findByText("This account does not have administrator access.")).toBeTruthy();
  });
});
