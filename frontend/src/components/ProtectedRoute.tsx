import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
export function ProtectedRoute({ admin = false }: { admin?: boolean }) {
  const { status, isAdmin, sessionError, retrySession, logout } = useAuth();
  const location = useLocation();
  if (status === "initializing")
    return (
      <p role="status" className="p-8">
        Checking your session…
      </p>
    );
  if (status === "unavailable")
    return (
      <div className="p-8" role="alert">
        {sessionError}
        <button onClick={retrySession}>Retry session check</button>
        <button onClick={logout}>Sign out</button>
      </div>
    );
  if (status !== "authenticated")
    return (
      <Navigate
        replace
        to={`${admin ? "/admin/login" : "/login"}?next=${encodeURIComponent(location.pathname + location.search)}`}
      />
    );
  if (admin && !isAdmin)
    return (
      <div className="p-8" role="alert">
        <h1>Access denied</h1>
        <p>This page requires an administrator account.</p>
      </div>
    );
  return <Outlet />;
}
