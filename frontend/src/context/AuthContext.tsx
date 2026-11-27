import {clearCheckoutAttempts} from '../services/checkoutAttempt';
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  User,
  AuthResponse,
  VerifyOtpRequest,
  ResendOtpRequest,
} from "../types";
import { api } from "../services/api";
import { ApiError, TOKEN_KEY, SESSION_INVALID } from "../services/http";
import { safeDestination } from "../routing";
type AuthModalTab = "login" | "register" | "adminLogin";
export type SessionStatus =
  | "initializing"
  | "authenticated"
  | "unauthenticated"
  | "invalid"
  | "unavailable";
interface AuthContextType {
  user: User | null;
  status: SessionStatus;
  sessionError: string | null;
  retrySession: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** requireAdmin: used by /admin/login — a non-admin account never gets a session there. */
  login: (
    email: string,
    password: string,
    options?: { requireAdmin?: boolean },
  ) => Promise<AuthResponse>;
  /** Second step after login() answered mfaRequired: the emailed code. */
  verifyLogin: (
    email: string,
    otp: string,
    options?: { requireAdmin?: boolean },
  ) => Promise<AuthResponse>;
  register: (
    name: string,
    email: string,
    password: string,
    phoneNumber?: string,
  ) => Promise<AuthResponse>;
  verifyOtp: (request: VerifyOtpRequest) => Promise<AuthResponse>;
  resendOtp: (request: ResendOtpRequest) => Promise<void>;
  logout: () => void;
  updateUserState: (user: User) => void;
  openAuthModal: (initialTab?: AuthModalTab) => void;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
function eligible(user: User) {
  return (
    user.emailVerified === true &&
    user.accountStatus === "ACTIVE" &&
    ["USER", "ADMIN"].includes(user.role)
  );
}
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<SessionStatus>("initializing");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const generation = useRef(0);
  const navigate = useNavigate();
  const location = useLocation();
  const clear = useCallback((next: SessionStatus) => {
    generation.current++;
    clearCheckoutAttempts();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("quickkart_user");
    setUser(null);
    setStatus(next);
    setSessionError(null);
  }, []);
  const restore = useCallback(async () => {
    const version = ++generation.current;
    localStorage.removeItem("quickkart_user");
    setUser(null);
    setSessionError(null);
    if (!localStorage.getItem(TOKEN_KEY)) {
      clearCheckoutAttempts();
      setStatus("unauthenticated");
      return;
    }
    setStatus("initializing");
    try {
      const profile = await api.getMyProfile();
      if (version !== generation.current) return;
      if (!eligible(profile)) {
        clear("invalid");
        return;
      }
      setUser(profile);
      setStatus("authenticated");
    } catch (error) {
      if (version !== generation.current) return;
      if (error instanceof ApiError && [401, 403].includes(error.status))
        clear("invalid");
      else {
        setStatus("unavailable");
        setSessionError(
          error instanceof Error
            ? error.message
            : "Session validation unavailable.",
        );
      }
    }
  }, [clear]);
  useEffect(() => {
    const invalid = () => clear("invalid");
    const storage = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY || event.key === null) void restore();
    };
    window.addEventListener(SESSION_INVALID, invalid);
    window.addEventListener("storage", storage);
    void restore();
    return () => {
      generation.current++;
      window.removeEventListener(SESSION_INVALID, invalid);
      window.removeEventListener("storage", storage);
    };
  }, [restore, clear]);
  /** Separate front doors: staff use the admin console, customers use the store sign-in. */
  const checkPortal = (role: string | undefined, requireAdmin: boolean) => {
    if (requireAdmin && role !== "ADMIN")
      throw new Error("This account does not have administrator access.");
    if (!requireAdmin && role === "ADMIN")
      throw new Error("Administrator accounts sign in through the admin console at /admin/login.");
  };
  const establish = async (
    operation: () => Promise<AuthResponse>,
    requireAdmin = false,
  ) => {
    const version = ++generation.current;
    const response = await operation();
    if (version !== generation.current)
      throw new Error("Session changed. Please sign in again.");
    if (!response.token || !eligible(response))
      throw new Error(
        "No verified active session was returned. Please sign in again.",
      );
    // Checked BEFORE the token is stored: a customer using the admin login gets no session.
    // (UX only — the backend independently enforces ADMIN on every /api/admin call.)
    checkPortal(response.role, requireAdmin);
    localStorage.setItem(TOKEN_KEY, response.token);
    const { token: _token, ...identity } = response;
    setUser(identity);
    setStatus("authenticated");
    setSessionError(null);
    const destination = safeDestination(
      new URLSearchParams(location.search).get("next"),
      response.role === "ADMIN" ? "/admin" : "/account/profile",
    );
    navigate(destination, { replace: true });
    return response;
  };
  const logout = () => {
    const fromAdmin = location.pathname.startsWith("/admin");
    clear("unauthenticated");
    navigate(fromAdmin ? "/admin/login" : "/login", { replace: true });
  };
  const openAuthModal = (tab: AuthModalTab = "login") => {
    if (tab === "adminLogin") {
      navigate("/admin/login");
      return;
    }
    const destination = location.pathname + location.search;
    navigate(
      `${tab === "register" ? "/register" : "/login"}?next=${encodeURIComponent(safeDestination(destination, "/"))}`,
    );
  };
  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        sessionError,
        retrySession: () => void restore(),
        isAuthenticated: status === "authenticated",
        isAdmin: status === "authenticated" && user?.role === "ADMIN",
        login: async (email, password, options) => {
          const requireAdmin = options?.requireAdmin === true;
          const response = await api.login(email.trim(), password);
          if (response.mfaRequired) {
            // Wrong door: say so now, not after the customer has typed the code.
            checkPortal(response.role, requireAdmin);
            return response;
          }
          return establish(async () => response, requireAdmin);
        },
        verifyLogin: (email, otp, options) =>
          establish(() => api.verifyLogin(email.trim(), otp), options?.requireAdmin === true),
        register: (name, email, password, phone) =>
          api.register(name.trim(), email.trim(), password, phone),
        verifyOtp: (request) => establish(() => api.verifyOtp(request)),
        resendOtp: async (request) => {
          await api.resendOtp(request);
        },
        logout,
        updateUserState: (updated) =>
          setUser((current) =>
            current && current.id === updated.id
              ? {
                  ...current,
                  name: updated.name,
                  phoneNumber: updated.phoneNumber,
                }
              : current,
          ),
        openAuthModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is required");
  return context;
};
