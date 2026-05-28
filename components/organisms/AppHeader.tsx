import Link from "next/link";

import { Badge } from "@/components/atoms/Badge";
import { LanguageSwitcher } from "@/components/molecules/LanguageSwitcher";
import { SignOutButton } from "@/components/organisms/SignOutButton";
import { getTranslator } from "@/i18n/server";
import type { CurrentUser } from "@/types/domain";

interface AppHeaderProps {
  user: CurrentUser;
}

export async function AppHeader({ user }: AppHeaderProps) {
  const { t } = await getTranslator();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-semibold text-slate-900">
            {t("app.name")}
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">
              {t("nav.dashboard")}
            </Link>
            {user.role === "admin" ? (
              <Link href="/admin" className="text-slate-600 hover:text-slate-900">
                {t("nav.admin")}
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-500 sm:inline">
            {user.email}
          </span>
          <Badge tone={user.role === "admin" ? "brand" : "neutral"}>{user.role}</Badge>
          <LanguageSwitcher />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
