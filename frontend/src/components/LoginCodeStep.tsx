import React, { useEffect, useRef, useState } from 'react';
import { MailCheck } from 'lucide-react';

interface LoginCodeStepProps {
  /** Server message such as "We sent a 6-digit sign-in code to jo***@gmail.com." */
  message: string;
  busy: boolean;
  onVerify: (code: string) => void;
  onResend: () => void;
  onBack: () => void;
}

/** Second sign-in step: the 6-digit code emailed after a correct password. */
export const LoginCodeStep: React.FC<LoginCodeStepProps> = ({ message, busy, onVerify, onResend, onBack }) => {
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(30);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  return (
    <form
      className="mt-8 space-y-4"
      aria-label="Enter your sign-in code"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6) onVerify(code);
      }}
    >
      <div className="flex items-start gap-3 rounded-lg bg-subtle p-3 text-sm text-fg">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{message} It is valid for 5 minutes.</p>
      </div>
      <label className="qk-label">
        Sign-in code
        <input
          ref={input}
          className="qk-input text-center font-mono text-lg tracking-[0.5em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="••••••"
        />
      </label>
      <button type="submit" disabled={busy || code.length !== 6} className="qk-btn qk-btn-primary w-full">
        {busy ? 'Checking…' : 'Verify and sign in'}
      </button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="text-muted underline underline-offset-2 hover:text-fg">
          Use a different account
        </button>
        <button
          type="button"
          disabled={busy || cooldown > 0}
          onClick={() => { setCooldown(30); onResend(); }}
          className="text-fg underline underline-offset-2 disabled:text-muted disabled:no-underline"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </form>
  );
};
