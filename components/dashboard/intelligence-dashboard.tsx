"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Gauge,
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
import { Spark } from "@/components/layout/brand-mark";
import {
  DEMO_CAMPAIGNS,
  DEMO_ORGANIZATIONS,
  DEMO_PROJECTS,
  DEMO_USER,
  type AppUser,
  type Campaign,
  type DashboardSnapshot,
  type DateRangePreset,
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

const CRITICAL_METRICS = new Set(["spend", "conversions", "cpa", "roas"]);
const CHANNEL_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
];

export function IntelligenceDashboard() {
  const [workspace, setWorkspace] = useState<{ user: AppUser; organizations: Organization[]; projects: Project[]; campaigns: Campaign[] }>({
    user: DEMO_USER,
    organizations: DEMO_ORGANIZATIONS,
    projects: DEMO_PROJECTS,
    campaigns: DEMO_CAMPAIGNS,
  });
  const [organizationId, setOrganizationId] = useState(DEMO_ORGANIZATIONS[0].id);
  const availableProjects = useMemo(
    () => workspace.projects.filter((project) => project.organizationId === organizationId && workspace.user.projectIds.includes(project.id)),
    [organizationId, workspace],
  );
  const [projectId, setProjectId] = useState(availableProjects[0].id);
  const availableCampaigns = useMemo(() => workspace.campaigns.filter((campaign) => campaign.projectId === projectId), [projectId, workspace.campaigns]);
  const [campaignId, setCampaignId] = useState<string>("all");
  const [range, setRange] = useState<DateRangePreset>("30d");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setWorkspace(data);
        setOrganizationId(data.organizations[0]?.id ?? "");
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!availableProjects.some((project) => project.id === projectId)) setProjectId(availableProjects[0]?.id ?? "");
  }, [availableProjects, projectId]);

  useEffect(() => setCampaignId("all"), [projectId]);

  useEffect(() => {
    if (!organizationId || !projectId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ organizationId, projectId, range });
    if (campaignId !== "all") params.set("campaignId", campaignId);
    setLoading(true);
    setError(null);
    getFirebaseIdToken()
      .then((token) => fetch(`/api/dashboard?${params}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }))
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? "No fue posible cargar el dashboard");
        return response.json();
      })
      .then((payload) => setSnapshot(payload.data))
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [organizationId, projectId, campaignId, range]);

  const project = availableProjects.find((item) => item.id === projectId);
  const campaign = availableCampaigns.find((item) => item.id === campaignId);
  const initials = workspace.user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className={cn("intelligence-shell", advisorOpen && "advisor-is-open")}>
      <header className="intelligence-topbar">
        <div className="brand-lockup">
          <span className="brand-symbol"><Spark className="size-5" /></span>
          <strong>Barbra</strong>
        </div>

        <nav className="product-nav" aria-label="Navegación principal">
          <button className="active"><LayoutDashboard className="size-4" />Dashboard</button>
          <button><Megaphone className="size-4" />Campañas</button>
          <button
            className={advisorOpen ? "active" : ""}
            onClick={() => setAdvisorOpen((open) => !open)}
            aria-expanded={advisorOpen}
            aria-controls="advisor-panel"
          >
            <Sparkles className="size-4" />Advisor
          </button>
        </nav>

        <div className="topbar-actions">
          <button
            className="advisor-shortcut"
            onClick={() => setAdvisorOpen((open) => !open)}
            aria-expanded={advisorOpen}
            aria-controls="advisor-panel"
          >
            <Bot className="size-4" /><span>Preguntar</span>
          </button>
          <div className="user-avatar" aria-label={workspace.user.name}>{initials}</div>
        </div>
      </header>

      <div className="workspace-bar">
        <div className="workspace-selectors">
          <LabeledSelect label="Organización" value={organizationId} onChange={setOrganizationId} options={workspace.organizations.map((item) => ({ value: item.id, label: item.name }))} />
          <LabeledSelect label="Proyecto" value={projectId} onChange={setProjectId} options={availableProjects.map((item) => ({ value: item.id, label: item.name }))} />
          <LabeledSelect label="Campaña" value={campaignId} onChange={setCampaignId} options={[{ value: "all", label: "Todas las campañas" }, ...availableCampaigns.map((item) => ({ value: item.id, label: item.name }))]} />
        </div>
        <div className="range-control" aria-label="Rango de fechas">
          {(["7d", "30d", "90d"] as DateRangePreset[]).map((item) => (
            <button key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item.replace("d", " días")}</button>
          ))}
          <button className="calendar-button" aria-label="Elegir fechas"><CalendarDays className="size-4" /></button>
        </div>
      </div>

      <div className="intelligence-content">
        <main className="dashboard-main">
          <section className="dashboard-hero">
            <div>
              <h1>{campaign ? campaign.name : project?.name}</h1>
              <p>{snapshot?.periodLabel ?? "Consultando periodo"}</p>
            </div>
            <div className="data-status" aria-live="polite">
              <span />
              {snapshot ? `Actualizado ${new Date(snapshot.updatedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}` : "Actualizando"}
            </div>
          </section>

          {error ? <DashboardError message={error} /> : !snapshot ? <DashboardSkeleton /> : (
            <div className={loading ? "is-refreshing" : undefined}>
              <section className="kpi-grid" aria-label="Métricas críticas">
                {snapshot.metrics.filter((metric) => CRITICAL_METRICS.has(metric.id)).map((metric) => (
                  <KpiCard key={metric.id} metric={metric} currency={snapshot.currency} />
                ))}
              </section>
              <section className="analytics-grid">
                <PerformanceChart snapshot={snapshot} />
                <ChannelMix snapshot={snapshot} />
              </section>
            </div>
          )}
        </main>

        {snapshot && advisorOpen && <AdvisorPanel snapshot={snapshot} onClose={() => setAdvisorOpen(false)} />}
      </div>
    </div>
  );
}

function LabeledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="labeled-select">
      <span>{label}</span>
      <span className="select-control">
        <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown className="size-3.5" />
      </span>
    </label>
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
    <article className="chart-card performance-card">
      <div className="card-heading">
        <h2>Inversión y retorno</h2>
        <div className="chart-legend"><span><i className="spend" />Inversión</span><span><i className="revenue" />Revenue</span></div>
      </div>
      <div className="main-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={snapshot.trend} margin={{ top: 20, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.16} /><stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} /></linearGradient>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-signal)" stopOpacity={0.16} /><stop offset="100%" stopColor="var(--color-signal)" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-rule)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={(value) => String(value).slice(5)} minTickGap={28} />
            <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(Number(value) / 1000000)}M`} width={38} />
            <Tooltip content={<PerformanceTooltip currency={snapshot.currency} />} />
            <Area type="monotone" dataKey="revenue" stroke="var(--color-signal-strong)" strokeWidth={2} fill="url(#revenueGradient)" />
            <Area type="monotone" dataKey="spend" stroke="var(--color-accent)" strokeWidth={2} fill="url(#spendGradient)" />
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
    <article className="chart-card mix-card">
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
            <div key={item.channel}><i style={{ background: CHANNEL_COLORS[index % CHANNEL_COLORS.length] }} /><span>{item.channel}</span><strong>{formatPercent(item.spend / total, 0)}</strong></div>
          ))}
        </div>
      </div>
    </article>
  );
}

function DashboardSkeleton() {
  return <div className="dashboard-skeleton"><div className="skeleton-kpis">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div><div className="skeleton-chart" /></div>;
}

function DashboardError({ message }: { message: string }) {
  return <div className="dashboard-error"><div><strong>No pudimos cargar los datos</strong><p>{message}</p></div><button onClick={() => location.reload()}><RefreshCw className="size-4" />Reintentar</button></div>;
}
