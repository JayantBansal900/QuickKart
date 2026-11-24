import React, { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/http";
import { safeDestination } from "../routing";
import { api } from "../services/api";

type Mode = "login" | "register" | "verify" | "forgot" | "reset";
const MODES: Record<string, Mode> = {
  "/register": "register",
  "/verify-email": "verify",
  "/forgot-password": "forgot",
  "/reset-password": "reset",
};
export function AuthPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const mode: Mode = MODES[location.pathname] ?? "login";
  const next = safeDestination(
    new URLSearchParams(location.search).get("next"),
    auth.isAdmin ? "/admin" : "/account/profile",
  );
  const suffix = `?next=${encodeURIComponent(next)}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [cooldown, setCooldown] = useState(0);
  const [limited, setLimited] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // Reset per-screen fields when the mode changes. Done during render (not in an effect) so there
  // is no window where the new screen is visible and a fast typist's input then gets wiped.
  const [shownMode, setShownMode] = useState(mode);
  if (shownMode !== mode) {
    setShownMode(mode);
    setError("");
    setPassword("");
    setConfirmPassword("");
    setOtp("");
  }
  useEffect(() => {
    heading.current?.focus();
  }, [mode, auth.status]);
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);
  if (auth.status === "initializing")
    return (
      <p role="status" className="p-8">
        Checking your session…
      </p>
    );
  if (auth.isAuthenticated) return <Navigate replace to={next} />;
  const perform = async (resend = false) => {
    if (pending.current || (cooldown > 0 && (resend || limited))) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (resend && mode === "reset") {
        await api.forgotPassword({ email: email.trim() });
        setNotice("If an account exists for this email, a new reset code has been sent.");
        setCooldown(60);
      } else if (resend) {
        await auth.resendOtp({ email: email.trim() });
        setNotice("A new code has been sent.");
        setCooldown(60);
      } else if (mode === "forgot") {
        await api.forgotPassword({ email: email.trim() });
        setCooldown(60);
        navigate("/reset-password" + suffix);
        // Same message whether or not the account exists (no account enumeration).
        setNotice("If an account exists for this email, we've sent a 6-digit reset code.");
      } else if (mode === "reset") {
        if (password !== confirmPassword) {
          setError("The two passwords don't match.");
          return;
        }
        await api.resetPassword({ email: email.trim(), otp, newPassword: password });
        navigate("/login" + suffix);
        setNotice("Password updated. Sign in with your new password — other devices have been signed out.");
      } else if (mode === "login") await auth.login(email, password);
      else if (mode === "register") {
        await auth.register(name, email, password, phone || undefined);
        setNotice(
          "Account created. Check your email for the verification code.",
        );
        setCooldown(60);
        navigate("/verify-email" + suffix);
      } else await auth.verifyOtp({ email: email.trim(), otp });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to complete this request.";
      setError(message);
      if (err instanceof ApiError && err.status === 429) {
        setCooldown(err.retryAfter ?? 60);
        setLimited(true);
      }
      if (mode === "login" && /not verified|unverified/i.test(message)) {
        navigate("/verify-email" + suffix);
        setNotice(
          "Verify your email before signing in. Request a new code if needed.",
        );
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const titles = {
    login: ["Sign In", "Welcome back. Sign in to continue shopping."],
    register: ["Create Account", "Join QuickKart in less than a minute."],
    verify: ["Verify Your Email", "Enter the 6-digit code we sent to your inbox."],
    forgot: ["Forgot Password", "Enter your email and we'll send you a code to reset it."],
    reset: ["Reset Password", "Enter the code from your email and choose a new password."],
  } as const;
  const [title, subtitle] = titles[mode];
  const tab = (to: string, label: string, active: boolean) => (
    <Link
      to={to + suffix}
      className={`flex-1 rounded-md py-2 text-center text-sm font-medium transition-colors ${
        active ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="qk-container grid min-h-[calc(100vh-4rem)] items-center gap-10 py-10 lg:grid-cols-2">
      {/* Brand panel (desktop only) */}
      <div className="relative hidden h-full min-h-[560px] overflow-hidden rounded-2xl bg-[#171412] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <img
          src="/categories/auth.webp"
          alt=""
          onError={(e) => { e.currentTarget.style.display = "none"; }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20" />
        <p className="relative text-lg font-semibold tracking-tight">quickkart</p>
        <div className="relative">
          <h2 className="qk-display text-5xl">Shop smarter.<br /><span className="text-white/70">Pay on delivery.</span></h2>
          <ul className="mt-8 space-y-3 text-sm opacity-80">
            <li>✓ 144 hand-picked products across 8 categories</li>
            <li>✓ Cash on delivery on every order</li>
            <li>✓ Email-verified accounts</li>
          </ul>
        </div>
        <p className="relative text-xs opacity-60">© {new Date().getFullYear()} QuickKart</p>
      </div>

      {/* Form */}
      <section className="mx-auto w-full max-w-md">
        {(mode === "login" || mode === "register") && (
          <div className="mb-8 flex rounded-lg bg-subtle p-1">
            {tab("/login", "Sign in", mode === "login")}
            {tab("/register", "Create account", mode === "register")}
          </div>
        )}
        <h1 ref={heading} tabIndex={-1} className="qk-display text-4xl text-fg outline-none">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted">{subtitle}</p>

        {auth.status === "invalid" && (
          <p role="status" className="mt-6 rounded-xl bg-subtle p-3 text-sm text-fg">
            Your session is no longer valid. Please sign in again.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-6 rounded-xl bg-sale-soft p-3 text-sm text-sale">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-6 rounded-xl bg-success-soft p-3 text-sm text-success">
            {notice}
          </p>
        )}

        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void perform();
          }}
        >
          {mode === "register" && (
            <label className="qk-label">
              Full Name
              <input className="qk-input" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label className="qk-label">
            Email Address
            <input className="qk-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode === "register" && (
            <label className="qk-label">
              Phone Number (optional)
              <input className="qk-input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          )}
          {(mode === "verify" || mode === "reset") && (
            <label className="qk-label">
              {mode === "reset" ? "Reset Code" : "Verification Code"}
              <input
                className="qk-input text-center text-2xl font-semibold tracking-[0.5em]"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
          )}
          {(mode === "login" || mode === "register" || mode === "reset") && (
            <label className="qk-label">
              {mode === "reset" ? "New Password" : "Password"}
              <input
                className="qk-input"
                type="password"
                required
                minLength={mode === "login" ? undefined : 6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {mode === "reset" && (
            <label className="qk-label">
              Confirm New Password
              <input
                className="qk-input"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
          )}
          {mode === "login" && (
            <div className="-mt-1 text-right">
              <Link to={"/forgot-password" + suffix} className="text-sm font-medium text-accent hover:underline">
                Forgot password?
              </Link>
            </div>
          )}
          <button
            className="qk-btn qk-btn-primary h-12 w-full"
            disabled={busy || (limited && cooldown > 0)}
            type="submit"
          >
            {busy
              ? "Please wait…"
              : limited && cooldown > 0
                ? `Try again in ${cooldown}s`
                : {
                    login: "Sign In",
                    register: "Create Account",
                    verify: "Verify & Activate Account",
                    forgot: "Send Reset Code",
                    reset: "Reset Password",
                  }[mode]}
          </button>
          {(mode === "verify" || mode === "reset") && (
            <button
              type="button"
              className="w-full text-center text-sm font-medium text-accent disabled:text-muted"
              disabled={busy || cooldown > 0 || !email.trim()}
              onClick={() => void perform(true)}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
            </button>
          )}
        </form>
        <nav aria-label="Account options" className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted">
          {mode === "verify" || mode === "forgot" || mode === "reset" ? (
            <Link to={"/login" + suffix} className="hover:text-fg">Back to sign in</Link>
          ) : (
            <Link to={"/verify-email" + suffix} className="hover:text-fg">Have a verification code?</Link>
          )}
          <Link to="/" className="hover:text-fg">Continue shopping</Link>
        </nav>
      </section>
    </div>
  );
}
