import { NextResponse } from "next/server";
import { z } from "zod";
import { getAnalyticsRepository } from "@/lib/data/get-analytics-repository";
import { assertAdmin, assertProjectAccess, getRequestUser, requestBearerToken } from "@/lib/auth/server-session";
import { runtimeEnv } from "@/lib/runtime-env";

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
    const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
    const data = await (await getAnalyticsRepository()).getConcertSummary(parsed.data, {
      firestoreToken: useServiceAccount ? undefined : requestBearerToken(request) ?? undefined,
    });
    return NextResponse.json({ data, provider: "bigquery" });
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
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid concert payload" }, { status: 400 });
  }
  const parsed = CreateConcertSchema.safeParse({
    organizationId: form.get("organizationId"),
    projectId: form.get("projectId"),
    artistId: form.get("artistId"),
    displayName: form.get("displayName"),
    namePattern: form.get("namePattern"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid concert payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const photo = form.get("photo");

  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, parsed.data.organizationId, parsed.data.projectId);
    assertAdmin(user);

    const { createFirestoreDocument, getFirestoreDocument } = await import("@/lib/firebase/firestore-rest");
    const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
    const firebaseIdToken = useServiceAccount ? undefined : requestBearerToken(request) ?? undefined;
    const artist = await getFirestoreDocument("artists", parsed.data.artistId, firebaseIdToken);
    if (!artist.exists || artist.data.projectId !== parsed.data.projectId) {
      return NextResponse.json({ error: "El artista no existe en este proyecto" }, { status: 404 });
    }

    let photoUrl: string | undefined;
    if (photo instanceof File && photo.size > 0) {
      const { uploadPublicImage } = await import("@/lib/firebase/storage-rest");
      const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
      photoUrl = await uploadPublicImage(`concerts/${parsed.data.projectId}/${Date.now()}.${extension}`, photo);
    }

    const doc = await createFirestoreDocument("concerts", {
      projectId: parsed.data.projectId,
      artistId: parsed.data.artistId,
      displayName: parsed.data.displayName,
      namePattern: parsed.data.namePattern,
      ...(photoUrl ? { photoUrl } : {}),
    }, firebaseIdToken);

    return NextResponse.json(
      {
        data: {
          id: doc.id,
          projectId: parsed.data.projectId,
          artistId: parsed.data.artistId,
          displayName: parsed.data.displayName,
          namePattern: parsed.data.namePattern,
          photoUrl,
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
    if (error instanceof Error && error.message === "STORAGE_UNSUPPORTED_TYPE") {
      return NextResponse.json({ error: "La foto debe ser JPG, PNG o WEBP" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "STORAGE_FILE_TOO_LARGE") {
      return NextResponse.json({ error: "La foto no puede pesar más de 5MB" }, { status: 400 });
    }
    console.error("[concerts] create failed", error);
    return NextResponse.json({ error: "Unable to create concert" }, { status: 500 });
  }
}

const UpdateConcertSchema = z.object({
  id: z.string().min(1).max(200),
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  artistId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(200),
  namePattern: z.string().min(1).max(200),
});

export async function PATCH(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid concert payload" }, { status: 400 });
  }
  const parsed = UpdateConcertSchema.safeParse({
    id: form.get("id"),
    organizationId: form.get("organizationId"),
    projectId: form.get("projectId"),
    artistId: form.get("artistId"),
    displayName: form.get("displayName"),
    namePattern: form.get("namePattern"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid concert payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const photo = form.get("photo");

  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, parsed.data.organizationId, parsed.data.projectId);
    assertAdmin(user);

    const { getFirestoreDocument, updateFirestoreDocument } = await import("@/lib/firebase/firestore-rest");
    const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
    const firebaseIdToken = useServiceAccount ? undefined : requestBearerToken(request) ?? undefined;
    const existing = await getFirestoreDocument("concerts", parsed.data.id, firebaseIdToken);
    if (!existing.exists || existing.data.projectId !== parsed.data.projectId) {
      return NextResponse.json({ error: "El evento no existe en este proyecto" }, { status: 404 });
    }

    let photoUrl: string | undefined;
    if (photo instanceof File && photo.size > 0) {
      const { uploadPublicImage } = await import("@/lib/firebase/storage-rest");
      const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
      photoUrl = await uploadPublicImage(`concerts/${parsed.data.projectId}/${Date.now()}.${extension}`, photo);
    }

    await updateFirestoreDocument("concerts", parsed.data.id, {
      artistId: parsed.data.artistId,
      displayName: parsed.data.displayName,
      namePattern: parsed.data.namePattern,
      ...(photoUrl ? { photoUrl } : {}),
    }, firebaseIdToken);

    return NextResponse.json({
      data: {
        id: parsed.data.id,
        projectId: parsed.data.projectId,
        artistId: parsed.data.artistId,
        displayName: parsed.data.displayName,
        namePattern: parsed.data.namePattern,
        photoUrl: photoUrl ?? (existing.data.photoUrl ? String(existing.data.photoUrl) : undefined),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "STORAGE_UNSUPPORTED_TYPE") {
      return NextResponse.json({ error: "La foto debe ser JPG, PNG o WEBP" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "STORAGE_FILE_TOO_LARGE") {
      return NextResponse.json({ error: "La foto no puede pesar más de 5MB" }, { status: 400 });
    }
    console.error("[concerts] update failed", error);
    return NextResponse.json({ error: "Unable to update concert" }, { status: 500 });
  }
}
