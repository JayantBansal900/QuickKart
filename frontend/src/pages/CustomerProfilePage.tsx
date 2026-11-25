import { AccountNav } from '../components/AccountNav';
import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, BadgeCheck, CheckCircle2, LogOut, Package, ShoppingBag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { UserProfileResponse } from '../types';

interface CustomerProfilePageProps {
  onNavigateToOrders: () => void;
  onNavigateToStore: () => void;
}

export const CustomerProfilePage: React.FC<CustomerProfilePageProps> = ({ onNavigateToOrders, onNavigateToStore }) => {
  const { user, logout, updateUserState, openAuthModal, isAuthenticated } = useAuth();

  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [savedAddress, setSavedAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getMyProfile();
      setProfile(data);
      setName(data.name || '');
      setPhoneNumber(data.phoneNumber || '');
      setSavedAddress(data.savedAddress || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) void loadProfile();
    else setIsLoading(false);
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="qk-container flex flex-col items-center py-24 text-center">
        <h1 className="text-xl font-semibold text-fg">Sign in to see your account</h1>
        <button type="button" onClick={() => openAuthModal('login')} className="qk-btn qk-btn-primary mt-6">Sign in</button>
      </div>
    );
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await api.updateMyProfile({ name, phoneNumber, savedAddress: savedAddress.trim() });
      setProfile(updated);
      setIsEditing(false);
      setSuccessMsg('Your profile has been updated.');
      if (user) updateUserState({ ...user, name: updated.name, phoneNumber: updated.phoneNumber });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const displayName = profile?.name || user?.name || '';
  const rows: [string, React.ReactNode][] = [
    ['Name', profile?.name || '—'],
    ['Email', (
      <span className="inline-flex items-center gap-2">
        {profile?.email || user?.email}
        {profile?.emailVerified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
            <BadgeCheck className="h-3.5 w-3.5" /> Verified
          </span>
        )}
      </span>
    )],
    ['Phone', profile?.phoneNumber || <span className="text-muted">Not added</span>],
    ['Delivery address', profile?.savedAddress ? <span className="whitespace-pre-line">{profile.savedAddress}</span> : <span className="text-muted">Not saved. It’s saved at checkout, or add it here.</span>],
  ];

  return (
    <div className="qk-container max-w-3xl py-10">
      <AccountNav />
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-accent-soft text-2xl font-semibold text-accent">
            {(displayName.trim()[0] ?? 'U').toUpperCase()}
          </span>
          <div>
            <h1 className="qk-display text-4xl text-fg">{displayName}</h1>
            <p className="text-sm text-muted">{profile?.email || user?.email}</p>
          </div>
        </div>
        <button type="button" onClick={logout} className="qk-btn qk-btn-ghost h-10 self-start px-4 sm:self-auto">
          <LogOut className="h-4 w-4" /> Sign out of account
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-6 flex items-center gap-2 rounded-xl bg-sale-soft p-4 text-sm text-sale">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {successMsg && (
        <div role="status" className="mt-6 flex items-center gap-2 rounded-xl bg-success-soft p-4 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {successMsg}
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <button type="button" onClick={onNavigateToOrders} className="qk-card group flex items-center gap-4 p-5 text-left transition-shadow hover:shadow-card">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-subtle text-fg"><Package className="h-5 w-5" /></span>
          <span className="flex-1">
            <span className="block font-medium text-fg">Your orders</span>
            <span className="block text-sm text-muted">Track and manage orders</span>
          </span>
          <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
        </button>
        <button type="button" onClick={onNavigateToStore} className="qk-card group flex items-center gap-4 p-5 text-left transition-shadow hover:shadow-card">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-subtle text-fg"><ShoppingBag className="h-5 w-5" /></span>
          <span className="flex-1">
            <span className="block font-medium text-fg">Continue shopping</span>
            <span className="block text-sm text-muted">Browse the catalog</span>
          </span>
          <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      <section className="qk-card mt-6">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-semibold text-fg">Personal details</h2>
          {!isEditing && !isLoading && (
            <button
              type="button"
              onClick={() => { setIsEditing(true); setSuccessMsg(null); setError(null); }}
              className="text-sm font-medium text-accent hover:underline"
            >
              Edit
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4 p-6">
            {[1, 2, 3].map((n) => <div key={n} className="h-5 w-2/3 animate-pulse rounded-full bg-subtle" />)}
          </div>
        ) : isEditing ? (
          <form onSubmit={handleUpdateProfile} className="max-w-md space-y-4 p-6">
            <label className="qk-label" htmlFor="profile-name">
              Full Name
              <input id="profile-name" className="qk-input" type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="qk-label" htmlFor="profile-phone">
              Phone Number
              <input id="profile-phone" className="qk-input" type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
            </label>
            <label className="qk-label" htmlFor="profile-address">
              Default delivery address
              <textarea id="profile-address" className="qk-input" rows={3} maxLength={1000} autoComplete="street-address" placeholder="House no., street, area, city, PIN code" value={savedAddress} onChange={(e) => setSavedAddress(e.target.value)} />
              <span className="mt-1 block text-xs font-normal text-muted">Filled in for you at checkout. Leave empty to remove it.</span>
            </label>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={isSaving} className="qk-btn qk-btn-primary">{isSaving ? 'Saving…' : 'Save changes'}</button>
              <button type="button" onClick={() => setIsEditing(false)} className="qk-btn qk-btn-ghost">Cancel</button>
            </div>
          </form>
        ) : (
          <dl className="divide-y divide-line">
            {rows.map(([label, value]) => (
              <div key={label} className="grid gap-1 px-6 py-4 sm:grid-cols-[140px_1fr]">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-sm text-fg">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
};
