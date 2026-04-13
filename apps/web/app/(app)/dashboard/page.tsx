import { signOut } from "@/app/actions/auth";
import { EmptyState } from "@/components/layout/empty-state";

async function signOutFormAction(): Promise<void> {
  "use server";
  // The underlying server action throws NEXT_REDIRECT on success; on failure
  // it returns ActionResult<void>. This dashboard placeholder has no UI to
  // surface a soft error, so on failure we redirect to /login with an error
  // query param — the login page can show a generic toast/message and the
  // session cookie is still cleared on the next middleware pass for any
  // subsequent navigation. (Story 1.5 replaces this with a real profile menu
  // that can render the error inline.)
  const { redirect } = await import("next/navigation");
  const result = await signOut();
  if (result && result.success === false) {
    console.error("[dashboard:signout]", result.error);
    redirect("/login?error=signout_failed");
  }
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
