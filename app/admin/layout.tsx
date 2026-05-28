import { AppShell } from "@/components/templates/AppShell";
import { requireAdmin } from "@/services/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware also gates /admin/*, but requireAdmin gives us a typed user in pages.
  const user = await requireAdmin();
  return <AppShell user={user}>{children}</AppShell>;
}
