"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pencil, Plus } from "lucide-react";
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
import { AddEventDialog } from "@/components/dashboard/add-event-dialog";
import { EditEventDialog } from "@/components/dashboard/edit-event-dialog";
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
  onArtistUpdated,
  onConcertUpdated,
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
  onArtistUpdated: (artist: Artist) => void;
  onConcertUpdated: (concert: Concert) => void;
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

  const activeArtist = artists.find((artist) => artist.id === artistId);
  const activeConcert = concertId !== "all" ? concerts.find((concert) => concert.id === concertId) : undefined;
  const activeArtistName = activeArtist?.displayName;
  // The cover banner is the event's own photo only — the artist's photo
  // never fills it, it only ever appears as the small avatar badge.
  const coverPhotoUrl = activeConcert?.photoUrl;
  const addEventDialogRef = useRef<HTMLDialogElement>(null);
  const editEventDialogRef = useRef<HTMLDialogElement>(null);

  return (
    <main className="dashboard-main">
      {coverPhotoUrl && <CoverPhoto src={coverPhotoUrl} avatarSrc={activeArtist?.photoUrl} />}
      <section className="dashboard-hero">
        <div>
          <div className="artist-identity">
            {!coverPhotoUrl && activeArtist?.photoUrl && <img className="artist-avatar" src={activeArtist.photoUrl} alt="" />}
            <h1>{activeArtistName ?? projectName ?? "Conciertos"}</h1>
          </div>
          <p>
            {artists.length
              ? "Resumen multicanal por concierto"
              : "Aún no hay conciertos configurados para este proyecto"}
          </p>
        </div>
        {isAdmin && (
          <div className="dashboard-hero-actions">
            {activeArtist && (
              <button
                type="button"
                className="edit-event-button"
                onClick={() => editEventDialogRef.current?.showModal()}
              >
                <Pencil className="size-4" />Editar
              </button>
            )}
            <button
              type="button"
              className="add-event-button"
              onClick={() => addEventDialogRef.current?.showModal()}
            >
              <Plus className="size-4" />Agregar evento
            </button>
          </div>
        )}
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

          <ConcertCreativesGallery byPlatform={summary.byPlatform} currency={summary.currency} />
        </div>
      ) : artists.length > 0 ? (
        <div className="dashboard-skeleton">
          <div className="skeleton-kpis">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
        </div>
      ) : null}

      {isAdmin && (
        <>
          <AddEventDialog
            dialogRef={addEventDialogRef}
            organizationId={organizationId}
            projectId={projectId}
            artists={artists}
            selectedArtistId={artistId}
            onArtistCreated={onArtistCreated}
            onConcertCreated={(concert) => {
              onConcertCreated(concert);
              addEventDialogRef.current?.close();
            }}
          />
          <EditEventDialog
            dialogRef={editEventDialogRef}
            organizationId={organizationId}
            projectId={projectId}
            artist={activeArtist}
            concert={activeConcert}
            onArtistUpdated={onArtistUpdated}
            onConcertUpdated={onConcertUpdated}
          />
        </>
      )}
    </main>
  );
}

function CoverPhoto({ src, avatarSrc }: { src: string; avatarSrc?: string }) {
  // Always shown at the banner's full height with nothing cropped, repeated
  // sideways to fill the width — the whole photo stays visible regardless
  // of its own resolution or aspect ratio, never stretched or cropped.
  return (
    <div className="event-cover">
      <div className="event-cover-media" style={{ backgroundImage: `url("${src}")` }}>
        <div className="event-cover-scrim" />
      </div>
      {avatarSrc && <img className="artist-avatar is-overlap" src={avatarSrc} alt="" />}
    </div>
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

function ConcertCreativesGallery({ byPlatform, currency }: { byPlatform: ConcertPlatformBreakdown[]; currency: string }) {
  const items = byPlatform.flatMap((platform) =>
    platform.campaigns.flatMap((campaign) =>
      campaign.creatives.map((creative) => ({
        key: creative.adId,
        thumbnailUrl: creative.thumbnailUrl,
        adName: creative.adName,
        campaignName: campaign.campaignName,
        source: platform.source,
        href: creative.permalinkUrl,
        impressions: creative.impressions,
        linkClicks: creative.linkClicks,
        conversions: creative.conversions,
        costPerConversion: creative.costPerConversion,
      })),
    ),
  );
  if (items.length === 0) return null;

  return (
    <article className="chart-card concert-creatives-card">
      <div className="card-heading">
        <h2>Artes de las campañas</h2>
        <span className="concert-creatives-count">{items.length} activos</span>
      </div>
      <div className="concert-creatives-grid">
        {items.map((item) => (
          <a
            className="concert-creative"
            key={item.key}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            title={item.href ? "Ver arte" : undefined}
          >
            <img src={item.thumbnailUrl} alt={item.adName} loading="lazy" />
            {item.conversions !== undefined && (
              <div className="concert-creative-metrics">
                <span>{formatNumber(item.impressions ?? 0)} impr.</span>
                <span>{formatNumber(item.linkClicks ?? 0)} clics enlace</span>
                <span>{formatNumber(item.conversions)} conv.</span>
                <span>{formatCurrency(item.costPerConversion ?? 0, currency)}/conv.</span>
              </div>
            )}
            <figcaption>
              <span>{item.campaignName}</span>
              <small>{sourceLabel(item.source)}</small>
            </figcaption>
          </a>
        ))}
      </div>
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
