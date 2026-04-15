import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { redirect } from "next/navigation";

async function signOutFormAction(): Promise<void> {
  "use server";
  // On failure, redirect to /login with an error param so the login page
  // can surface a generic message. The session cookie is cleared on the
  // next middleware pass regardless.
  const result = await signOut();
  if (result && result.success === false) {
    console.error("[dashboard:signout]", result.error);
    redirect("/login?error=signout_failed");
  }
}

/**
 * Renders a sign-out form button.
 * Mounted in SidebarNav footer (desktop) and MobileNav overflow (mobile).
 * Accepts an optional `collapsed` prop so the sidebar can hide the label
 * when the sidebar is collapsed.
 */
export function SignOutMenu({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <form action={signOutFormAction}>
      <button
        type="submit"
        aria-label="Abmelden"
        className={
          collapsed
            ? "flex h-10 w-full items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-light))]"
            : "flex h-10 w-full items-center gap-3 rounded-md px-3 text-body-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-light))]"
        }
      >
        <LogOut className="size-4 shrink-0" aria-hidden="true" />
        {!collapsed && <span>Abmelden</span>}
      </button>
    </form>
  );
}
