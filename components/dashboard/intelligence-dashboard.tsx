"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Gauge,
  LayoutDashboard,
  Megaphone,
  MousePointerClick,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
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
  type CampaignPerformance,
  type DashboardSnapshot,
  type DateRangePreset,
  type MetricSummary,
  type AppUser,
  type Organization,
  type Project,
  type Campaign,
} from "@/lib/domain/analytics";
import { calculateDelta } from "@/lib/data/analytics-repository";
import { getFirebaseIdToken } from "@/lib/firebase/client";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

const METRIC_ICONS = {
  spend: CircleDollarSign,
  impressions: Activity,
  clicks: MousePointerClick,
  conversions: Target,
  cpa: Gauge,
  roas: TrendingUp,
};

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
    if (!availableProjects.some((project) => project.id === projectId)) {
      setProjectId(availableProjects[0]?.id ?? "");
    }
  }, [availableProjects, projectId]);

  useEffect(() => setCampaignId("all"), [projectId]);

  useEffect(() => {
    if (!organizationId || !projectId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ organizationId, projectId, range });
    if (campaignId !== "all") params.set("campaignId", campaignId);
    setLoading(true);
    setError(null);
    getFirebaseIdToken().then((token) => fetch(`/api/dashboard?${params}`, {
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

  return (
    <div className="intelligence-shell">
      <header className="intelligence-topbar">
        <div className="brand-lockup">
          <span className="brand-symbol"><Spark className="size-5" /></span>
          <div><strong>Barbra</strong><span>Intelligence</span></div>
        </div>

        <nav className="product-nav" aria-label="Navegación principal">
          <button className="active"><LayoutDashboard className="size-4" /> Dashboard</button>
          <button><Megaphone className="size-4" /> Campañas</button>
          <button><Activity className="size-4" /> Calidad</button>
          <button><Bot className="size-4" /> AI Advisor</button>
        </nav>

        <div className="topbar-actions">
          <button className="notification-button" aria-label="Notificaciones"><Bell className="size-4" /><span /></button>
          <div className="user-avatar">{workspace.user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>
        </div>
      </header>

      <div className="workspace-bar">
        <div className="workspace-selectors">
          <LabeledSelect label="Organización" value={organizationId} onChange={setOrganizationId} options={workspace.organizations.map((item) => ({ value: item.id, label: item.name }))} />
          <span className="selector-divider">/</span>
          <LabeledSelect label="Proyecto" value={projectId} onChange={setProjectId} options={availableProjects.map((item) => ({ value: item.id, label: item.name }))} />
          <span className="selector-divider">/</span>
          <LabeledSelect label="Campaña" value={campaignId} onChange={setCampaignId} options={[{ value: "all", label: "Todas las campañas" }, ...availableCampaigns.map((item) => ({ value: item.id, label: item.name }))]} />
        </div>
        <div className="range-control" aria-label="Rango de fechas">
          {(["7d", "30d", "90d"] as DateRangePreset[]).map((item) => <button key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item.replace("d", " días")}</button>)}
          <button className="calendar-button" aria-label="Elegir fechas"><CalendarDays className="size-4" /></button>
        </div>
      </div>

      <div className="intelligence-content">
        <main className="dashboard-main">
          <section className="dashboard-hero">
            <div>
              <span className="hero-eyebrow"><span /> Datos verificados</span>
              <h1>{campaign ? campaign.name : project?.name}</h1>
              <p>Panorama ejecutivo de medios · {snapshot?.periodLabel ?? "Cargando periodo"}</p>
            </div>
            <div className="hero-status"><CheckCircle2 className="size-4" /><div><strong>Pipeline saludable</strong><span>{snapshot ? `Actualizado ${new Date(snapshot.updatedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}` : "Consultando fuentes"}</span></div></div>
          </section>

          {error ? <DashboardError message={error} /> : !snapshot ? <DashboardSkeleton /> : (
            <>
              <section className={cn("kpi-grid", loading && "is-refreshing")}>
                {snapshot.metrics.map((metric) => <KpiCard key={metric.id} metric={metric} currency={snapshot.currency} />)}
              </section>

              <section className="analytics-grid">
                <PerformanceChart snapshot={snapshot} />
                <ChannelMix snapshot={snapshot} />
              </section>

              <section className="campaigns-card">
                <div className="card-heading">
                  <div><span className="card-icon"><Megaphone className="size-4" /></span><div><h2>Rendimiento por campaña</h2><p>Comparación sobre el periodo seleccionado</p></div></div>
                  <button>Ver todas <ChevronDown className="size-3.5 -rotate-90" /></button>
                </div>
                <CampaignTable campaigns={snapshot.campaigns} currency={snapshot.currency} selectedId={campaignId} onSelect={setCampaignId} />
              </section>
            </>
          )}
        </main>

        {snapshot && <AdvisorPanel snapshot={snapshot} />}
      </div>
    </div>
  );
}

function LabeledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="labeled-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="size-3.5" /></label>
  );
}

function KpiCard({ metric, currency }: { metric: MetricSummary; currency: string }) {
  const Icon = METRIC_ICONS[metric.id];
  const delta = calculateDelta(metric.value, metric.previousValue);
  const positive = metric.positiveWhen === "up" ? delta >= 0 : delta <= 0;
  const formatted = metric.format === "currency" ? formatCurrency(metric.value, currency) : metric.format === "ratio" ? `${metric.value.toFixed(2)}×` : metric.format === "percent" ? formatPercent(metric.value) : formatNumber(metric.value);
  return (
    <article className="kpi-card">
      <div className="kpi-top"><span>{metric.label}</span><i><Icon className="size-4" /></i></div>
      <strong>{formatted}</strong>
      <div className="kpi-footer"><span className={positive ? "positive" : "negative"}>{delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}{formatPercent(Math.abs(delta))}</span><span>vs. periodo anterior</span></div>
    </article>
  );
}

function PerformanceChart({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <article className="chart-card performance-card">
      <div className="card-heading">
        <div><span className="card-icon blue"><TrendingUp className="size-4" /></span><div><h2>Inversión y retorno</h2><p>Evolución del gasto frente a revenue atribuido</p></div></div>
        <div className="chart-legend"><span><i className="spend" /> Inversión</span><span><i className="revenue" /> Revenue</span></div>
      </div>
      <div className="main-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={snapshot.trend} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2142ff" stopOpacity={0.2} /><stop offset="100%" stopColor="#2142ff" stopOpacity={0} /></linearGradient>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f5c842" stopOpacity={0.22} /><stop offset="100%" stopColor="#f5c842" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid stroke="#ebe9e3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#8a8984" }} axisLine={false} tickLine={false} tickFormatter={(value) => String(value).slice(5)} minTickGap={26} />
            <YAxis tick={{ fontSize: 10, fill: "#8a8984" }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(Number(value) / 1000000)}M`} width={36} />
            <Tooltip content={<PerformanceTooltip currency={snapshot.currency} />} />
            <Area type="monotone" dataKey="revenue" stroke="#d2a400" strokeWidth={2} fill="url(#revenueGradient)" />
            <Area type="monotone" dataKey="spend" stroke="#2142ff" strokeWidth={2.5} fill="url(#spendGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function PerformanceTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><span>{label}</span>{payload.map((item: any) => <div key={item.dataKey}><i style={{ background: item.color }} /><strong>{item.dataKey === "spend" ? "Inversión" : "Revenue"}</strong><b>{formatCurrency(Number(item.value), currency)}</b></div>)}</div>;
}

function ChannelMix({ snapshot }: { snapshot: DashboardSnapshot }) {
  const total = snapshot.channelMix.reduce((sum, item) => sum + item.spend, 0);
  return (
    <article className="chart-card mix-card">
      <div className="card-heading"><div><span className="card-icon yellow"><Users className="size-4" /></span><div><h2>Mix de canales</h2><p>Distribución de inversión</p></div></div></div>
      <div className="mix-visual">
        <div className="donut-wrap">
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={snapshot.channelMix} dataKey="spend" nameKey="channel" innerRadius="66%" outerRadius="92%" paddingAngle={2} stroke="none">{snapshot.channelMix.map((item) => <Cell key={item.channel} fill={item.color} />)}</Pie><Tooltip formatter={(value) => formatCurrency(Number(value), snapshot.currency)} contentStyle={{ borderRadius: 10, border: "1px solid #e7e5df", fontSize: 11 }} /></PieChart></ResponsiveContainer>
          <div className="donut-center"><strong>{formatCurrency(total, snapshot.currency)}</strong><span>inversión</span></div>
        </div>
        <div className="mix-list">{snapshot.channelMix.map((item) => <div key={item.channel}><i style={{ background: item.color }} /><span>{item.channel}</span><strong>{formatPercent(item.spend / total, 0)}</strong><small>{formatNumber(item.conversions)} conv.</small></div>)}</div>
      </div>
    </article>
  );
}

function CampaignTable({ campaigns, currency, selectedId, onSelect }: { campaigns: CampaignPerformance[]; currency: string; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="campaign-table-wrap"><table className="campaign-table"><thead><tr><th>Campaña</th><th>Canal</th><th>Inversión</th><th>Conversiones</th><th>CPA</th><th>ROAS</th><th>Estado</th></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.id} className={selectedId === campaign.id ? "selected" : ""} onClick={() => onSelect(selectedId === campaign.id ? "all" : campaign.id)}><td><strong>{campaign.name}</strong><span>{campaign.id}</span></td><td><span className={`channel-badge ${campaign.channel.toLowerCase()}`}>{campaign.channel}</span></td><td>{formatCurrency(campaign.spend, currency)}</td><td>{formatNumber(campaign.conversions)}</td><td>{formatCurrency(campaign.cpa, currency)}</td><td><strong className="roas-value">{campaign.roas.toFixed(2)}×</strong></td><td><span className="status-badge"><i /> Activa</span></td></tr>)}</tbody></table></div>
  );
}

function DashboardSkeleton() {
  return <div className="dashboard-skeleton"><div className="skeleton-kpis">{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div><div className="skeleton-chart" /></div>;
}

function DashboardError({ message }: { message: string }) {
  return <div className="dashboard-error"><CircleAlertIcon /><div><strong>No pudimos cargar la inteligencia</strong><p>{message}</p></div><button onClick={() => location.reload()}><RefreshCw className="size-4" /> Reintentar</button></div>;
}

function CircleAlertIcon() {
  return <span className="error-icon">!</span>;
}
