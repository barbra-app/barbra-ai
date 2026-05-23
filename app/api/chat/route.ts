import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { barbraTools } from "@/lib/ai/tools";
import { getMasterMetricsTools } from "@/lib/mcp/client";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are Barbra — an AI media intelligence partner inside an agency dashboard.

Your job is to help the operator understand and act on advertising performance across their client accounts and campaigns in Master Metrics. The user can pick an account and campaigns in the sidebar; if they haven't, gently invite them to or call list_accounts.

Style: precise, direct, no filler — matching the brand voice ("No layers. No filler. Just the engine."). Short sentences. No hedging.

When the user asks about performance, ALWAYS prefer calling a tool over guessing:
- list_accounts / list_campaigns to orient
- get_kpi_summary for "how is X doing" or topline numbers
- get_time_series for "show me a chart", "how did X trend", "plot Y"

After a tool returns, do not re-state the raw data — the UI already renders it. Instead add one or two sentences of insight: what the operator should notice, and the next question worth asking. Today's date is 2026-05-23.`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const mcpTools = await getMasterMetricsTools();

  const result = streamText({
    model: anthropic("claude-opus-4-7"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: { ...barbraTools, ...mcpTools },
    stopWhen: ({ steps }) => steps.length >= 6,
  });

  return result.toUIMessageStreamResponse();
}
