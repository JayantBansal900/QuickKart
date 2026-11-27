import React, { useRef, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/http";
import { safeDestination } from "../../routing";

/**
 * Dedicated administrator sign-in. Uses the same backend /api/auth/login, but refuses to
 * create a session for non-ADMIN accounts (the token is discarded before it is stored).
 */
export function AdminLoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  const requested = safeDestination(new URLSearchParams(location.search).get("next"), "/admin");
  const next = requested.startsWith("/admin") && !requested.startsWith("/admin/login") ? requested : "/admin";

  if (auth.status === "initializing")
    return <p role="status" className="p-8">Checking your session…</p>;
  if (auth.isAdmin) return <Navigate replace to={next} />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await auth.login(email, password, { requireAdmin: true });
    } catch (err) {
      setPassword("");
      if (err instanceof ApiError && err.status === 429)
        setError("Too many attempts. Please wait a minute and try again.");
      else setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const field = "mt-1 w-full rounded-lg border border-line bg-surface p-2.5 text-sm text-fg focus:border-accent focus:outline-none";
  return (
    <div className="flex min-h-screen items-center justify-center bg-fg px-4">
      <section className="w-full max-w-sm rounded-xl bg-surface p-7 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fg text-bg">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-fg">Administrator Sign In</h1>
            <p className="text-xs text-muted">QuickKart management console</p>
          </div>
        </div>
        {auth.isAuthenticated && !auth.isAdmin && (
          <p role="status" className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            You are signed in as a customer. Sign in with an administrator account to continue.
          </p>
        )}
        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-sale-soft p-3 text-sm text-sale">
            {error}
          </p>
        )}
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-fg">
            Admin Email
            <input className={field} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-fg">
            Password
            <input className={field} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-fg p-2.5 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50">
            {busy ? "Signing in…" : "Sign In to Admin"}
          </button>
        </form>
        <Link to="/" className="mt-5 block text-center text-xs text-muted underline">
          Back to store
        </Link>
      </section>
    </div>
  );
}
