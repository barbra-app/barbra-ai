"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, Info, MoreVertical, Pencil, Plus, X } from "lucide-react";
import { useConfirmDialog } from "./confirm-dialog";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EditEventDialog } from "@/components/dashboard/edit-event-dialog";
import { LabeledSelect } from "@/components/dashboard/labeled-select";
import type { Artist, Campaign, Concert, ConcertEvidencePhoto, ConcertMetricKey, ConcertPlatformBreakdown, ConcertPlatformTrendPoint, ConcertSegmentBreakdown, ConcertSummary, DateRange } from "@/lib/domain/analytics";
import { getFirebaseIdToken } from "@/lib/firebase/client";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

const SOURCE_LABELS: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  tiktok_ads: "TikTok Ads",
  dv360: "DV360",
};

function statusDot(status: string | undefined): "green" | "red" | "gray" | undefined {
  if (status === "active") return "green";
  if (status === "paused") return "red";
  if (status === "completed") return "gray";
  return undefined;
}

const PLATFORM_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
];

// Which sources feed each segment breakdown — not every ad platform reports
// every dimension (e.g. Pinterest has no device/geo/demographics breakdown
// at all), so the info icon next to each chart tells people which numbers
// they're actually looking at. Mirrors the source CTEs in each fact_*
// breakdown Dataform definition — keep in sync if those change.
const DEVICE_GEO_SOURCES = ["meta_ads", "google_ads", "tiktok_ads", "dv360"];
const DEMOGRAPHICS_SOURCES = ["meta_ads", "google_ads", "tiktok_ads"];
const PLATFORM_BREAKDOWN_SOURCES = ["meta_ads", "google_ads"];

function sourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source;
}

type SegmentMetricKey = "impressions" | "clicks" | "conversions" | "billedSpend";
const SEGMENT_METRIC_OPTIONS: { value: SegmentMetricKey; label: string; format: "number" | "currency" }[] = [
  { value: "impressions", label: "Impresiones", format: "number" },
  { value: "clicks", label: "Clics", format: "number" },
  { value: "conversions", label: "Conversiones", format: "number" },
  { value: "billedSpend", label: "Gasto", format: "currency" },
];

function SegmentMetricMenu({ value, onChange }: { value: SegmentMetricKey; onChange: (value: SegmentMetricKey) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="segment-metric-menu" ref={rootRef}>
      <button
        type="button"
        className="segment-metric-trigger"
        aria-label="Elegir métrica"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreVertical className="size-3.5" />
      </button>
      {open && (
        <div className="segment-metric-popover" role="listbox" aria-label="Métrica">
          {SEGMENT_METRIC_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "is-selected" : undefined}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
              {option.value === value && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const METRIC_OPTIONS: { value: ConcertMetricKey; label: string; format: "currency" | "number" | "percent" | "ratio" }[] = [
  { value: "conversions", label: "Conversiones", format: "number" },
  { value: "billedSpend", label: "Gasto", format: "currency" },
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
  campaigns,
  artistId,
  concertId,
  isAdmin,
  range,
  startDate,
  endDate,
  onArtistUpdated,
  onConcertUpdated,
  onSummaryUpdated,
}: {
  organizationId: string;
  projectId: string;
  projectName?: string;
  artists: Artist[];
  concerts: Concert[];
  campaigns: Campaign[];
  artistId: string;
  concertId: string;
  isAdmin: boolean;
  range: DateRange;
  startDate: string;
  endDate: string;
  onArtistUpdated: (artist: Artist) => void;
  onConcertUpdated: (concert: Concert) => void;
  onSummaryUpdated?: (summary: ConcertSummary) => void;
}) {
  const [summary, setSummary] = useState<ConcertSummary | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "source:campaignId" -> campaign status, to show a dot next to each
  // campaign row in the platform breakdown (same meaning as the event
  // selector's dot: green active, red paused, gray completed/archived).
  const campaignStatusByKey = useMemo(
    () => new Map(campaigns.map((campaign) => [`${campaign.channel}:${campaign.externalCampaignId}`, campaign.status])),
    [campaigns],
  );

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
  const editEventDialogRef = useRef<HTMLDialogElement>(null);

  function handleEvidencePhotoAdded(concertId: string, evidencePhotos: ConcertEvidencePhoto[]) {
    const concert = concerts.find((item) => item.id === concertId);
    if (concert) onConcertUpdated({ ...concert, evidencePhotos });
  }

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
        {isAdmin && activeArtist && (
          <div className="dashboard-hero-actions">
            <button
              type="button"
              className="edit-event-button"
              onClick={() => editEventDialogRef.current?.showModal()}
            >
              <Pencil className="size-4" />Editar
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
                const campaignDots = row.campaigns.map((campaign) => statusDot(campaignStatusByKey.get(`${row.source}:${campaign.campaignId}`)));
                const platformDot = campaignDots.includes("green") ? "green" : campaignDots.includes("red") ? "red" : undefined;
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
                        {platformDot && <span className={`select-dot select-dot-${platformDot}`} aria-hidden="true" />}
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
                          row.campaigns.map((campaign, index) => (
                            <div className="concert-breakdown-row concert-campaign-row" key={campaign.campaignId}>
                              <span className="concert-breakdown-platform">
                                {campaignDots[index] && <span className={`select-dot select-dot-${campaignDots[index]}`} aria-hidden="true" />}
                                {campaign.campaignName}
                              </span>
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

          {(summary.geoBreakdown.length > 0 || summary.ageBreakdown.length > 0 || summary.genderBreakdown.length > 0) && (
            <section className="analytics-grid is-thirds">
              {summary.geoBreakdown.length > 0 && (
                <ConcertSegmentTable title="Región" rows={summary.geoBreakdown} currency={summary.currency} sources={DEVICE_GEO_SOURCES} />
              )}
              {summary.ageBreakdown.length > 0 && (
                <ConcertSegmentTable title="Edad" rows={summary.ageBreakdown} currency={summary.currency} sources={DEMOGRAPHICS_SOURCES} />
              )}
              {summary.genderBreakdown.length > 0 && (
                <ConcertSegmentTable title="Sexo" rows={summary.genderBreakdown} currency={summary.currency} sources={DEMOGRAPHICS_SOURCES} chartType="donut" />
              )}
            </section>
          )}

          {(summary.deviceBreakdown.length > 0 || summary.publisherPlatformBreakdown.length > 0) && (
            <section className="analytics-grid is-thirds">
              {summary.deviceBreakdown.length > 0 && (
                <ConcertSegmentTable title="Dispositivo" rows={summary.deviceBreakdown} currency={summary.currency} sources={DEVICE_GEO_SOURCES} chartType="donut" />
              )}
              {summary.publisherPlatformBreakdown.length > 0 && (
                <ConcertPlatformFunnel rows={summary.publisherPlatformBreakdown} currency={summary.currency} />
              )}
            </section>
          )}

          <ConcertComparisonChart platformTrend={summary.platformTrend} currency={summary.currency} />

          <ConcertCreativesGallery byPlatform={summary.byPlatform} currency={summary.currency} />

          <ConcertEvidenceGallery
            concerts={concerts}
            activeConcert={activeConcert}
            artistId={artistId}
            organizationId={organizationId}
            projectId={projectId}
            isAdmin={isAdmin}
            onPhotoAdded={handleEvidencePhotoAdded}
          />
        </div>
      ) : artists.length > 0 ? (
        <div className="dashboard-skeleton">
          <div className="skeleton-kpis">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
        </div>
      ) : null}

      {isAdmin && (
        <EditEventDialog
          dialogRef={editEventDialogRef}
          organizationId={organizationId}
          projectId={projectId}
          artist={activeArtist}
          concert={activeConcert}
          onArtistUpdated={onArtistUpdated}
          onConcertUpdated={onConcertUpdated}
        />
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

// Matches .concert-creatives-grid's minmax(10rem, 1fr) column width.
const CREATIVE_ITEM_MIN_WIDTH_REM = 10;

// Computes how many columns the grid actually fits from the container's
// own width — independent of the items/images inside it, so it doesn't
// depend on lazy-loaded images having finished loading (reading rendered
// children's offsetTop does, which is why that approach didn't work).
function useGridColumnCount(itemMinWidthRem: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const width = el.clientWidth;
      if (!width) return;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const itemWidth = itemMinWidthRem * rootFontSize;
      setColumns(Math.max(1, Math.floor((width + gap) / (itemWidth + gap))));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [itemMinWidthRem]);

  return { containerRef, columns };
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
  const [expanded, setExpanded] = useState(false);
  const { containerRef, columns } = useGridColumnCount(CREATIVE_ITEM_MIN_WIDTH_REM);
  if (items.length === 0) return null;
  const collapsible = columns !== null && items.length > columns;
  const visibleItems = expanded || columns === null || !collapsible ? items : items.slice(0, columns);

  return (
    <article className="chart-card concert-creatives-card">
      <div className="card-heading">
        <h2>Artes de las campañas</h2>
        <div className="concert-creatives-heading-actions">
          <span className="concert-creatives-count">{items.length} activos</span>
          {collapsible && (
            <button
              type="button"
              className="concert-creatives-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Ver menos" : "Ver todo"}
              <ChevronDown className={cn("size-3.5", expanded && "is-open")} />
            </button>
          )}
        </div>
      </div>
      <div className="concert-creatives-grid" ref={containerRef}>
        {visibleItems.map((item) => (
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

const MAX_EVIDENCE_PHOTO_BYTES = 5 * 1024 * 1024;

function validateEvidencePhoto(file: File | undefined) {
  if (!file) return "Selecciona una foto";
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "La foto debe ser JPG, PNG o WEBP";
  if (file.size > MAX_EVIDENCE_PHOTO_BYTES) return "La foto no puede pesar más de 5MB";
  return null;
}

// Same card dimensions/collapse pattern as ConcertCreativesGallery, on
// purpose — the user asked evidence photos to look and behave the same way
// as the ad-creatives gallery. Without activeConcert (artist summary, no
// single event selected) this shows a combined read-only gallery across
// every concert of the artist; uploading only makes sense against one
// specific event, so the add-photo form only renders when activeConcert is set.
function ConcertEvidenceGallery({
  concerts,
  activeConcert,
  artistId,
  organizationId,
  projectId,
  isAdmin,
  onPhotoAdded,
}: {
  concerts: Concert[];
  activeConcert?: Concert;
  artistId: string;
  organizationId: string;
  projectId: string;
  isAdmin: boolean;
  onPhotoAdded: (concertId: string, evidencePhotos: ConcertEvidencePhoto[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | undefined>();
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { containerRef, columns } = useGridColumnCount(CREATIVE_ITEM_MIN_WIDTH_REM);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const { confirm, element: confirmDialog } = useConfirmDialog();

  const items = activeConcert
    ? (activeConcert.evidencePhotos ?? []).map((photo) => ({ ...photo, eventName: activeConcert.displayName, concertId: activeConcert.id }))
    : concerts
        .filter((concert) => concert.artistId === artistId)
        .flatMap((concert) => (concert.evidencePhotos ?? []).map((photo) => ({ ...photo, eventName: concert.displayName, concertId: concert.id })));

  if (items.length === 0 && !activeConcert) return null;
  const collapsible = columns !== null && items.length > columns;
  const visibleItems = expanded || columns === null || !collapsible ? items : items.slice(0, columns);

  async function submitPhoto(event: FormEvent) {
    event.preventDefault();
    if (!activeConcert) return;
    const error = validateEvidencePhoto(file);
    if (error) {
      setFormError(error);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const token = await getFirebaseIdToken();
      const body = new FormData();
      body.set("organizationId", organizationId);
      body.set("projectId", projectId);
      body.set("concertId", activeConcert.id);
      body.set("caption", caption.trim());
      body.set("photo", file as File);
      const response = await fetch("/api/concerts/evidence", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible subir la foto");
      onPhotoAdded(activeConcert.id, payload.data.evidencePhotos);
      setFile(undefined);
      setCaption("");
      setAdding(false);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function deletePhoto(concertId: string, url: string) {
    const confirmed = await confirm("¿Borrar esta foto de evidencia? Esta acción no se puede deshacer.");
    if (!confirmed) return;
    setDeletingUrl(url);
    try {
      const token = await getFirebaseIdToken();
      const response = await fetch("/api/concerts/evidence", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ organizationId, projectId, concertId, url }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible borrar la foto");
      onPhotoAdded(concertId, payload.data.evidencePhotos);
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDeletingUrl(null);
    }
  }

  return (
    <article className="chart-card concert-creatives-card">
      {confirmDialog}
      <div className="card-heading">
        <h2>Evidencias de implementación</h2>
        <div className="concert-creatives-heading-actions">
          <span className="concert-creatives-count">{items.length} fotos</span>
          {collapsible && (
            <button
              type="button"
              className="concert-creatives-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Ver menos" : "Ver todo"}
              <ChevronDown className={cn("size-3.5", expanded && "is-open")} />
            </button>
          )}
          {isAdmin && activeConcert && (
            <button type="button" className="concert-creatives-toggle" onClick={() => setAdding((value) => !value)}>
              <Plus className="size-3.5" />Agregar foto
            </button>
          )}
        </div>
      </div>

      {adding && activeConcert && (
        <form className="evidence-upload-row" onSubmit={submitPhoto}>
          {previewUrl && <img className="evidence-upload-preview" src={previewUrl} alt="" />}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
          <input
            type="text"
            placeholder="Descripción (ej. Pantalla LED entrada norte)"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={200}
            required
          />
          <button type="submit" className="concert-creatives-toggle" disabled={submitting}>
            {submitting ? "Subiendo…" : "Agregar"}
          </button>
          {formError && <small className="auth-error" aria-live="polite">{formError}</small>}
        </form>
      )}

      {items.length === 0 ? (
        <p className="concert-campaign-empty">Aún no hay evidencias para este evento.</p>
      ) : (
        <div className="concert-creatives-grid" ref={containerRef}>
          {visibleItems.map((item, index) => (
            <div className="concert-creative evidence-photo" key={`${item.url}-${index}`}>
              {isAdmin && (
                <button
                  type="button"
                  className="evidence-photo-delete"
                  title="Borrar evidencia"
                  aria-label="Borrar evidencia"
                  disabled={deletingUrl === item.url}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void deletePhoto(item.concertId, item.url);
                  }}
                >
                  <X className="size-3.5" />
                </button>
              )}
              <a href={item.url} target="_blank" rel="noreferrer" title="Ver evidencia">
                <img src={item.url} alt={item.caption} loading="lazy" />
                <figcaption>
                  <span>{item.caption}</span>
                  {!activeConcert && <small>{item.eventName}</small>}
                </figcaption>
              </a>
            </div>
          ))}
        </div>
      )}
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

function ConcertSegmentTooltip({ active, payload, currency }: { active?: boolean; payload?: { payload: ConcertSegmentBreakdown }[]; currency: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <span>{row.label}</span>
      <div><strong>Gasto</strong><b>{formatCurrency(row.billedSpend, currency)}</b></div>
      <div><strong>Impresiones</strong><b>{formatNumber(row.impressions)}</b></div>
      <div><strong>Clics</strong><b>{formatNumber(row.clicks)}</b></div>
      <div><strong>Conversiones</strong><b>{formatNumber(row.conversions)}</b></div>
    </div>
  );
}

const SEGMENT_CHART_MAX_ROWS = 8;

function ConcertSegmentTable({ title, rows, currency, sources, chartType = "bar" }: { title: string; rows: ConcertSegmentBreakdown[]; currency: string; sources: string[]; chartType?: "bar" | "donut" }) {
  const [showTable, setShowTable] = useState(false);
  const [metric, setMetric] = useState<SegmentMetricKey>("impressions");
  const metricOption = SEGMENT_METRIC_OPTIONS.find((option) => option.value === metric) ?? SEGMENT_METRIC_OPTIONS[0];
  const hasSource = rows.some((row) => row.source);
  const chartRows = [...rows]
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, SEGMENT_CHART_MAX_ROWS)
    .map((row) => ({ ...row, label: hasSource ? `${row.label} (${sourceLabel(row.source ?? "")})` : row.label }));
  const chartHeight = Math.max(chartRows.length * 36, 72);
  const donutTotal = chartRows.reduce((sum, row) => sum + row[metric], 0);
  return (
    <article className="chart-card concert-breakdown-card">
      <div className="card-heading">
        <h2>Desglose por {title.toLowerCase()}</h2>
        <div className="concert-creatives-heading-actions">
          <button type="button" className="segment-sources-info" aria-label={`Fuentes de este desglose: ${sources.map(sourceLabel).join(", ")}`}>
            <Info className="size-3.5" aria-hidden="true" />
            <span className="segment-sources-popover" aria-hidden="true">
              Incluye datos de: {sources.map(sourceLabel).join(", ")}.
            </span>
          </button>
          <SegmentMetricMenu value={metric} onChange={setMetric} />
          <button
            type="button"
            className="concert-creatives-toggle"
            aria-expanded={showTable}
            onClick={() => setShowTable((value) => !value)}
          >
            {showTable ? "Ocultar tabla" : "Ver tabla"}
            <ChevronDown className={cn("size-3.5", showTable && "is-open")} />
          </button>
        </div>
      </div>
      {chartType === "donut" ? (
        <div className="mix-visual">
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartRows} dataKey={metric} nameKey="label" innerRadius="70%" outerRadius="94%" paddingAngle={2} stroke="none">
                  {chartRows.map((row, index) => <Cell key={row.label} fill={PLATFORM_COLORS[index % PLATFORM_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ConcertSegmentTooltip currency={currency} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <strong>{formatMetricValue(metricOption.format, donutTotal, currency)}</strong>
              <span>{metricOption.label} total</span>
            </div>
          </div>
          <div className="mix-list">
            {chartRows.map((row, index) => (
              <div key={row.label}>
                <i style={{ background: PLATFORM_COLORS[index % PLATFORM_COLORS.length] }} />
                <span>{row.label}</span>
                <strong>{donutTotal ? formatPercent(row[metric] / donutTotal, 0) : "—"}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="concert-segment-chart" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }} barCategoryGap="28%">
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                width={96}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--color-muted)", fontSize: 12 }}
              />
              <Tooltip content={<ConcertSegmentTooltip currency={currency} />} cursor={{ fill: "var(--color-surface-muted)" }} />
              <Bar dataKey={metric} fill="var(--color-accent)" radius={[0, 4, 4, 0]} maxBarSize={18}>
                <LabelList
                  dataKey={metric}
                  position="right"
                  formatter={(value: number) => formatMetricValue(metricOption.format, value, currency)}
                  style={{ fill: "var(--color-ink)", fontSize: 12 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {showTable && (
        <div className="concert-breakdown-table">
          <div className="concert-breakdown-row concert-breakdown-header">
            <span>{title}</span>
            {hasSource && <span>Red</span>}
            <span>Impresiones</span>
            <span>Clics</span>
            <span>Conversiones</span>
            <span>Gasto</span>
          </div>
          {rows.map((row) => (
            <div className="concert-breakdown-row" key={`${row.source ?? ""}:${row.label}`}>
              <span>{row.label}</span>
              {hasSource && <span>{sourceLabel(row.source ?? "")}</span>}
              <span>{formatNumber(row.impressions)}</span>
              <span>{formatNumber(row.clicks)}</span>
              <span>{formatNumber(row.conversions)}</span>
              <span>{formatCurrency(row.billedSpend, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

// This card is one of three sharing a narrow (1/3-width) row, so there's
// not much room for left-side labels — at most this many individual
// networks are shown, in descending order of impressions; the rest are
// folded into one "Otras" row instead of rendering a pile of near-zero
// segments whose labels collide.
const SANKEY_MAX_SOURCE_NODES = 4;
const SANKEY_RESULTS_COLOR = "var(--color-accent)";

// Hand-built instead of recharts' Sankey: that component sizes every node
// from flow conservation (a node's height = the sum of its own links), so
// getting column 1 to read as impressions and column 2 (same network) to
// read as clicks needed fake "remainder" nodes carrying off the unclicked
// impressions — and those remainder nodes, despite rendering as nothing,
// still have real (often large) values that recharts' auto-layout used to
// *order* nodes within a column, scrambling the row order between columns
// and making same-network ribbons cross each other instead of running in
// parallel lanes. Laying out each column's bars directly from each row's
// own share of that column's total sidesteps the whole problem: every
// column keeps the same row order, so ribbons never cross.
function buildPlatformFunnelRows(rows: ConcertSegmentBreakdown[]) {
  const sorted = rows.filter((row) => row.impressions > 0).sort((a, b) => b.impressions - a.impressions);
  const shown = sorted.slice(0, SANKEY_MAX_SOURCE_NODES);
  const rest = sorted.slice(SANKEY_MAX_SOURCE_NODES);
  const funnelRows = [
    ...shown,
    ...(rest.length > 0
      ? [{
          label: "Otras",
          impressions: rest.reduce((sum, row) => sum + row.impressions, 0),
          clicks: rest.reduce((sum, row) => sum + row.clicks, 0),
          conversions: rest.reduce((sum, row) => sum + row.conversions, 0),
        }]
      : []),
  ].filter((row) => row.clicks > 0);
  if (funnelRows.length === 0) return null;
  return funnelRows.map((row, index) => ({ ...row, color: PLATFORM_COLORS[index % PLATFORM_COLORS.length] }));
}

// A smooth S-curve ribbon between a segment's right edge in one column and
// its matching segment's left edge in the next — the same construction a
// Sankey link uses, just computed by hand against our own layout.
function ribbonPath(x1: number, y1Top: number, y1Bottom: number, x2: number, y2Top: number, y2Bottom: number) {
  const midX = (x1 + x2) / 2;
  return `M${x1},${y1Top} C${midX},${y1Top} ${midX},${y2Top} ${x2},${y2Top} L${x2},${y2Bottom} C${midX},${y2Bottom} ${midX},${y1Bottom} ${x1},${y1Bottom} Z`;
}

// Wider than tall on purpose — this card now spans two of the three grid
// columns (see the "Plataforma" + "Flujo por red" merge), so the viewBox
// needs to actually use that extra width instead of "meet" letterboxing it.
const FUNNEL_VIEWBOX_WIDTH = 760;
const FUNNEL_VIEWBOX_HEIGHT = 220;
const FUNNEL_BAR_WIDTH = 8;
const FUNNEL_COL1_X = 8;
const FUNNEL_COL2_X = 376;
const FUNNEL_COL3_X = 744;
const FUNNEL_SEGMENT_GAP = 5;

function ConcertPlatformFunnel({ rows, currency }: { rows: ConcertSegmentBreakdown[]; currency: string }) {
  const [showTable, setShowTable] = useState(false);
  const funnelRows = useMemo(() => buildPlatformFunnelRows(rows), [rows]);
  if (!funnelRows) return null;

  const totalImpressions = funnelRows.reduce((sum, row) => sum + row.impressions, 0);
  const totalClicks = funnelRows.reduce((sum, row) => sum + row.clicks, 0);
  const totalConversions = funnelRows.reduce((sum, row) => sum + row.conversions, 0);
  if (totalConversions <= 0) return null;

  // A small top margin so a bar that starts right at the top of the chart
  // (common for the thin "Resultados" bar, whose height is a small fraction
  // of the others) still leaves room for its label's text above it instead
  // of getting clipped by the chart's own edge.
  const topPad = 10;
  const gapTotal = FUNNEL_SEGMENT_GAP * (funnelRows.length - 1);
  const usableHeight = FUNNEL_VIEWBOX_HEIGHT - gapTotal - topPad * 2;

  // Every column is scaled against the SAME denominator — total impressions
  // — instead of each column scaling against its own total. Clicks are a
  // subset of impressions for every single network, so this guarantees
  // each row's column-2 segment is never taller than its own column-1
  // segment, the way a real funnel narrows; scaling clicks against *total
  // clicks* instead let a network with an unusually high CTR end up with a
  // bigger share of column 2 than of column 1, which read as "clicks
  // bigger than impressions" even though no single network actually had
  // more clicks than impressions.
  let col1Top = topPad;
  let col2Top = topPad;
  const segments = funnelRows.map((row) => {
    const h1 = Math.max((row.impressions / totalImpressions) * usableHeight, 1.5);
    const h2 = Math.max((row.clicks / totalImpressions) * usableHeight, 1.5);
    const segment = {
      row,
      col1Top, col1Bottom: col1Top + h1,
      col2Top, col2Bottom: col2Top + h2,
    };
    col1Top += h1 + FUNNEL_SEGMENT_GAP;
    col2Top += h2 + FUNNEL_SEGMENT_GAP;
    return segment;
  });
  // The combined Resultados bar is thin — scaled the same way as columns 1
  // and 2, against total impressions, so the funnel keeps narrowing all the
  // way through instead of ending in a bar that resets to full height.
  // Each network's ribbon still lands on its own slice of that thin bar,
  // sized by its share of total *conversions* this time, since that's the
  // only thing left to subdivide it by.
  const resultsHeight = Math.max((totalConversions / totalImpressions) * (FUNNEL_VIEWBOX_HEIGHT - topPad * 2), 2);
  const resultsTop = topPad;
  let col3Top = resultsTop;
  const resultSlices = segments.map((segment) => {
    const h3 = Math.max((segment.row.conversions / totalConversions) * resultsHeight, 0.5);
    const slice = { row: segment.row, col3Top, col3Bottom: col3Top + h3 };
    col3Top += h3;
    return slice;
  });

  return (
    <article className="chart-card concert-sankey-card span-2">
      <div className="card-heading">
        <h2>Flujo por red</h2>
        <div className="concert-creatives-heading-actions">
          <button
            type="button"
            className="segment-sources-info"
            aria-label={`Fuentes de este desglose: ${PLATFORM_BREAKDOWN_SOURCES.map(sourceLabel).join(", ")}`}
          >
            <Info className="size-3.5" aria-hidden="true" />
            <span className="segment-sources-popover" aria-hidden="true">
              Incluye datos de: {PLATFORM_BREAKDOWN_SOURCES.map(sourceLabel).join(", ")}.
            </span>
          </button>
          <button
            type="button"
            className="concert-creatives-toggle"
            aria-expanded={showTable}
            onClick={() => setShowTable((value) => !value)}
          >
            {showTable ? "Ocultar tabla" : "Ver tabla"}
            <ChevronDown className={cn("size-3.5", showTable && "is-open")} />
          </button>
        </div>
      </div>
      <div className="concert-sankey-chart">
        <svg width="100%" height="100%" viewBox={`0 0 ${FUNNEL_VIEWBOX_WIDTH} ${FUNNEL_VIEWBOX_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
          {segments.map((segment, index) => (
            <path
              key={`ribbon1-${index}-${segment.row.label}`}
              d={ribbonPath(
                FUNNEL_COL1_X + FUNNEL_BAR_WIDTH, segment.col1Top, segment.col1Bottom,
                FUNNEL_COL2_X, segment.col2Top, segment.col2Bottom,
              )}
              fill={segment.row.color}
              fillOpacity={0.18}
            />
          ))}
          {segments.map((segment, index) => (
            <path
              key={`ribbon2-${index}-${segment.row.label}`}
              d={ribbonPath(
                FUNNEL_COL2_X + FUNNEL_BAR_WIDTH, segment.col2Top, segment.col2Bottom,
                FUNNEL_COL3_X, resultSlices[index].col3Top, resultSlices[index].col3Bottom,
              )}
              fill={segment.row.color}
              fillOpacity={0.18}
            />
          ))}
          {segments.map((segment, index) => (
            <Fragment key={`bars-${index}-${segment.row.label}`}>
              <rect x={FUNNEL_COL1_X} y={segment.col1Top} width={FUNNEL_BAR_WIDTH} height={Math.max(segment.col1Bottom - segment.col1Top, 1.5)} fill={segment.row.color} />
              <rect x={FUNNEL_COL2_X} y={segment.col2Top} width={FUNNEL_BAR_WIDTH} height={Math.max(segment.col2Bottom - segment.col2Top, 1.5)} fill={segment.row.color} />
              <text x={FUNNEL_COL1_X + FUNNEL_BAR_WIDTH + 6} y={(segment.col1Top + segment.col1Bottom) / 2} dominantBaseline="middle" fontSize={10} fill="var(--color-ink)">
                {segment.row.label.length > 28 ? `${segment.row.label.slice(0, 27)}…` : segment.row.label}
                <tspan fill="var(--color-muted)" dx="4">{formatNumber(segment.row.impressions)}</tspan>
              </text>
            </Fragment>
          ))}
          <rect x={FUNNEL_COL3_X} y={resultsTop} width={FUNNEL_BAR_WIDTH} height={resultsHeight} fill={SANKEY_RESULTS_COLOR} />
          <text x={FUNNEL_COL3_X - 6} y={resultsTop + resultsHeight / 2} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--color-ink)">
            Resultados
            <tspan fill="var(--color-muted)" dx="4">{formatNumber(totalConversions)}</tspan>
          </text>
        </svg>
      </div>
      {showTable && (
        <div className="concert-breakdown-table">
          <div className="concert-breakdown-row concert-breakdown-header">
            <span>Plataforma</span>
            <span>Red</span>
            <span>Impresiones</span>
            <span>Clics</span>
            <span>Conversiones</span>
            <span>Gasto</span>
          </div>
          {rows.map((row, index) => (
            <div className="concert-breakdown-row" key={`${row.source ?? ""}:${row.label}:${index}`}>
              <span>{row.label}</span>
              <span>{sourceLabel(row.source ?? "")}</span>
              <span>{formatNumber(row.impressions)}</span>
              <span>{formatNumber(row.clicks)}</span>
              <span>{formatNumber(row.conversions)}</span>
              <span>{formatCurrency(row.billedSpend, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </article>
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
