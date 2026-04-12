import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <EmptyState
        title="Seite nicht gefunden"
        description="Die angeforderte Seite existiert nicht mehr."
        action={
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            Zurück zur Übersicht
          </Link>
        }
      />
    </div>
  );
}
