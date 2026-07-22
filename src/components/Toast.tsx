import { useEffect } from 'react';
import { create } from 'zustand';

interface ToastState {
  message: string | null;
  seq: number;
  show: (message: string) => void;
  hide: () => void;
}

/** Tiny standalone store — confirmations shouldn't churn the app store. */
export const useToast = create<ToastState>((set) => ({
  message: null,
  seq: 0,
  show: (message) => set((s) => ({ message, seq: s.seq + 1 })),
  hide: () => set({ message: null }),
}));

export function ToastHost() {
  const message = useToast((s) => s.message);
  const seq = useToast((s) => s.seq);
  const hide = useToast((s) => s.hide);

  useEffect(() => {
    if (message === null) return;
    const t = setTimeout(hide, 2200);
    return () => clearTimeout(t);
  }, [message, seq, hide]);

  if (message === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
    >
      <div className="rise bg-accent text-accent-ink max-w-full truncate rounded-full px-4 py-2.5 text-[13px] font-medium shadow-[var(--shadow-sheet)]">
        {message}
      </div>
    </div>
  );
}
