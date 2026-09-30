/* Hallmark · component: application skeleton · genre: modern-minimal · theme: Barbra monochrome
 * states: loading · reduced-motion
 * contrast: decorative-only
 */
export function IntelligenceDashboardSkeleton() {
  return (
    <div className="intelligence-shell dashboard-shell-skeleton" aria-busy="true" aria-label="Cargando Barbra Intelligence">
      <header className="intelligence-topbar">
        <div className="brand-lockup">
          <img src="/barbra-logo.png" width="126" height="20" alt="Barbra" />
        </div>
        <div className="shell-skeleton-nav" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="shell-skeleton-account" aria-hidden="true">
          <span className="shell-skeleton-action" />
          <span className="shell-skeleton-avatar" />
        </div>
      </header>

      <div className="workspace-bar shell-skeleton-workspace" aria-hidden="true">
        <div className="workspace-selectors">
          <span className="shell-skeleton-select" />
          <span className="shell-skeleton-select" />
          <span className="shell-skeleton-select shell-skeleton-select-wide" />
        </div>
        <span className="shell-skeleton-range" />
      </div>

      <div className="intelligence-content">
        <main className="dashboard-main">
          <section className="dashboard-hero shell-skeleton-hero" aria-hidden="true">
            <div>
              <span className="shell-skeleton-title" />
              <span className="shell-skeleton-line" />
            </div>
            <span className="shell-skeleton-status" />
          </section>
          <DashboardSkeleton />
        </main>
      </div>

      <span className="sr-only" role="status">Preparando tu workspace…</span>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" aria-hidden="true">
      <div className="skeleton-kpis">
        {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
      </div>
      <div className="skeleton-analytics">
        <span className="skeleton-chart" />
        <span className="skeleton-mix" />
      </div>
    </div>
  );
}
