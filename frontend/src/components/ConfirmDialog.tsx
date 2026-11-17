import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * Styled replacement for window.confirm. Usage:
 *   const [confirmDialog, confirm] = useConfirm();
 *   if (!(await confirm({ title: 'Delete?' }))) return;
 *   ...render {confirmDialog} once in the component.
 */
export function useConfirm(): [React.ReactNode, (options: ConfirmOptions) => Promise<boolean>] {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );
  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };
  return [pending ? <ConfirmDialog {...pending} onClose={close} /> : null, confirm];
}

function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onClose,
}: ConfirmOptions & { onClose: (ok: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Destructive dialogs focus "Cancel" so an accidental Enter is harmless.
    (danger ? cancelRef : confirmRef).current?.focus();
    return () => previous?.focus();
  }, [danger]);

  const keys = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose(false);
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      (document.activeElement === cancelRef.current ? confirmRef : cancelRef).current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onKeyDown={keys}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => onClose(false)} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="qk-confirm-title"
        aria-describedby={message ? 'qk-confirm-message' : undefined}
        className="relative w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-card"
      >
        <div className={`grid h-11 w-11 place-items-center rounded-full ${danger ? 'bg-sale-soft text-sale' : 'bg-accent-soft text-accent'}`}>
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 id="qk-confirm-title" className="mt-4 text-lg font-semibold text-fg">{title}</h2>
        {message && <div id="qk-confirm-message" className="mt-1.5 text-sm leading-relaxed text-muted">{message}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={() => onClose(false)} className="qk-btn qk-btn-ghost h-10 px-4 text-sm">
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onClose(true)}
            className={`qk-btn h-10 px-4 text-sm ${danger ? 'bg-sale text-white hover:opacity-90' : 'qk-btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
