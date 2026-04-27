import { AppShell } from "@/components/layout/app-shell";
import { ActionToastRoot } from "@/components/ui/action-toast-stack";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ActionToastRoot>
      <AppShell>{children}</AppShell>
    </ActionToastRoot>
  );
}
