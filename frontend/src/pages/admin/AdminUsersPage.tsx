import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { UserAdminResponse } from "../../types";
import {
  AdminPageHeader,
  ErrorBanner,
  LoadingRow,
  StatusBadge,
  TableShell,
  errorMessage,
  formatDateTime,
  tdClass,
  thClass,
} from "../../components/admin/AdminUi";

const MANAGEABLE_STATUSES = ["ACTIVE", "SUSPENDED", "DISABLED"] as const;

/**
 * Customer accounts. Only safe fields are shown (the API DTO never contains passwords, hashes or OTPs).
 * Admin accounts and the signed-in admin are read-only here — the server enforces the same rule.
 */
export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserAdminResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api.getAdminUsers());
    } catch (err) {
      setError(errorMessage(err, "Failed to load users."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(
      (u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || String(u.id) === q,
    );
  }, [users, query]);

  const setStatus = async (target: UserAdminResponse, status: string) => {
    if (status === target.accountStatus) return;
    if (status !== "ACTIVE" && !window.confirm(`${status === "SUSPENDED" ? "Suspend" : "Disable"} ${target.email}? They will be signed out immediately.`)) return;
    setUpdatingId(target.id);
    setError(null);
    try {
      const updated = await api.updateAdminUserStatus(target.id, status);
      setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setError(errorMessage(err, "Failed to update account status."));
    } finally {
      setUpdatingId(null);
    }
  };

  const customers = users.filter((u) => u.role === "USER").length;

  return (
    <>
      <AdminPageHeader
        title="Customers"
        subtitle={`${customers} customer accounts · ${users.length - customers} administrators`}
        onRefresh={load}
        refreshing={loading}
      />
      <ErrorBanner message={error} />

      <label className="relative block">
        <span className="sr-only">Search users</span>
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or ID"
          className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
        />
      </label>

      <TableShell>
        <thead>
          <tr>
            <th className={thClass}>User</th>
            <th className={thClass}>Phone</th>
            <th className={thClass}>Role</th>
            <th className={thClass}>Email verified</th>
            <th className={thClass}>Registered</th>
            <th className={thClass}>Last login</th>
            <th className={thClass}>Account status</th>
          </tr>
        </thead>
        <tbody>
          {loading && users.length === 0 ? (
            <LoadingRow colSpan={7} />
          ) : visible.length === 0 ? (
            <LoadingRow colSpan={7} text="No users found." />
          ) : (
            visible.map((u) => {
              const readOnly = u.role === "ADMIN" || u.id === me?.id;
              return (
                <tr key={u.id} className="hover:bg-subtle">
                  <td className={tdClass}>
                    <p className="font-semibold">{u.name}</p>
                    <p className="text-xs text-muted">#{u.id} · {u.email}</p>
                  </td>
                  <td className={tdClass}>{u.phoneNumber || "—"}</td>
                  <td className={tdClass}><StatusBadge value={u.role} /></td>
                  <td className={tdClass}>{u.emailVerified ? "Yes" : <span className="text-amber-700 dark:text-amber-400">No</span>}</td>
                  <td className={`${tdClass} text-xs`}>{formatDateTime(u.createdAt)}</td>
                  <td className={`${tdClass} text-xs`}>{formatDateTime(u.lastLoginAt)}</td>
                  <td className={tdClass}>
                    {readOnly || u.accountStatus === "PENDING_VERIFICATION" ? (
                      <StatusBadge value={u.accountStatus} />
                    ) : (
                      <select
                        aria-label={`Account status for ${u.email}`}
                        disabled={updatingId === u.id}
                        value={u.accountStatus}
                        onChange={(e) => void setStatus(u, e.target.value)}
                        className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs font-semibold"
                      >
                        {MANAGEABLE_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableShell>
    </>
  );
}
