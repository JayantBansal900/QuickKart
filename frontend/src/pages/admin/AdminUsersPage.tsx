import React, { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { PageResponse, UserAdminResponse } from "../../types";
import { useConfirm } from "../../components/ConfirmDialog";
import {
  AdminPageHeader,
  ErrorBanner,
  LoadingRow,
  PAGE_SIZE,
  Pager,
  StatusBadge,
  TableShell,
  errorMessage,
  formatDateTime,
  tdClass,
  thClass,
  useDebounced,
} from "../../components/admin/AdminUi";

const MANAGEABLE_STATUSES = ["ACTIVE", "SUSPENDED", "DISABLED"] as const;

/**
 * Customer accounts, paged on the server. Only safe fields are shown (the API DTO never contains
 * passwords, hashes or OTPs). Admin accounts and the signed-in admin are read-only here — the
 * server enforces the same rule.
 */
export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [result, setResult] = useState<PageResponse<UserAdminResponse> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"ALL" | "USER" | "ADMIN">("ALL");
  const [page, setPage] = useState(0);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [confirmDialog, confirm] = useConfirm();
  const q = useDebounced(query.trim());

  useEffect(() => setPage(0), [q, role]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.getAdminUsers({ q, role: role === "ALL" ? undefined : role, page, size: PAGE_SIZE }));
    } catch (err) {
      setError(errorMessage(err, "Failed to load users."));
    } finally {
      setLoading(false);
    }
  }, [q, role, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const users = result?.content ?? [];

  const setStatus = async (target: UserAdminResponse, status: string) => {
    if (status === target.accountStatus) return;
    if (
      status !== "ACTIVE" &&
      !(await confirm({
        title: `${status === "SUSPENDED" ? "Suspend" : "Disable"} ${target.email}?`,
        message: "They are signed out on every device immediately and can't place orders.",
        confirmLabel: status === "SUSPENDED" ? "Suspend" : "Disable",
        danger: true,
      }))
    ) return;
    setUpdatingId(target.id);
    setError(null);
    try {
      const updated = await api.updateAdminUserStatus(target.id, status);
      setResult((r) => r && { ...r, content: r.content.map((u) => (u.id === updated.id ? updated : u)) });
    } catch (err) {
      setError(errorMessage(err, "Failed to update account status."));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <>
      {confirmDialog}
      <AdminPageHeader
        title="Customers"
        subtitle={result ? `${result.totalElements} ${role === "ADMIN" ? "administrators" : role === "USER" ? "customer accounts" : "accounts"}` : "Loading…"}
        onRefresh={load}
        refreshing={loading}
      />
      <ErrorBanner message={error} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search users</span>
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email or ID"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
          />
        </label>
        <select
          aria-label="Filter by role"
          value={role}
          onChange={(e) => setRole(e.target.value as "ALL" | "USER" | "ADMIN")}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        >
          <option value="ALL">All roles</option>
          <option value="USER">Customers</option>
          <option value="ADMIN">Administrators</option>
        </select>
      </div>

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
          ) : users.length === 0 ? (
            <LoadingRow colSpan={7} text="No users found." />
          ) : (
            users.map((u) => {
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
                  <td className={`${tdClass} text-xs`}>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</td>
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
      {result && (
        <Pager page={result.page} totalPages={result.totalPages} totalElements={result.totalElements} onPage={setPage} label="accounts" />
      )}
    </>
  );
}
