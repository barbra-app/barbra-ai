"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronRight, CircleAlert, Lightbulb, RefreshCw, Sparkles, X } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Markdown } from "@/components/chat/markdown";
import type { AdvisorInsight, AdvisorScope, DashboardSnapshot } from "@/lib/domain/analytics";
import { normalizeOutput } from "@/lib/mcp/normalize";
import { calculateDelta } from "@/lib/data/analytics-repository";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import { getFirebaseIdToken } from "@/lib/firebase/client";

const ADVISOR_CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const QUESTIONS = [
  "¿Qué explica el cambio en ROAS?",
  "¿Qué campaña debería escalar?",
  "Compara la eficiencia por canal",
];

export function AdvisorPanel({
  scope,
  periodLabel,
  updatedAt,
  insights = [],
  onClose,
}: {
  scope: AdvisorScope;
  periodLabel: string;
  updatedAt: string;
  insights?: AdvisorInsight[];
  onClose: () => void;
}) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, setMessages, status } = useChat({ transport });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = status === "streaming" || status === "submitted";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  async function submit(question: string) {
    if (!question.trim() || busy) return;
    const token = await getFirebaseIdToken();
    sendMessage(
      { text: question.trim() },
      {
        body: scope,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );
    setInput("");
  }

  return (
    <aside className="advisor-panel" id="advisor-panel" aria-label="Barbra Intelligence">
      <header className="advisor-header">
        <div className="advisor-title">
          <span className="advisor-icon"><Sparkles className="size-4" /></span>
          <div><strong>Barbra Intelligence</strong><span>Contexto seleccionado</span></div>
        </div>
        <div className="advisor-header-actions">
          <button onClick={() => setMessages([])} disabled={!messages.length || busy} aria-label="Reiniciar conversación"><RefreshCw className="size-4" /></button>
          <button onClick={onClose} aria-label="Cerrar Barbra Intelligence"><X className="size-4" /></button>
        </div>
      </header>

      <div className="advisor-context">
        <span className="status-dot" />
        <span>{periodLabel}</span>
        <span>·</span>
        <span>Actualizado {new Date(updatedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      <div className="advisor-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <AdvisorHome insights={insights} onAsk={submit} />
        ) : (
          <div className="advisor-thread">
            {messages.map((message) => <AdvisorMessage key={message.id} message={message} />)}
            {busy && <div className="advisor-thinking"><span /> Analizando datos verificados…</div>}
          </div>
        )}
      </div>

      <form className="advisor-composer" onSubmit={(event) => { event.preventDefault(); submit(input); }}>
        <label htmlFor="advisor-question">Consulta a Barbra</label>
        <textarea
          id="advisor-question"
          rows={2}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(input);
            }
          }}
          placeholder="Pregunta por rendimiento, riesgos o decisiones…"
        />
        <button type="submit" disabled={!input.trim() || busy} aria-label="Enviar pregunta"><ArrowUp className="size-4" /></button>
      </form>
    </aside>
  );
}

function AdvisorHome({ insights, onAsk }: { insights: AdvisorInsight[]; onAsk: (question: string) => void }) {
  const primary = insights[0];
  return (
    <div className="advisor-home">
      <div className="advisor-greeting">
        <strong>Barbra Intelligence está lista.</strong>
        <p>{insights.length ? `${insights.length} señales detectadas en este periodo.` : "Pregúntame sobre el rendimiento seleccionado."}</p>
      </div>

      {primary && (
        <div className={`insight-hero ${primary.tone}`}>
          <div className="insight-label"><Lightbulb className="size-3.5" /> Señal principal</div>
          <strong>{primary.title}</strong>
          <p>{primary.summary}</p>
          <div><b>{primary.metric}</b><span>{primary.action}</span></div>
        </div>
      )}

      <div className="question-list">
        <span>Preguntas sugeridas</span>
        {QUESTIONS.map((question) => (
          <button key={question} onClick={() => onAsk(question)}><span>{question}</span><ChevronRight className="size-3.5" /></button>
        ))}
      </div>
    </div>
  );
}

function AdvisorMessage({ message }: { message: any }) {
  const user = message.role === "user";
  return (
    <div className={user ? "advisor-message user" : "advisor-message assistant"}>
      {!user && <span className="message-avatar"><Sparkles className="size-3.5" /></span>}
      <div className="message-content">
        {message.parts?.map((part: any, index: number) => <AdvisorPart key={index} part={part} />)}
      </div>
    </div>
  );
}

function AdvisorPart({ part }: { part: any }) {
  if (part.type === "text") return <Markdown>{part.text}</Markdown>;
  const name = typeof part.type === "string" && part.type.startsWith("tool-")
    ? part.type.slice(5)
    : part.type === "dynamic-tool" ? part.toolName : null;
  if (!name) return null;
  if (part.state === "output-error") return <div className="tool-error"><CircleAlert className="size-3.5" /> No pude completar este análisis.</div>;
  if (part.state !== "output-available") return <div className="tool-loading"><span /> {name.replaceAll("_", " ")}</div>;
  const data: any = normalizeOutput(part.output);
  if (data?.presentation === "compact") return <VerifiedDataNote period={data.periodLabel} />;
  if (name === "get_dashboard_snapshot") return <SnapshotAnswer snapshot={data} />;
  if (name === "get_campaign_performance") return <CampaignAnswer data={data} />;
  if (name === "get_channel_mix") return <ChannelAnswer data={data} />;
  if (name === "get_concert_summary") return <ConcertSummaryAnswer byPlatform={data?.byPlatform ?? []} currency={data?.currency ?? "COP"} />;
  if (name === "get_concert_campaigns") return <ConcertCampaignAnswer rows={(data?.rows ?? []).map((row: any) => ({ id: row.campaignId, name: row.campaignName, roas: row.roas, spend: row.spend }))} currency={data?.currency ?? "COP"} />;
  return null;
}

function VerifiedDataNote({ period }: { period?: string }) {
  return <div className="verified-data-note"><span className="status-dot" /> Datos verificados{period ? ` · ${period}` : ""}</div>;
}

function SnapshotAnswer({ snapshot }: { snapshot: DashboardSnapshot }) {
  const verifiedInsight = (snapshot as DashboardSnapshot & { verifiedInsight?: string }).verifiedInsight;
  const metrics = ["spend", "conversions", "cpa", "roas"].flatMap((id) => {
    const metric = snapshot.metrics?.find((item) => item.id === id);
    return metric ? [metric] : [];
  });
  return (
    <div className="visual-answer snapshot-answer">
      <div className="visual-answer-heading"><strong>Resumen del periodo</strong><span>{snapshot.periodLabel}</span></div>
      <div className="visual-kpis">
        {metrics.map((metric) => {
          const delta = calculateDelta(metric.value, metric.previousValue);
          const improved = metric.positiveWhen === "down" ? delta <= 0 : delta >= 0;
          const value = metric.format === "currency"
            ? formatCurrency(metric.value, snapshot.currency)
            : metric.format === "ratio" ? `${metric.value.toFixed(2)}×` : formatNumber(metric.value);
          return <div key={metric.id}><span>{metric.label}</span><strong>{value}</strong><small className={improved ? "is-positive" : "is-negative"}>{delta >= 0 ? "+" : ""}{formatPercent(delta)} vs. anterior</small></div>;
        })}
      </div>
      <div className="visual-chart" aria-label="Tendencia de inversión y revenue">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={snapshot.trend?.slice(-14) ?? []} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-rule)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted)" }} tickFormatter={(value) => String(value).slice(5)} axisLine={false} tickLine={false} />
            <YAxis yAxisId="spend" hide domain={["dataMin", "dataMax"]} />
            <YAxis yAxisId="revenue" hide domain={["dataMin", "dataMax"]} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--color-rule)", fontSize: 12 }} formatter={(value) => formatCurrency(Number(value), snapshot.currency)} />
            <Area yAxisId="revenue" name="Revenue" type="monotone" dataKey="revenue" stroke="var(--color-chart-2)" fill="var(--color-signal-soft)" strokeWidth={2} />
            <Area yAxisId="spend" name="Inversión" type="monotone" dataKey="spend" stroke="var(--color-chart-1)" fill="var(--color-accent-soft)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="visual-legend"><span><i className="chart-one" />Inversión</span><span><i className="chart-two" />Revenue</span></div>
      {verifiedInsight && <p className="verified-insight">{verifiedInsight}</p>}
    </div>
  );
}

function CampaignAnswer({ data }: { data: any }) {
  const rows = data?.rows ?? [];
  const currency = data?.currency ?? "COP";
  const sortBy = data?.sortBy ?? "spend";
  const metric = {
    spend: { label: "Inversión", value: (row: any) => Number(row.spend), format: (value: number) => formatCurrency(value, currency) },
    conversions: { label: "Conversiones", value: (row: any) => Number(row.conversions), format: (value: number) => formatNumber(value) },
    cpa: { label: "CPA", value: (row: any) => Number(row.cpa), format: (value: number) => formatCurrency(value, currency) },
    roas: { label: "ROAS", value: (row: any) => Number(row.roas), format: (value: number) => `${value.toFixed(2)}×` },
  }[sortBy as "spend" | "conversions" | "cpa" | "roas"];
  const chartRows = rows.slice(0, 5).map((row: any) => ({ ...row, metricValue: metric.value(row) }));
  return (
    <div className="visual-answer campaign-answer">
      <div className="visual-answer-heading"><strong>Campañas por {metric.label}</strong><span>{rows.length} resultados</span></div>
      <div className="campaign-chart" aria-label={`Ranking de campañas por ${metric.label}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartRows} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-rule)" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" width={92} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--color-muted)" }} tickFormatter={shortCampaignName} />
            <Tooltip formatter={(value) => metric.format(Number(value))} labelFormatter={(label) => String(label)} />
            <Bar dataKey="metricValue" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="campaign-ranking">
        {rows.slice(0, 4).map((row: any, index: number) => (
          <div key={row.id}><b>{index + 1}</b><span>{row.name}<small>{formatCurrency(Number(row.spend), currency)} · {formatNumber(Number(row.conversions))} conv.</small></span><strong>{metric.format(metric.value(row))}</strong></div>
        ))}
      </div>
      {data?.verifiedInsight && <p className="verified-insight">{data.verifiedInsight}</p>}
    </div>
  );
}

function ConcertCampaignAnswer({ rows, currency }: { rows: any[]; currency: string }) {
  return (
    <div className="visual-answer campaign-answer">
      {rows.slice(0, 4).map((row) => (
        <div key={row.id}><span>{row.name}</span><strong>{Number(row.roas).toFixed(2)}×</strong><small>{formatCurrency(Number(row.spend), currency)}</small></div>
      ))}
    </div>
  );
}

function ConcertSummaryAnswer({ byPlatform, currency }: { byPlatform: any[]; currency: string }) {
  const max = Math.max(...byPlatform.map((row) => Number(row.billedSpend)), 1);
  const labels: Record<string, string> = { google_ads: "Google Ads", meta_ads: "Meta Ads", tiktok_ads: "TikTok Ads" };
  return (
    <div className="visual-answer channel-answer">
      {byPlatform.map((row) => (
        <div key={row.source}>
          <div><span>{labels[row.source] ?? row.source}</span><strong>{formatNumber(Number(row.conversions))} conv.</strong></div>
          <i><b style={{ width: `${(Number(row.billedSpend) / max) * 100}%` }} /></i>
          <small>{formatCurrency(Number(row.billedSpend), currency)}</small>
        </div>
      ))}
    </div>
  );
}

function ChannelAnswer({ data }: { data: any }) {
  const rows = data?.rows ?? [];
  const currency = data?.currency ?? "COP";
  return (
    <div className="visual-answer channel-answer">
      <div className="visual-answer-heading"><strong>Distribución por canal</strong><span>{rows.length === 1 ? "1 canal con datos" : `${rows.length} canales`}</span></div>
      {rows.length > 1 && (
        <div className="channel-chart" aria-label="Participación de inversión y conversiones por canal">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 0, left: -22, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-rule)" vertical={false} />
              <XAxis dataKey="channel" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(value) => formatPercent(Number(value), 0)} tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => formatPercent(Number(value), 1)} />
              <Bar dataKey="spendShare" name="Inversión" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="conversionShare" name="Conversiones" fill="var(--color-chart-3)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="channel-list">
      {rows.map((row: any, index: number) => (
        <div key={row.channel}>
          <div><span><i style={{ "--channel-color": ADVISOR_CHART_COLORS[index % ADVISOR_CHART_COLORS.length] } as CSSProperties} />{row.channel}</span><strong>{formatCurrency(Number(row.cpa), currency)} CPA</strong></div>
          <dl><div><dt>Inversión</dt><dd>{formatCurrency(Number(row.spend), currency)}</dd></div><div><dt>Conversiones</dt><dd>{formatNumber(Number(row.conversions))}</dd></div><div><dt>Participación</dt><dd>{formatPercent(Number(row.spendShare), 0)}</dd></div></dl>
        </div>
      ))}
      </div>
      {data?.verifiedInsight && <p className="verified-insight">{data.verifiedInsight}</p>}
    </div>
  );
}

function shortCampaignName(value: unknown) {
  const text = String(value);
  return text.length > 14 ? `${text.slice(0, 13)}…` : text;
}
