"use client";

import { cn } from "@/lib/utils";
import {
  ActionToastProvider,
  useActionToast,
  type ActionToastRecord,
} from "./action-toast-context";

function ToastItem({ toast }: { toast: ActionToastRecord }) {
  const { dismiss } = useActionToast();
  const isApproved = toast.kind === "approved";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={`action-toast-${toast.kind}`}
      className={cn(
        "pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-lg border shadow-lg",
        isApproved
          ? "bg-confidence-high/10 border-confidence-high/40 text-foreground"
          : "bg-confidence-medium/10 border-confidence-medium/40 text-foreground",
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-body font-medium">{toast.message}</p>
        <button
          type="button"
          className="text-caption font-semibold text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={async () => {
            try {
              await toast.undo();
            } finally {
              dismiss(toast.id);
            }
          }}
        >
          Rückgängig
        </button>
      </div>
      <span
        aria-hidden
        className={cn(
          "absolute bottom-0 left-0 h-0.5 w-full origin-left motion-reduce:hidden",
          isApproved ? "bg-confidence-high" : "bg-confidence-medium",
        )}
        style={{
          animation: "rai-toast-countdown 5000ms linear forwards",
        }}
      />
    </div>
  );
}

function ActionToastStackInner() {
  const { toasts } = useActionToast();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-[max(env(safe-area-inset-bottom,0px),16px)]">
      <style>{`@keyframes rai-toast-countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

export function ActionToastStack() {
  return <ActionToastStackInner />;
}

export function ActionToastRoot({ children }: { children: React.ReactNode }) {
  return (
    <ActionToastProvider>
      {children}
      <ActionToastStackInner />
    </ActionToastProvider>
  );
}
