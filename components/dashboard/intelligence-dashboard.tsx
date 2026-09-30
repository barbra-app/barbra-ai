"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  CircleDollarSign,
  Gauge,
  ImageOff,
  LayoutDashboard,
  Megaphone,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdvisorPanel } from "@/components/advisor/advisor-panel";
import { ConcertsView } from "@/components/dashboard/concerts-view";
import { DashboardSkeleton, IntelligenceDashboardSkeleton } from "@/components/dashboard/intelligence-dashboard-skeleton";
import { LabeledSelect } from "@/components/dashboard/labeled-select";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserProfileMenu } from "@/components/profile/user-profile-menu";
import {
  type AdPerformance,
  type AdvisorScope,
  type AppUser,
  type Artist,
  type Campaign,
  type Concert,
  type DashboardSnapshot,
  type DateRange,
  type DateRangePreset,
  type EventPerformance,
  type MetricSummary,
  type Organization,
  type Project,
} from "@/lib/domain/analytics";
import { calculateDelta } from "@/lib/data/analytics-repository";
import { getFirebaseIdToken } from "@/lib/firebase/client";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

const METRIC_ICONS = {
  spend: CircleDollarSign,
  impressions: Activity,
  clicks: Activity,
  conversions: Target,
  cpa: Gauge,
  roas: TrendingUp,
};

function todayInBogota() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysBefore(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

const CRITICAL_METRICS = new Set(["spend", "conversions", "cpa", "roas"]);
const CHANNEL_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
];

type DashboardIssue = {
  kind: "empty" | "error";
  message: string;
};

export function IntelligenceDashboard() {
  const [view, setView] = useState<"dashboard" | "concerts">("dashboard");
  const [workspace, setWorkspace] = useState<{ user: AppUser; organizations: Organization[]; projects: Project[]; campaigns: Campaign[]; artists: Artist[]; concerts: Concert[] } | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const availableProjects = useMemo(
    () => workspace?.projects.filter((project) => project.organizationId === organizationId) ?? [],
    [organizationId, workspace],
  );
  const [projectId, setProjectId] = useState("");
  const availableCampaigns = useMemo(() => workspace?.campaigns.filter((campaign) => campaign.projectId === projectId) ?? [], [projectId, workspace]);
  const [campaignId, setCampaignId] = useState<string>("all");
  const availableArtists = useMemo(() => workspace?.artists.filter((artist) => artist.projectId === projectId) ?? [], [projectId, workspace]);
  const [artistId, setArtistId] = useState<string>("");
  const artistConcerts = useMemo(() => workspace?.concerts.filter((concert) => concert.artistId === artistId) ?? [], [artistId, workspace]);
  const [concertId, setConcertId] = useState<string>("all");
  const [range, setRange] = useState<DateRange>("30d");
  const today = useMemo(todayInBogota, []);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(() => daysBefore(todayInBogota(), 89));
  const [customEndDate, setCustomEndDate] = useState(today);
  const [draftStartDate, setDraftStartDate] = useState(customStartDate);
  const [draftEndDate, setDraftEndDate] = useState(customEndDate);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [concertUpdatedAt, setConcertUpdatedAt] = useState<string | null>(null);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState<DashboardIssue | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getFirebaseIdToken()
      .then((token) => fetch("/api/workspace", {
        cache: "no-store",
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }))
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? "No fue posible cargar tus accesos");
        return response.json();
      })
      .then(({ data }) => {
        const nextOrganizationId = data.organizations[0]?.id ?? "";
        const nextProjectId = data.projects.find(
          (project: Project) => project.organizationId === nextOrganizationId,
        )?.id ?? "";
        setWorkspace(data);
        setOrganizationId(nextOrganizationId);
        setProjectId(nextProjectId);
        setCampaignId("all");
        setWorkspaceError(null);
        setIssue(null);
        setWorkspaceReady(true);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") {
          setWorkspaceError(reason instanceof Error ? reason.message : String(reason));
          setWorkspaceReady(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!availableProjects.some((project) => project.id === projectId)) setProjectId(availableProjects[0]?.id ?? "");
  }, [availableProjects, projectId]);

  useEffect(() => setCampaignId("all"), [projectId]);

  useEffect(() => {
    if (!availableArtists.some((artist) => artist.id === artistId)) setArtistId(availableArtists[0]?.id ?? "");
  }, [availableArtists, artistId]);

  useEffect(() => setConcertId("all"), [artistId]);

  useEffect(() => {
    if (!workspaceReady || !organizationId || !projectId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ organizationId, projectId, range });
    if (campaignId !== "all") params.set("campaignId", campaignId);
    if (range === "custom") {
      params.set("startDate", customStartDate);
      params.set("endDate", customEndDate);
    }
    setLoading(true);
    setIssue(null);
    getFirebaseIdToken()
      .then((token) => fetch(`/api/dashboard?${params}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }))
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          if (payload.code === "ANALYTICS_NO_DATA") {
            setSnapshot(null);
            setAdvisorOpen(false);
            setIssue({ kind: "empty", message: payload.error });
            return null;
          }
          throw new Error(payload.error ?? "No fue posible cargar el dashboard");
        }
        return payload;
      })
      .then((payload) => {
        if (payload) setSnapshot(payload.data);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") {
          setSnapshot(null);
          setAdvisorOpen(false);
          setIssue({ kind: "error", message: reason instanceof Error ? reason.message : String(reason) });
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [workspaceReady, organizationId, projectId, campaignId, range, customStartDate, customEndDate]);

  function applyCustomRange() {
    if (!draftStartDate || !draftEndDate || draftStartDate > draftEndDate) return;
    setCustomStartDate(draftStartDate);
    setCustomEndDate(draftEndDate);
    setRange("custom");
    setCalendarOpen(false);
  }

  const project = availableProjects.find((item) => item.id === projectId);
  const campaign = availableCampaigns.find((item) => item.id === campaignId);
  const organization = workspace?.organizations.find((item) => item.id === organizationId);

  if (!workspaceReady) return <IntelligenceDashboardSkeleton />;
  if (!workspace) return <WorkspaceLoadError message={workspaceError ?? "No fue posible cargar tus accesos"} />;

  const rangeLabel = range === "custom" ? `${customStartDate} – ${customEndDate}` : `Últimos ${range.replace("d", "")} días`;
  const advisorScope: AdvisorScope | null = view === "dashboard"
    ? (organizationId && projectId
      ? {
        organizationId,
        projectId,
        campaignId: campaignId !== "all" ? campaignId : null,
        range,
        startDate: range === "custom" ? customStartDate : undefined,
        endDate: range === "custom" ? customEndDate : undefined,
      }
      : null)
    : (organizationId && projectId && artistId ? { organizationId, projectId, artistId, concertId: concertId !== "all" ? concertId : null } : null);
  const advisorReady = view === "dashboard" ? Boolean(snapshot) : Boolean(advisorScope);
  const advisorPeriodLabel = view === "dashboard" ? (snapshot?.periodLabel ?? rangeLabel) : rangeLabel;
  const advisorUpdatedAt = view === "dashboard" ? (snapshot?.updatedAt ?? new Date().toISOString()) : (concertUpdatedAt ?? new Date().toISOString());
  const advisorInsights = view === "dashboard" ? snapshot?.insights : undefined;

  return (
    <div className={cn("intelligence-shell", advisorOpen && "advisor-is-open")}>
      <header className="intelligence-topbar">
        <div className="brand-lockup">
          <img src="/barbra-logo.png" width="126" height="20" alt="Barbra" />
        </div>

        <nav className="product-nav" aria-label="Navegación principal">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><LayoutDashboard className="size-4" />Dashboard</button>
          <button className={view === "concerts" ? "active" : ""} onClick={() => setView("concerts")}><Megaphone className="size-4" />Campañas</button>
          <button
            className={advisorOpen ? "active" : ""}
            onClick={() => setAdvisorOpen((open) => !open)}
            aria-expanded={advisorOpen}
            aria-controls="advisor-panel"
          >
            <Sparkles className="size-4" />Intelligence
          </button>
        </nav>

        <div className="topbar-actions">
          <button
            className="advisor-shortcut"
            onClick={() => setAdvisorOpen((open) => !open)}
            aria-expanded={advisorOpen}
            aria-controls="advisor-panel"
          >
            <Sparkles className="size-4" /><span>Consultar</span>
          </button>
          <ThemeToggle />
          <UserProfileMenu
            user={workspace.user}
            organizationName={organization?.name}
            organizationCount={workspace.organizations.length}
            projectCount={workspace.projects.length}
            campaignCount={workspace.campaigns.length}
          />
        </div>
      </header>

      <div className="workspace-bar">
        <div className="workspace-selectors">
          <LabeledSelect label="Organización" value={organizationId} onChange={setOrganizationId} options={workspace.organizations.map((item) => ({ value: item.id, label: item.name }))} disabled={workspace.user.role === "user"} />
          <LabeledSelect label="Proyecto" value={projectId} onChange={setProjectId} options={availableProjects.map((item) => ({ value: item.id, label: item.name }))} />
          {view === "dashboard" ? (
            <LabeledSelect label="Campaña" value={campaignId} onChange={setCampaignId} options={[{ value: "all", label: "Todas las campañas" }, ...availableCampaigns.map((item) => ({ value: item.id, label: item.name }))]} />
          ) : (
            <>
              <LabeledSelect label="Artista" value={artistId} onChange={setArtistId} options={availableArtists.map((item) => ({ value: item.id, label: item.displayName }))} />
              <LabeledSelect
                label="Fecha"
                value={concertId}
                onChange={setConcertId}
                options={[
                  { value: "all", label: `Resumen (${artistConcerts.length} fecha${artistConcerts.length === 1 ? "" : "s"})` },
                  ...artistConcerts.map((item) => ({ value: item.id, label: item.displayName })),
                ]}
              />
            </>
          )}
        </div>
        <div className="range-picker">
          <div className="range-control" aria-label="Rango de fechas">
            {(["7d", "30d", "90d"] as DateRangePreset[]).map((item) => (
              <button key={item} className={range === item ? "active" : ""} onClick={() => { setRange(item); setCalendarOpen(false); }}>{item.replace("d", " días")}</button>
            ))}
            <button
              className={cn("calendar-button", range === "custom" && "active")}
              aria-label="Elegir fechas"
              aria-expanded={calendarOpen}
              onClick={() => setCalendarOpen((open) => !open)}
            >
              <CalendarDays className="size-4" />
            </button>
          </div>
          {calendarOpen && (
            <div className="date-range-popover" role="dialog" aria-label="Elegir rango de fechas">
              <div className="date-range-heading"><strong>Rango personalizado</strong><span>Consulta el histórico disponible</span></div>
              <div className="date-range-fields">
                <label><span>Desde</span><input type="date" value={draftStartDate} max={draftEndDate || today} onInput={(event) => setDraftStartDate(event.currentTarget.value)} /></label>
                <label><span>Hasta</span><input type="date" value={draftEndDate} min={draftStartDate} max={today} onInput={(event) => setDraftEndDate(event.currentTarget.value)} /></label>
              </div>
              {draftStartDate > draftEndDate && <p className="date-range-error">La fecha inicial debe ser anterior a la final.</p>}
              <div className="date-range-actions">
                <button onClick={() => setCalendarOpen(false)}>Cancelar</button>
                <button className="primary" disabled={!draftStartDate || !draftEndDate || draftStartDate > draftEndDate} onClick={applyCustomRange}>Aplicar</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="intelligence-content">
        {view === "concerts" ? (
          <ConcertsView
            organizationId={organizationId}
            projectId={projectId}
            projectName={project?.name}
            artists={availableArtists}
            concerts={workspace.concerts.filter((concert) => concert.projectId === projectId)}
            artistId={artistId}
            concertId={concertId}
            isAdmin={workspace.user.role === "admin"}
            range={range}
            startDate={customStartDate}
            endDate={customEndDate}
            onArtistCreated={(artist) => {
              setWorkspace((current) => current ? { ...current, artists: [...current.artists, artist] } : current);
              setArtistId(artist.id);
            }}
            onConcertCreated={(concert) => setWorkspace((current) => current ? { ...current, concerts: [...current.concerts, concert] } : current)}
            onArtistUpdated={(artist) => setWorkspace((current) => current
              ? { ...current, artists: current.artists.map((item) => item.id === artist.id ? artist : item) }
              : current)}
            onConcertUpdated={(concert) => setWorkspace((current) => current
              ? { ...current, concerts: current.concerts.map((item) => item.id === concert.id ? concert : item) }
              : current)}
            onSummaryUpdated={(summary) => setConcertUpdatedAt(summary.updatedAt)}
          />
        ) : (
          <main className="dashboard-main">
            <section className="dashboard-hero">
              <div>
                <h1>{campaign ? campaign.name : project?.name}</h1>
                <p>
                  {snapshot?.periodLabel
                    ?? (issue?.kind === "empty"
                      ? range === "custom" ? `${customStartDate} – ${customEndDate}` : `Últimos ${range.replace("d", "")} días`
                      : "Consultando periodo")}
                </p>
              </div>
              <div className={cn("data-status", issue && "is-neutral")} aria-live="polite">
                <span />
                {issue?.kind === "empty"
                  ? "Sin actividad reciente"
                  : issue?.kind === "error"
                    ? "No disponible"
                    : snapshot
                      ? `Actualizado ${new Date(snapshot.updatedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`
                      : "Actualizando"}
              </div>
            </section>

            {issue?.kind === "empty" ? (
              <DashboardEmptyState
                campaignSelected={Boolean(campaign)}
                range={range}
                onShowAllCampaigns={() => setCampaignId("all")}
                onTryNinetyDays={() => setRange("90d")}
              />
            ) : issue?.kind === "error" ? <DashboardError message={issue.message} /> : !snapshot ? <DashboardSkeleton /> : (
              <div className={loading ? "is-refreshing" : undefined}>
                <section className="kpi-grid" aria-label="Métricas críticas">
                  {snapshot.metrics.filter((metric) => CRITICAL_METRICS.has(metric.id)).map((metric) => (
                    <KpiCard key={metric.id} metric={metric} currency={snapshot.currency} />
                  ))}
                </section>
                {!snapshot.topEvents.length && !snapshot.topAds.length ? (
                  <section className="analytics-grid">
                    <PerformanceChart snapshot={snapshot} />
                    <ChannelMix snapshot={snapshot} />
                  </section>
                ) : (
                  <>
                    <section className={cn("analytics-grid", snapshot.topEvents.length ? "is-half" : "is-single")}>
                      <TopEventsCard events={snapshot.topEvents} currency={snapshot.currency} />
                      <PerformanceChart snapshot={snapshot} />
                    </section>
                    <section className={cn("analytics-grid", snapshot.topAds.length ? "is-reversed" : "is-single")}>
                      <ChannelMix snapshot={snapshot} />
                      <TopAdsCard ads={snapshot.topAds} />
                    </section>
                  </>
                )}
              </div>
            )}
          </main>
        )}

        {advisorReady && advisorOpen && advisorScope && (
          <AdvisorPanel
            scope={advisorScope}
            periodLabel={advisorPeriodLabel}
            updatedAt={advisorUpdatedAt}
            insights={advisorInsights}
            onClose={() => setAdvisorOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function KpiCard({ metric, currency }: { metric: MetricSummary; currency: string }) {
  const Icon = METRIC_ICONS[metric.id];
  const delta = calculateDelta(metric.value, metric.previousValue);
  const positive = metric.positiveWhen === "up" ? delta >= 0 : delta <= 0;
  const formatted = metric.format === "currency"
    ? formatCurrency(metric.value, currency)
    : metric.format === "ratio"
      ? `${metric.value.toFixed(2)}×`
      : metric.format === "percent"
        ? formatPercent(metric.value)
        : formatNumber(metric.value);
  return (
    <article className="kpi-card">
      <div className="kpi-top"><span>{metric.label}</span><Icon className="size-4" /></div>
      <strong>{formatted}</strong>
      <div className="kpi-footer">
        <span className={positive ? "positive" : "negative"}>{delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}{formatPercent(Math.abs(delta))}</span>
        <span>vs. periodo anterior</span>
      </div>
    </article>
  );
}

function PerformanceChart({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <article className="chart-card performance-card is-paired">
      <div className="card-heading">
        <h2>Inversión y retorno</h2>
        <div className="chart-legend"><span><i className="spend" />Inversión</span><span><i className="revenue" />Revenue</span></div>
      </div>
      <div className="main-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={snapshot.trend} margin={{ top: 20, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.18} /><stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} /></linearGradient>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-signal)" stopOpacity={0.16} /><stop offset="100%" stopColor="var(--color-signal)" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-rule)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={(value) => String(value).slice(5)} minTickGap={28} />
            <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(Number(value) / 1000000)}M`} width={38} />
            <Tooltip content={<PerformanceTooltip currency={snapshot.currency} />} />
            <Area type="monotone" dataKey="revenue" stroke="var(--color-signal-strong)" strokeWidth={2} fill="url(#revenueGradient)" />
            <Area type="monotone" dataKey="spend" stroke="var(--color-chart-1)" strokeWidth={2} fill="url(#spendGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function PerformanceTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <span>{label}</span>
      {payload.map((item: any) => <div key={item.dataKey}><i style={{ background: item.color }} /><strong>{item.dataKey === "spend" ? "Inversión" : "Revenue"}</strong><b>{formatCurrency(Number(item.value), currency)}</b></div>)}
    </div>
  );
}

function ChannelMix({ snapshot }: { snapshot: DashboardSnapshot }) {
  const total = snapshot.channelMix.reduce((sum, item) => sum + item.spend, 0);
  return (
    <article className="chart-card mix-card is-paired">
      <div className="card-heading"><h2>Canales</h2></div>
      <div className="mix-visual">
        <div className="donut-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart><Pie data={snapshot.channelMix} dataKey="spend" nameKey="channel" innerRadius="70%" outerRadius="94%" paddingAngle={2} stroke="none">{snapshot.channelMix.map((item, index) => <Cell key={item.channel} fill={CHANNEL_COLORS[index % CHANNEL_COLORS.length]} />)}</Pie></PieChart>
          </ResponsiveContainer>
          <div className="donut-center"><strong>{formatCurrency(total, snapshot.currency)}</strong><span>Total</span></div>
        </div>
        <div className="mix-list">
          {snapshot.channelMix.map((item, index) => (
            <div key={item.channel}><i style={{ background: CHANNEL_COLORS[index % CHANNEL_COLORS.length] }} /><span>{item.channel}</span><strong>{formatPercent(total ? item.spend / total : 0, 0)}</strong></div>
          ))}
        </div>
      </div>
    </article>
  );
}

const EVENT_METRIC_OPTIONS: { value: keyof Pick<EventPerformance, "conversions" | "spend" | "impressions" | "clicks">; label: string }[] = [
  { value: "conversions", label: "Conversiones" },
  { value: "spend", label: "Gasto" },
  { value: "impressions", label: "Impresiones" },
  { value: "clicks", label: "Clics" },
];

const TOP_N = 5;

function TopEventsCard({ events, currency }: { events: EventPerformance[]; currency: string }) {
  const [metric, setMetric] = useState<typeof EVENT_METRIC_OPTIONS[number]["value"]>("conversions");
  if (!events.length) return null;
  const ranked = [...events].sort((a, b) => b[metric] - a[metric]).slice(0, TOP_N);

  return (
    <article className="chart-card top-events-card is-paired">
      <div className="card-heading">
        <h2>Top {TOP_N} eventos</h2>
        <LabeledSelect label="Métrica" value={metric} onChange={(value) => setMetric(value as typeof metric)} options={EVENT_METRIC_OPTIONS} />
      </div>
      <div className="top-events-list">
        {ranked.map((event, index) => (
          <div className="top-event-row" key={event.id}>
            <b>{index + 1}</b>
            {event.photoUrl || event.artistPhotoUrl
              ? <img className="top-event-photo" src={event.photoUrl ?? event.artistPhotoUrl} alt="" />
              : <div className="top-event-photo top-event-photo-placeholder"><ImageOff className="size-4" /></div>}
            <span className="top-event-info">
              <span>{event.displayName}</span>
              <small>{event.artistName}</small>
            </span>
            <strong>{metric === "spend" ? formatCurrency(event.spend, currency) : formatNumber(event[metric])}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

const AD_METRIC_OPTIONS: { value: keyof Pick<AdPerformance, "conversions" | "linkClicks" | "impressions">; label: string }[] = [
  { value: "conversions", label: "Conversiones" },
  { value: "linkClicks", label: "Clics en el enlace" },
  { value: "impressions", label: "Impresiones" },
];

function TopAdsCard({ ads }: { ads: AdPerformance[] }) {
  const [metric, setMetric] = useState<typeof AD_METRIC_OPTIONS[number]["value"]>("conversions");
  if (!ads.length) return null;
  const ranked = [...ads].sort((a, b) => b[metric] - a[metric]).slice(0, TOP_N);

  return (
    <article className="chart-card top-ads-card is-paired">
      <div className="card-heading">
        <h2>Top {TOP_N} anuncios</h2>
        <LabeledSelect label="Métrica" value={metric} onChange={(value) => setMetric(value as typeof metric)} options={AD_METRIC_OPTIONS} />
      </div>
      <div className="concert-creatives-grid">
        {ranked.map((ad, index) => (
          <a
            className="concert-creative top-ad-creative"
            key={ad.adId}
            href={ad.permalinkUrl}
            target="_blank"
            rel="noreferrer"
            title={ad.permalinkUrl ? "Ver arte" : undefined}
          >
            <span className="top-ad-rank">{index + 1}</span>
            <img src={ad.thumbnailUrl} alt={ad.adName} loading="lazy" />
            <div className="concert-creative-metrics">
              <span>{formatNumber(ad.impressions)} impr.</span>
              <span>{formatNumber(ad.linkClicks)} clics enlace</span>
              <span>{formatNumber(ad.conversions)} conv.</span>
            </div>
            <figcaption>
              <span>{ad.eventDisplayName ?? ad.campaignName}</span>
              <small>{ad.campaignName}</small>
            </figcaption>
          </a>
        ))}
      </div>
    </article>
  );
}

function DashboardEmptyState({
  campaignSelected,
  range,
  onShowAllCampaigns,
  onTryNinetyDays,
}: {
  campaignSelected: boolean;
  range: DateRange;
  onShowAllCampaigns: () => void;
  onTryNinetyDays: () => void;
}) {
  const period = range === "custom" ? "en el rango seleccionado" : `en los últimos ${range.replace("d", "")} días`;

  return (
    <section className="dashboard-empty" aria-live="polite">
      <Activity className="dashboard-empty-icon" aria-hidden="true" />
      <div className="dashboard-empty-copy">
        <strong>Sin actividad en este periodo</strong>
        <p>{campaignSelected ? "Esta campaña" : "Esta selección"} no registró métricas {period}.</p>
      </div>
      <div className="dashboard-empty-actions">
        {campaignSelected && <button className="primary" onClick={onShowAllCampaigns}>Ver todas las campañas</button>}
        {range !== "90d" && <button onClick={onTryNinetyDays}>Probar 90 días</button>}
      </div>
    </section>
  );
}

function DashboardError({ message }: { message: string }) {
  return <div className="dashboard-error"><div><strong>No pudimos cargar los datos</strong><p>{message}</p></div><button onClick={() => location.reload()}><RefreshCw className="size-4" />Reintentar</button></div>;
}

function WorkspaceLoadError({ message }: { message: string }) {
  return (
    <div className="intelligence-shell">
      <header className="intelligence-topbar">
        <div className="brand-lockup"><img src="/barbra-logo.png" width="126" height="20" alt="Barbra" /></div>
      </header>
      <main className="dashboard-main workspace-load-error">
        <DashboardError message={message} />
      </main>
    </div>
  );
}
