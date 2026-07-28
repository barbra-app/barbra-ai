"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Bot, ChevronRight, CircleAlert, Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Markdown } from "@/components/chat/markdown";
import type { DashboardSnapshot } from "@/lib/domain/analytics";
import { normalizeOutput } from "@/lib/mcp/normalize";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { getFirebaseIdToken } from "@/lib/firebase/client";

const QUESTIONS = [
  "¿Qué está explicando el cambio en ROAS?",
  "¿Qué campaña debería escalar esta semana?",
  "Compara la eficiencia entre canales",
];

export function AdvisorPanel({ snapshot }: { snapshot: DashboardSnapshot }) {
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
        body: {
          organizationId: snapshot.query.organizationId,
          projectId: snapshot.query.projectId,
          campaignId: snapshot.query.campaignId ?? null,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );
    setInput("");
  }

  return (
    <aside className="advisor-panel">
      <header className="advisor-header">
        <div className="advisor-title">
          <span className="advisor-icon"><Sparkles className="size-4" /></span>
          <div><strong>AI Advisor</strong><span>Analiza el contexto seleccionado</span></div>
        </div>
        <button onClick={() => setMessages([])} disabled={!messages.length || busy} aria-label="Reiniciar conversación">
          <RefreshCw className="size-4" />
        </button>
      </header>

      <div className="advisor-context">
        <span className="status-dot" />
        <span>{snapshot.periodLabel}</span>
        <span>·</span>
        <span>Actualizado {new Date(snapshot.updatedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      <div className="advisor-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <AdvisorHome snapshot={snapshot} onAsk={submit} />
        ) : (
          <div className="advisor-thread">
            {messages.map((message) => <AdvisorMessage key={message.id} message={message} />)}
            {busy && <div className="advisor-thinking"><span /> Analizando datos verificados…</div>}
          </div>
        )}
      </div>

      <form className="advisor-composer" onSubmit={(event) => { event.preventDefault(); submit(input); }}>
        <textarea
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

function AdvisorHome({ snapshot, onAsk }: { snapshot: DashboardSnapshot; onAsk: (question: string) => void }) {
  const primary = snapshot.insights[0];
  return (
    <div className="advisor-home">
      <div className="advisor-greeting">
        <span><Bot className="size-5" /></span>
        <div><strong>Ya revisé el panorama.</strong><p>Encontré {snapshot.insights.length} señales que vale la pena mirar.</p></div>
      </div>

      {primary && (
        <div className={`insight-hero ${primary.tone}`}>
          <div className="insight-label"><Lightbulb className="size-3.5" /> Oportunidad principal</div>
          <strong>{primary.title}</strong>
          <p>{primary.summary}</p>
          <div><b>{primary.metric}</b><span>{primary.action}</span></div>
        </div>
      )}

      <div className="advisor-mini-chart">
        <div className="mini-chart-head"><strong>ROAS por campaña</strong><span>Top {Math.min(snapshot.campaigns.length, 4)}</span></div>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={snapshot.campaigns.slice(0, 4)} layout="vertical" margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
              <XAxis type="number" hide domain={[0, "dataMax"]} />
              <YAxis type="category" dataKey="name" hide />
              <Tooltip cursor={{ fill: "rgba(33,66,255,.05)" }} contentStyle={{ borderRadius: 10, border: "1px solid #e7e5df", fontSize: 11 }} formatter={(value) => [`${Number(value).toFixed(2)}×`, "ROAS"]} />
              <Bar dataKey="roas" fill="var(--color-brand-cta)" radius={[0, 6, 6, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mini-chart-legend">{snapshot.campaigns.slice(0, 3).map((campaign) => <span key={campaign.id}>{campaign.name}</span>)}</div>
      </div>

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
  if (name === "get_dashboard_snapshot") return <SnapshotAnswer snapshot={data} />;
  if (name === "get_campaign_performance") return <CampaignAnswer rows={data?.rows ?? []} currency={data?.currency ?? "COP"} />;
  if (name === "get_channel_mix") return <ChannelAnswer rows={data?.rows ?? []} currency={data?.currency ?? "COP"} />;
  return null;
}

function SnapshotAnswer({ snapshot }: { snapshot: DashboardSnapshot }) {
  const spend = snapshot.metrics?.find((metric) => metric.id === "spend");
  const roas = snapshot.metrics?.find((metric) => metric.id === "roas");
  return (
    <div className="visual-answer">
      <div className="visual-kpis">
        <div><span>Inversión</span><strong>{formatCurrency(spend?.value ?? 0, snapshot.currency)}</strong></div>
        <div><span>ROAS</span><strong>{(roas?.value ?? 0).toFixed(2)}×</strong></div>
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={snapshot.trend?.slice(-8) ?? []} margin={{ top: 8, right: 0, left: -28, bottom: 0 }}>
            <CartesianGrid stroke="#eceae4" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(value) => String(value).slice(5)} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000000)}M`} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e7e5df", fontSize: 11 }} formatter={(value) => formatCurrency(Number(value), snapshot.currency)} />
            <Bar dataKey="spend" fill="var(--color-brand-cta)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CampaignAnswer({ rows, currency }: { rows: any[]; currency: string }) {
  return (
    <div className="visual-answer campaign-answer">
      {rows.slice(0, 4).map((row) => (
        <div key={row.id}><span>{row.name}</span><strong>{Number(row.roas).toFixed(2)}×</strong><small>{formatCurrency(Number(row.spend), currency)}</small></div>
      ))}
    </div>
  );
}

function ChannelAnswer({ rows, currency }: { rows: any[]; currency: string }) {
  const max = Math.max(...rows.map((row) => Number(row.spend)), 1);
  return (
    <div className="visual-answer channel-answer">
      {rows.map((row) => (
        <div key={row.channel}>
          <div><span>{row.channel}</span><strong>{formatNumber(Number(row.conversions))} conv.</strong></div>
          <i><b style={{ width: `${(Number(row.spend) / max) * 100}%` }} /></i>
          <small>{formatCurrency(Number(row.spend), currency)}</small>
        </div>
      ))}
    </div>
  );
}
