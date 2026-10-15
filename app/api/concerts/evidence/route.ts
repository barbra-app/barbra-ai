import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdmin, assertProjectAccess, getRequestUser, requestBearerToken } from "@/lib/auth/server-session";
import { runtimeEnv } from "@/lib/runtime-env";
import type { ConcertEvidencePhoto } from "@/lib/domain/analytics";

export const dynamic = "force-dynamic";

const PayloadSchema = z.object({
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  concertId: z.string().min(1).max(120),
  caption: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid evidence payload" }, { status: 400 });
  }
  const parsed = PayloadSchema.safeParse({
    organizationId: form.get("organizationId"),
    projectId: form.get("projectId"),
    concertId: form.get("concertId"),
    caption: form.get("caption"),
  });
  const photo = form.get("photo");
  if (!parsed.success || !(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "Invalid evidence payload", details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, parsed.data.organizationId, parsed.data.projectId);
    assertAdmin(user);

    const { getFirestoreDocument, updateFirestoreDocument } = await import("@/lib/firebase/firestore-rest");
    const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
    const firebaseIdToken = useServiceAccount ? undefined : requestBearerToken(request) ?? undefined;

    const concert = await getFirestoreDocument("concerts", parsed.data.concertId, firebaseIdToken);
    if (!concert.exists || concert.data.projectId !== parsed.data.projectId) {
      return NextResponse.json({ error: "El evento no existe en este proyecto" }, { status: 404 });
    }

    const { uploadPublicImage } = await import("@/lib/firebase/storage-rest");
    const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const url = await uploadPublicImage(`concerts/${parsed.data.projectId}/${parsed.data.concertId}/evidence/${Date.now()}.${extension}`, photo);

    const existing = Array.isArray(concert.data.evidencePhotos) ? concert.data.evidencePhotos as ConcertEvidencePhoto[] : [];
    const evidencePhotos: ConcertEvidencePhoto[] = [
      ...existing,
      { url, caption: parsed.data.caption, uploadedAt: new Date().toISOString() },
    ];

    await updateFirestoreDocument("concerts", parsed.data.concertId, { evidencePhotos }, firebaseIdToken);

    return NextResponse.json({ data: { evidencePhotos } }, { status: 201 });
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
    console.error("[concerts/evidence] upload failed", error);
    return NextResponse.json({ error: "Unable to upload evidence photo" }, { status: 500 });
  }
}

const DeleteSchema = z.object({
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  concertId: z.string().min(1).max(120),
  url: z.string().min(1),
});

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid evidence payload", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, parsed.data.organizationId, parsed.data.projectId);
    assertAdmin(user);

    const { getFirestoreDocument, updateFirestoreDocument } = await import("@/lib/firebase/firestore-rest");
    const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
    const firebaseIdToken = useServiceAccount ? undefined : requestBearerToken(request) ?? undefined;

    const concert = await getFirestoreDocument("concerts", parsed.data.concertId, firebaseIdToken);
    if (!concert.exists || concert.data.projectId !== parsed.data.projectId) {
      return NextResponse.json({ error: "El evento no existe en este proyecto" }, { status: 404 });
    }

    const existing = Array.isArray(concert.data.evidencePhotos) ? concert.data.evidencePhotos as ConcertEvidencePhoto[] : [];
    const evidencePhotos = existing.filter((photo) => photo.url !== parsed.data.url);

    await updateFirestoreDocument("concerts", parsed.data.concertId, { evidencePhotos }, firebaseIdToken);

    const { deletePublicImage } = await import("@/lib/firebase/storage-rest");
    await deletePublicImage(parsed.data.url).catch((error) => {
      console.error("[concerts/evidence] storage delete failed", error);
    });

    return NextResponse.json({ data: { evidencePhotos } }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    console.error("[concerts/evidence] delete failed", error);
    return NextResponse.json({ error: "Unable to delete evidence photo" }, { status: 500 });
  }
}
