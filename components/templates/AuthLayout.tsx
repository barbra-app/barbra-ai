import { LanguageSwitcher } from "@/components/molecules/LanguageSwitcher";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  appName: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthLayout({ title, subtitle, appName, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">{appName}</p>
        <LanguageSwitcher />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            {children}
          </div>
          {footer ? <div className="mt-4 text-center text-sm">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
