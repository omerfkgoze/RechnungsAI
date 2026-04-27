"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type ActionToastKind = "approved" | "flagged";

export type ActionToastSnapshot = {
  status: "captured" | "processing" | "ready" | "review" | "exported";
  approved_at: string | null;
  approved_by: string | null;
  approval_method: string | null;
};

export type ActionToastRecord = {
  id: string;
  kind: ActionToastKind;
  invoiceId: string;
  message: string;
  undo: () => void | Promise<void>;
};

type ActionToastContextValue = {
  toasts: ActionToastRecord[];
  showActionToast: (
    args: Omit<ActionToastRecord, "id">,
  ) => void;
  dismiss: (id: string) => void;
};

const ActionToastContext = createContext<ActionToastContextValue | null>(null);

const MAX_STACK = 3;

export function ActionToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ActionToastRecord[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showActionToast = useCallback<ActionToastContextValue["showActionToast"]>(
    (args) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const record: ActionToastRecord = { id, ...args };
      setToasts((prev) => {
        // Per-invoice dedup: if a toast already exists for this invoice, drop it.
        const filtered = prev.filter((t) => {
          if (t.invoiceId === record.invoiceId) {
            const oldTimer = timersRef.current.get(t.id);
            if (oldTimer) {
              clearTimeout(oldTimer);
              timersRef.current.delete(t.id);
            }
            return false;
          }
          return true;
        });
        // Cap at MAX_STACK — drop oldest first.
        const next = [...filtered, record];
        while (next.length > MAX_STACK) {
          const evicted = next.shift();
          if (evicted) {
            const t = timersRef.current.get(evicted.id);
            if (t) {
              clearTimeout(t);
              timersRef.current.delete(evicted.id);
            }
          }
        }
        return next;
      });
      const timer = setTimeout(() => {
        dismiss(id);
      }, 5000);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({ toasts, showActionToast, dismiss }),
    [toasts, showActionToast, dismiss],
  );

  return (
    <ActionToastContext.Provider value={value}>
      {children}
    </ActionToastContext.Provider>
  );
}

export function useActionToast(): ActionToastContextValue {
  const ctx = useContext(ActionToastContext);
  if (!ctx) {
    throw new Error("useActionToast must be used inside <ActionToastProvider>");
  }
  return ctx;
}
