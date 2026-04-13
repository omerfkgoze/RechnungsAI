import { signOut } from "@/app/actions/auth";
import { EmptyState } from "@/components/layout/empty-state";

async function signOutFormAction(): Promise<void> {
  "use server";
  // The underlying server action returns ActionResult<void> on failure and
  // throws NEXT_REDIRECT on success; this shim adapts the return type for
  // `<form action={...}>`, which requires a `void | Promise<void>` signature.
  // Errors are logged inside `signOut`; the dashboard placeholder has nowhere
  // to surface them (Story 1.5 replaces this with a real profile menu).
  await signOut();
}

export default function DashboardPage() {
  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        <form action={signOutFormAction}>
          <button
            type="submit"
            className="text-body-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Abmelden
          </button>
        </form>
      </div>
      <EmptyState
        title="Dashboard"
        description="Übersicht kommt in Story 1.5."
      />
    </div>
  );
}
