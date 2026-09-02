import { NextResponse } from "next/server";
import { z } from "zod";
import { getAnalyticsRepository } from "@/lib/data/get-analytics-repository";
import { assertAdmin, assertProjectAccess, getRequestUser } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  artistId: z.string().min(1).max(120),
  concertId: z.string().min(1).max(120).nullable().optional(),
  range: z.enum(["7d", "30d", "90d", "custom"]).default("30d"),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
}).superRefine((value, context) => {
  if (value.range !== "custom") return;
  if (!value.startDate || !value.endDate) {
    context.addIssue({ code: "custom", message: "Custom ranges require startDate and endDate" });
  } else if (value.startDate > value.endDate) {
    context.addIssue({ code: "custom", message: "startDate must be before or equal to endDate" });
  }
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    organizationId: url.searchParams.get("organizationId"),
    projectId: url.searchParams.get("projectId"),
    artistId: url.searchParams.get("artistId"),
    concertId: url.searchParams.get("concertId") || null,
    range: url.searchParams.get("range") || "30d",
    startDate: url.searchParams.get("startDate") || undefined,
    endDate: url.searchParams.get("endDate") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid concert query", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, parsed.data.organizationId, parsed.data.projectId);
    const data = await (await getAnalyticsRepository()).getConcertSummary(parsed.data);
    return NextResponse.json({ data, provider: process.env.ANALYTICS_PROVIDER ?? "mock" });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Project access denied" }, { status: 403 });
    }
    if (error instanceof Error && error.message.startsWith("ANALYTICS_")) {
      const messages: Record<string, string> = {
        ANALYTICS_CLIENT_NOT_CONFIGURED: "La organización aún no tiene un client_id analítico configurado",
        ANALYTICS_ARTIST_NOT_CONFIGURED: "El artista aún no tiene conciertos configurados",
        ANALYTICS_CONCERT_NOT_FOUND: "El concierto seleccionado no existe o no pertenece a este proyecto",
        ANALYTICS_CONCERT_NOT_CONFIGURED: "El concierto aún no tiene un patrón de nombre configurado",
        ANALYTICS_DATE_RANGE_INVALID: "Selecciona un rango de fechas válido",
        ANALYTICS_NO_DATA: "No hay datos normalizados para esta selección y periodo",
        ANALYTICS_MIXED_CURRENCIES: "La selección contiene monedas distintas que todavía no han sido convertidas",
      };
      return NextResponse.json({ error: messages[error.message] ?? "La configuración analítica no es válida" }, { status: 422 });
    }
    console.error("[concerts] query failed", error);
    return NextResponse.json({ error: "Unable to load concert summary" }, { status: 500 });
  }
}

const CreateConcertSchema = z.object({
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  artistId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(200),
  namePattern: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = CreateConcertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid concert payload", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, parsed.data.organizationId, parsed.data.projectId);
    assertAdmin(user);

    const { getFirebaseAdminFirestore } = await import("@/lib/firebase/admin");
    const db = getFirebaseAdminFirestore();
    const artist = await db.collection("artists").doc(parsed.data.artistId).get();
    if (!artist.exists || artist.data()?.projectId !== parsed.data.projectId) {
      return NextResponse.json({ error: "El artista no existe en este proyecto" }, { status: 404 });
    }

    const doc = await db.collection("concerts").add({
      projectId: parsed.data.projectId,
      artistId: parsed.data.artistId,
      displayName: parsed.data.displayName,
      namePattern: parsed.data.namePattern,
    });

    return NextResponse.json(
      {
        data: {
          id: doc.id,
          projectId: parsed.data.projectId,
          artistId: parsed.data.artistId,
          displayName: parsed.data.displayName,
          namePattern: parsed.data.namePattern,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    console.error("[concerts] create failed", error);
    return NextResponse.json({ error: "Unable to create concert" }, { status: 500 });
  }
}
