import { TrustBadgeBarClient } from "./trust-badge-bar-client";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { SignOutMenu } from "./sign-out-menu";
import { KeyboardShortcutsHelp } from "./keyboard-shortcuts-help";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <TrustBadgeBarClient />
      <div className="flex flex-1">
        <SidebarNav footer={<SignOutMenu />} />
        <main className="flex-1 pb-20 lg:pb-6">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-6">
            {children}
          </div>
        </main>
      </div>
      <MobileNav />
      <KeyboardShortcutsHelp />
    </div>
  );
}
