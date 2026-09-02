"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LabeledSelect } from "@/components/dashboard/labeled-select";
import type { Artist, Concert, ConcertMetricKey, ConcertPlatformBreakdown, ConcertPlatformTrendPoint, ConcertSummary, DateRange } from "@/lib/domain/analytics";
import { getFirebaseIdToken } from "@/lib/firebase/client";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

const SOURCE_LABELS: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  tiktok_ads: "TikTok Ads",
};

const PLATFORM_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
];

function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source;
}

const METRIC_OPTIONS: { value: ConcertMetricKey; label: string; format: "currency" | "number" | "percent" | "ratio" }[] = [
  { value: "conversions", label: "Conversiones", format: "number" },
  { value: "billedSpend", label: "Gasto", format: "currency" },
  { value: "spend", label: "Inversión real", format: "currency" },
  { value: "impressions", label: "Impresiones", format: "number" },
  { value: "clicks", label: "Clics", format: "number" },
  { value: "revenue", label: "Revenue", format: "currency" },
  { value: "ctr", label: "CTR", format: "percent" },
  { value: "cpc", label: "CPC", format: "currency" },
  { value: "cpa", label: "CPA", format: "currency" },
  { value: "roas", label: "ROAS", format: "ratio" },
];

function formatMetricValue(format: "currency" | "number" | "percent" | "ratio", value: number, currency: string) {
  if (format === "currency") return formatCurrency(value, currency);
  if (format === "percent") return formatPercent(value);
  if (format === "ratio") return `${value.toFixed(2)}×`;
  return formatNumber(value);
}

export function ConcertsView({
  organizationId,
  projectId,
  projectName,
  artists,
  concerts,
  artistId,
  concertId,
  isAdmin,
  range,
  startDate,
  endDate,
  onArtistCreated,
  onConcertCreated,
  onSummaryUpdated,
}: {
  organizationId: string;
  projectId: string;
  projectName?: string;
  artists: Artist[];
  concerts: Concert[];
  artistId: string;
  concertId: string;
  isAdmin: boolean;
  range: DateRange;
  startDate: string;
  endDate: string;
  onArtistCreated: (artist: Artist) => void;
  onConcertCreated: (concert: Concert) => void;
  onSummaryUpdated?: (summary: ConcertSummary) => void;
}) {
  const [summary, setSummary] = useState<ConcertSummary | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setExpandedSource(null);
    if (!organizationId || !projectId || !artistId) {
      setSummary(null);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ organizationId, projectId, artistId, range });
    if (concertId !== "all") params.set("concertId", concertId);
    if (range === "custom") {
      params.set("startDate", startDate);
      params.set("endDate", endDate);
    }
    setLoading(true);
    setError(null);
    getFirebaseIdToken()
      .then((token) => fetch(`/api/concerts?${params}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }))
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? "No fue posible cargar el concierto");
        return response.json();
      })
      .then((payload) => {
        setSummary(payload.data);
        onSummaryUpdated?.(payload.data);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [organizationId, projectId, artistId, concertId, range, startDate, endDate]);

  const activeArtistName = artists.find((artist) => artist.id === artistId)?.displayName;

  return (
    <main className="dashboard-main">
      <section className="dashboard-hero">
        <div>
          <h1>{activeArtistName ?? projectName ?? "Conciertos"}</h1>
          <p>
            {artists.length
              ? "Resumen multicanal por concierto"
              : "Aún no hay conciertos configurados para este proyecto"}
          </p>
        </div>
      </section>

      {error ? (
        <div className="dashboard-error">
          <div>
            <strong>No pudimos cargar el concierto</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : summary ? (
        <div className={loading ? "is-refreshing" : undefined}>
          <section className="kpi-grid kpi-grid-5" aria-label="Métricas del concierto">
            <ConcertKpi label="Impresiones" value={formatNumber(summary.total.impressions)} />
            <ConcertKpi label="Clics" value={formatNumber(summary.total.clicks)} />
            <ConcertKpi label="Conversiones" value={formatNumber(summary.total.conversions)} />
            <ConcertKpi label="CTR" value={formatPercent(summary.total.ctr)} />
            <ConcertKpi label="Gasto" value={formatCurrency(summary.total.billedSpend, summary.currency)} />
          </section>

          <section className="analytics-grid">
            <ConcertTrendChart trend={summary.trend} currency={summary.currency} />
            <ConcertPlatformMix byPlatform={summary.byPlatform} currency={summary.currency} />
          </section>

          <article className="chart-card concert-breakdown-card">
            <div className="card-heading">
              <h2>Desglose por plataforma</h2>
            </div>
            <div className="concert-breakdown-table">
              <div className="concert-breakdown-row concert-breakdown-header">
                <span>Plataforma</span>
                <span>Impresiones</span>
                <span>Clics</span>
                <span>Conversiones</span>
                <span>CTR</span>
                <span>Gasto</span>
              </div>
              {summary.byPlatform.map((row) => {
                const expanded = expandedSource === row.source;
                return (
                  <div key={row.source}>
                    <button
                      type="button"
                      className="concert-breakdown-row concert-breakdown-toggle"
                      aria-expanded={expanded}
                      onClick={() => setExpandedSource(expanded ? null : row.source)}
                    >
                      <span className="concert-breakdown-platform">
                        <ChevronDown className={cn("size-3.5", expanded && "is-open")} />
                        {sourceLabel(row.source)}
                      </span>
                      <span>{formatNumber(row.impressions)}</span>
                      <span>{formatNumber(row.clicks)}</span>
                      <span>{formatNumber(row.conversions)}</span>
                      <span>{formatPercent(row.ctr)}</span>
                      <span>{formatCurrency(row.billedSpend, summary.currency)}</span>
                    </button>
                    {expanded && (
                      <div className="concert-campaign-list">
                        {row.campaigns.length === 0 ? (
                          <p className="concert-campaign-empty">No hay campañas individuales para esta plataforma.</p>
                        ) : (
                          row.campaigns.map((campaign) => (
                            <div className="concert-breakdown-row concert-campaign-row" key={campaign.campaignId}>
                              <span>{campaign.campaignName}</span>
                              <span>{formatNumber(campaign.impressions)}</span>
                              <span>{formatNumber(campaign.clicks)}</span>
                              <span>{formatNumber(campaign.conversions)}</span>
                              <span>{formatPercent(campaign.ctr)}</span>
                              <span>{formatCurrency(campaign.billedSpend, summary.currency)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </article>

          <ConcertComparisonChart platformTrend={summary.platformTrend} currency={summary.currency} />
        </div>
      ) : artists.length > 0 ? (
        <div className="dashboard-skeleton">
          <div className="skeleton-kpis">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
        </div>
      ) : null}

      {isAdmin && (
        <CreateConcertForm
          organizationId={organizationId}
          projectId={projectId}
          artists={artists}
          selectedArtistId={artistId}
          onArtistCreated={onArtistCreated}
          onConcertCreated={onConcertCreated}
        />
      )}
    </main>
  );
}

function ConcertKpi({ label, value }: { label: string; value: string }) {
  return (
    <article className="kpi-card">
      <div className="kpi-top">
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </article>
  );
}

function ConcertTrendChart({ trend, currency }: { trend: { date: string; billedSpend: number; conversions: number }[]; currency: string }) {
  return (
    <article className="chart-card performance-card">
      <div className="card-heading">
        <h2>Gasto y conversiones</h2>
        <div className="chart-legend">
          <span><i className="spend" />Gasto</span>
          <span><i className="revenue" />Conversiones</span>
        </div>
      </div>
      <div className="main-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="concertSpendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="concertConversionsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-signal-strong)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--color-signal-strong)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-rule)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={(value) => String(value).slice(5)} minTickGap={28} />
            <YAxis
              yAxisId="spend"
              tick={{ fontSize: 11, fill: "var(--color-muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => formatNumber(Number(value))}
              width={72}
              label={{ value: "Gasto", angle: -90, position: "insideLeft", fill: "var(--color-muted)", fontSize: 11 }}
            />
            <YAxis
              yAxisId="conversions"
              orientation="right"
              tick={{ fontSize: 11, fill: "var(--color-muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => formatNumber(Number(value))}
              width={72}
              label={{ value: "Conversiones", angle: 90, position: "insideRight", fill: "var(--color-muted)", fontSize: 11 }}
            />
            <Tooltip content={<ConcertTrendTooltip currency={currency} />} />
            <Area yAxisId="spend" type="monotone" dataKey="billedSpend" name="Gasto" stroke="var(--color-accent)" strokeWidth={2} fill="url(#concertSpendGradient)" />
            <Area yAxisId="conversions" type="monotone" dataKey="conversions" name="Conversiones" stroke="var(--color-signal-strong)" strokeWidth={2} fill="url(#concertConversionsGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function ConcertTrendTooltip({ active, payload, label, currency }: { active?: boolean; payload?: { payload: { billedSpend: number; conversions: number } }[]; label?: string; currency: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <span>{label}</span>
      <div><strong>Gasto</strong><b>{formatCurrency(point.billedSpend, currency)}</b></div>
      <div><strong>Conversiones</strong><b>{formatNumber(point.conversions)}</b></div>
    </div>
  );
}

function ConcertPlatformMix({ byPlatform, currency }: { byPlatform: ConcertPlatformBreakdown[]; currency: string }) {
  const total = byPlatform.reduce((sum, row) => sum + row.billedSpend, 0);
  const data = byPlatform.map((row) => ({ source: sourceLabel(row.source), value: row.billedSpend }));
  return (
    <article className="chart-card mix-card">
      <div className="card-heading">
        <h2>Distribución por plataforma</h2>
      </div>
      <div className="mix-visual">
        <div className="donut-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="source" innerRadius="70%" outerRadius="94%" paddingAngle={2} stroke="none">
                {data.map((item, index) => <Cell key={item.source} fill={PLATFORM_COLORS[index % PLATFORM_COLORS.length]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-center">
            <strong>{formatCurrency(total, currency)}</strong>
            <span>Gasto total</span>
          </div>
        </div>
        <div className="mix-list">
          {data.map((item, index) => (
            <div key={item.source}>
              <i style={{ background: PLATFORM_COLORS[index % PLATFORM_COLORS.length] }} />
              <span>{item.source}</span>
              <strong>{total ? formatPercent(item.value / total, 0) : "—"}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function ConcertComparisonChart({ platformTrend, currency }: { platformTrend: ConcertPlatformTrendPoint[]; currency: string }) {
  const [metric, setMetric] = useState<ConcertMetricKey>("conversions");
  const metricConfig = METRIC_OPTIONS.find((option) => option.value === metric) ?? METRIC_OPTIONS[0];

  const sources = useMemo(() => [...new Set(platformTrend.map((point) => point.source))].sort(), [platformTrend]);

  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const point of platformTrend) {
      const row = byDate.get(point.date) ?? { date: point.date };
      row[point.source] = point[metric];
      byDate.set(point.date, row);
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [platformTrend, metric]);

  return (
    <article className="chart-card concert-comparison-card">
      <div className="card-heading">
        <h2>Comparativa por plataforma</h2>
        <LabeledSelect
          label="Métrica"
          value={metric}
          onChange={(value) => setMetric(value as ConcertMetricKey)}
          options={METRIC_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
      </div>
      <div className="comparison-legend">
        {sources.map((source, index) => (
          <span key={source}><i style={{ background: PLATFORM_COLORS[index % PLATFORM_COLORS.length] }} />{sourceLabel(source)}</span>
        ))}
      </div>
      <div className="main-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-rule)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={(value) => String(value).slice(5)} minTickGap={28} />
            <YAxis tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={(value) => formatNumber(Number(value))} width={56} />
            <Tooltip content={<ConcertComparisonTooltip format={metricConfig.format} currency={currency} />} />
            {sources.map((source, index) => (
              <Line
                key={source}
                type="monotone"
                dataKey={source}
                name={sourceLabel(source)}
                stroke={PLATFORM_COLORS[index % PLATFORM_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function ConcertComparisonTooltip({ active, payload, label, format, currency }: {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string }[];
  label?: string;
  format: "currency" | "number" | "percent" | "ratio";
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <span>{label}</span>
      {payload.map((item) => (
        <div key={item.dataKey}>
          <i style={{ background: item.color }} />
          <strong>{sourceLabel(item.dataKey)}</strong>
          <b>{formatMetricValue(format, Number(item.value), currency)}</b>
        </div>
      ))}
    </div>
  );
}

function CreateConcertForm({
  organizationId,
  projectId,
  artists,
  selectedArtistId,
  onArtistCreated,
  onConcertCreated,
}: {
  organizationId: string;
  projectId: string;
  artists: Artist[];
  selectedArtistId: string;
  onArtistCreated: (artist: Artist) => void;
  onConcertCreated: (concert: Concert) => void;
}) {
  const [artistName, setArtistName] = useState("");
  const [artistSubmitting, setArtistSubmitting] = useState(false);
  const [artistError, setArtistError] = useState<string | null>(null);

  const [concertArtistId, setConcertArtistId] = useState(selectedArtistId);
  useEffect(() => setConcertArtistId(selectedArtistId), [selectedArtistId]);
  const [concertName, setConcertName] = useState("");
  const [namePattern, setNamePattern] = useState("");
  const [concertSubmitting, setConcertSubmitting] = useState(false);
  const [concertError, setConcertError] = useState<string | null>(null);

  async function submitArtist(event: FormEvent) {
    event.preventDefault();
    setArtistSubmitting(true);
    setArtistError(null);
    try {
      const token = await getFirebaseIdToken();
      const response = await fetch("/api/artists", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ organizationId, projectId, displayName: artistName }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible crear el artista");
      onArtistCreated(payload.data);
      setArtistName("");
    } catch (reason) {
      setArtistError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setArtistSubmitting(false);
    }
  }

  async function submitConcert(event: FormEvent) {
    event.preventDefault();
    setConcertSubmitting(true);
    setConcertError(null);
    try {
      const token = await getFirebaseIdToken();
      const response = await fetch("/api/concerts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ organizationId, projectId, artistId: concertArtistId, displayName: concertName, namePattern }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible crear el concierto");
      onConcertCreated(payload.data);
      setConcertName("");
      setNamePattern("");
    } catch (reason) {
      setConcertError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setConcertSubmitting(false);
    }
  }

  return (
    <article className="chart-card concert-admin-card">
      <div className="card-heading">
        <h2>Agregar artista o concierto</h2>
      </div>
      <div className="concert-admin-forms">
        <form className="auth-field" onSubmit={submitArtist}>
          <span>Nuevo artista</span>
          <input value={artistName} onChange={(event) => setArtistName(event.target.value)} placeholder="Ej. Reykon" required />
          <button className="auth-submit" type="submit" disabled={artistSubmitting || !artistName.trim()}>
            {artistSubmitting ? "Creando…" : "Crear artista"}
          </button>
          {artistError && <small className="auth-error" aria-live="polite">{artistError}</small>}
        </form>

        <form className="auth-field" onSubmit={submitConcert}>
          <span>Nuevo concierto</span>
          <select value={concertArtistId} onChange={(event) => setConcertArtistId(event.target.value)} required>
            <option value="" disabled>Selecciona un artista</option>
            {artists.map((artist) => <option key={artist.id} value={artist.id}>{artist.displayName}</option>)}
          </select>
          <input value={concertName} onChange={(event) => setConcertName(event.target.value)} placeholder="Ej. Reykon — Bogotá 27 Jul" required />
          <input value={namePattern} onChange={(event) => setNamePattern(event.target.value)} placeholder="Ej. BFL_Reykon" required />
          <button
            className="auth-submit"
            type="submit"
            disabled={concertSubmitting || !concertArtistId || !concertName.trim() || !namePattern.trim()}
          >
            {concertSubmitting ? "Creando…" : "Crear concierto"}
          </button>
          {concertError && <small className="auth-error" aria-live="polite">{concertError}</small>}
        </form>
      </div>
    </article>
  );
}
