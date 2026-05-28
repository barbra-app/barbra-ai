import { AppHeader } from "@/components/organisms/AppHeader";
import type { CurrentUser } from "@/types/domain";

interface AppShellProps {
  user: CurrentUser;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
