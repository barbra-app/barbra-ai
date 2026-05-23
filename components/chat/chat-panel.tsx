"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useRef, useEffect, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { Spark } from "@/components/layout/brand-mark";
import { AccountList } from "@/components/generative/account-list";
import { CampaignTable } from "@/components/generative/campaign-table";
import { KpiSummary } from "@/components/generative/kpi-card";
import { MetricLineChart } from "@/components/generative/metric-line-chart";
import type { SidebarSelection } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "What accounts do I have?",
  "How is the Bad Bunny Bogotá campaign performing?",
  "Compare ROAS across Atelier Couture campaigns",
  "Plot daily spend for the last 30 days on Casa del Mar",
];

export function ChatPanel({ selection }: { selection: SidebarSelection }) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    []
  );
  const { messages, sendMessage, status } = useChat({ transport });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const contextLine = useMemo(() => {
    if (!selection.account) return null;
    const parts = [`Account: ${selection.account.name}`];
    if (selection.campaignIds.length > 0) {
      parts.push(
        `${selection.campaignIds.length} campaign${
          selection.campaignIds.length === 1 ? "" : "s"
        } selected`
      );
    }
    return parts.join(" · ");
  }, [selection]);

  function submit(text: string) {
    if (!text.trim() || status === "streaming") return;
    // Stitch the sidebar selection into the message so Claude can ground tool calls
    const selectionHint = selection.account
      ? `\n\n[Context: account_id=${selection.account.id}${
          selection.campaignIds.length
            ? `, campaign_ids=${selection.campaignIds.join(",")}`
            : ""
        }]`
      : "";
    sendMessage({ text: text + selectionHint });
    setInput("");
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-screen flex-1 flex-col bg-[var(--color-bg)]">
      <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-6">
        <div>
          <h1
            className="text-[15px] font-semibold tracking-tight text-[var(--color-fg)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Intelligence
          </h1>
          {contextLine && (
            <p className="text-[11px] text-[var(--color-fg-subtle)]">{contextLine}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-fg-subtle)]">
          <Sparkles className="size-3.5 text-[var(--color-brand-spark)]" />
          <span>Generative UI · streamed</span>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyState onPick={submit} />
        ) : (
          <div className="mx-auto max-w-3xl px-6 py-8">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
            {status === "streaming" && (
              <div className="my-2 flex items-center gap-2 text-[12px] text-[var(--color-fg-subtle)]">
                <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-brand-spark)]" />
                Thinking…
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-6 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-[14px] border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] p-2 focus-within:border-[var(--color-brand-cta)]/60"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={1}
            placeholder={
              selection.account
                ? `Ask anything about ${selection.account.name}…`
                : "Ask about an account, campaign, or metric…"
            }
            className="flex-1 resize-none bg-transparent px-3 py-2 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || status === "streaming"}
            className="grid size-9 place-items-center rounded-full bg-[var(--color-brand-cta)] text-[var(--color-brand-cta-fg)] transition hover:bg-[var(--color-brand-cta-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            <ArrowUp className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <Spark className="mb-5 size-9" />
      <h2
        className="mb-2 text-[28px] font-semibold leading-tight tracking-tight text-[var(--color-fg)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Ask the engine.
      </h2>
      <p className="mb-8 max-w-md text-[13.5px] text-[var(--color-fg-muted)]">
        Pick an account on the left, then ask about performance — Barbra will
        pull live data from Master Metrics and render it back as charts,
        tables, and KPI cards.
      </p>
      <div className="grid w-full max-w-xl grid-cols-2 gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3 text-left text-[12.5px] text-[var(--color-fg-muted)] transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-elev-2)] hover:text-[var(--color-fg)]"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Message({ message }: { message: any }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("mb-6 flex gap-3", isUser && "flex-row-reverse")}>
      {!isUser && (
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
          <Spark className="size-3.5" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] space-y-1",
          isUser && "rounded-[12px] bg-[var(--color-bg-elev)] px-4 py-2.5"
        )}
      >
        {message.parts?.map((part: any, i: number) => (
          <PartRenderer key={i} part={part} />
        ))}
      </div>
    </div>
  );
}

function PartRenderer({ part }: { part: any }) {
  if (part.type === "text") {
    // Strip the "[Context: ...]" hint we appended to user messages
    const clean = part.text.replace(/\n\n\[Context:[^\]]*\]$/, "");
    return (
      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--color-fg)]">
        {clean}
      </p>
    );
  }

  // Tool parts come in as type: "tool-<toolName>"
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    if (part.state === "input-streaming" || part.state === "input-available") {
      return <ToolPending name={part.type.replace("tool-", "")} />;
    }
    if (part.state === "output-error") {
      return (
        <div className="my-2 rounded-[10px] border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-400">
          Tool error: {String(part.errorText ?? "unknown")}
        </div>
      );
    }
    if (part.state === "output-available") {
      return <ToolResult output={part.output} />;
    }
  }

  return null;
}

function ToolPending({ name }: { name: string }) {
  return (
    <div className="my-2 flex items-center gap-2 text-[11px] text-[var(--color-fg-subtle)]">
      <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-brand-cta)]" />
      <span className="font-mono">{name}</span>
      <span>running…</span>
    </div>
  );
}

function ToolResult({ output }: { output: any }) {
  if (!output || typeof output !== "object") return null;
  switch (output.type) {
    case "account_list":
      return <AccountList accounts={output.accounts} />;
    case "campaign_table":
      return <CampaignTable data={output} />;
    case "kpi_summary":
      return <KpiSummary data={output} />;
    case "time_series":
      return <MetricLineChart data={output} />;
    default:
      return null;
  }
}
