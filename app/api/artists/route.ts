import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdmin, assertProjectAccess, getRequestUser, requestBearerToken } from "@/lib/auth/server-session";
import { runtimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const CreateArtistSchema = z.object({
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid artist payload" }, { status: 400 });
  }
  const parsed = CreateArtistSchema.safeParse({
    organizationId: form.get("organizationId"),
    projectId: form.get("projectId"),
    displayName: form.get("displayName"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid artist payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const photo = form.get("photo");

  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, parsed.data.organizationId, parsed.data.projectId);
    assertAdmin(user);

    let photoUrl: string | undefined;
    if (photo instanceof File && photo.size > 0) {
      const { uploadPublicImage } = await import("@/lib/firebase/storage-rest");
      const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
      photoUrl = await uploadPublicImage(`artists/${parsed.data.projectId}/${Date.now()}.${extension}`, photo);
    }

    const { createFirestoreDocument } = await import("@/lib/firebase/firestore-rest");
    const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
    const firebaseIdToken = useServiceAccount ? undefined : requestBearerToken(request) ?? undefined;
    const doc = await createFirestoreDocument("artists", {
      projectId: parsed.data.projectId,
      displayName: parsed.data.displayName,
      ...(photoUrl ? { photoUrl } : {}),
    }, firebaseIdToken);

    return NextResponse.json(
      { data: { id: doc.id, projectId: parsed.data.projectId, displayName: parsed.data.displayName, photoUrl } },
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
    console.error("[artists] create failed", error);
    return NextResponse.json({ error: "Unable to create artist" }, { status: 500 });
  }
}

const UpdateArtistSchema = z.object({
  id: z.string().min(1).max(200),
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(200),
});

export async function PATCH(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid artist payload" }, { status: 400 });
  }
  const parsed = UpdateArtistSchema.safeParse({
    id: form.get("id"),
    organizationId: form.get("organizationId"),
    projectId: form.get("projectId"),
    displayName: form.get("displayName"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid artist payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const photo = form.get("photo");

  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, parsed.data.organizationId, parsed.data.projectId);
    assertAdmin(user);

    const { getFirestoreDocument, updateFirestoreDocument } = await import("@/lib/firebase/firestore-rest");
    const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
    const firebaseIdToken = useServiceAccount ? undefined : requestBearerToken(request) ?? undefined;
    const existing = await getFirestoreDocument("artists", parsed.data.id, firebaseIdToken);
    if (!existing.exists || existing.data.projectId !== parsed.data.projectId) {
      return NextResponse.json({ error: "El artista no existe en este proyecto" }, { status: 404 });
    }

    let photoUrl: string | undefined;
    if (photo instanceof File && photo.size > 0) {
      const { uploadPublicImage } = await import("@/lib/firebase/storage-rest");
      const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
      photoUrl = await uploadPublicImage(`artists/${parsed.data.projectId}/${Date.now()}.${extension}`, photo);
    }

    await updateFirestoreDocument("artists", parsed.data.id, {
      displayName: parsed.data.displayName,
      ...(photoUrl ? { photoUrl } : {}),
    }, firebaseIdToken);

    return NextResponse.json({
      data: {
        id: parsed.data.id,
        projectId: parsed.data.projectId,
        displayName: parsed.data.displayName,
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
    console.error("[artists] update failed", error);
    return NextResponse.json({ error: "Unable to update artist" }, { status: 500 });
  }
}
