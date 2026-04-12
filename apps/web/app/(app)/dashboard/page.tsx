import { signOut } from "@/app/actions/auth";
import { EmptyState } from "@/components/layout/empty-state";

export default function DashboardPage() {
  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        <form action={signOut}>
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
