import { NextResponse } from "next/server";
import { z } from "zod";
import { getAnalyticsRepository } from "@/lib/data/get-analytics-repository";
import { assertProjectAccess, getRequestUser } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  campaignId: z.string().min(1).max(120).nullable().optional(),
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    organizationId: url.searchParams.get("organizationId"),
    projectId: url.searchParams.get("projectId"),
    campaignId: url.searchParams.get("campaignId") || null,
    range: url.searchParams.get("range") || "30d",
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid dashboard query", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, parsed.data.organizationId, parsed.data.projectId);
    const data = await (await getAnalyticsRepository()).getDashboard(parsed.data);
    return NextResponse.json({ data, provider: process.env.ANALYTICS_PROVIDER ?? "mock", user: { uid: user.uid, name: user.name, role: user.role } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Project access denied" }, { status: 403 });
    }
    console.error("[dashboard] query failed", error);
    return NextResponse.json({ error: "Unable to load dashboard data" }, { status: 500 });
  }
}
