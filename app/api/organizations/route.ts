import { NextResponse } from "next/server";
import { assertAdmin, getRequestUser, requestBearerToken } from "@/lib/auth/server-session";
import { runtimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const form = await request.formData().catch(() => null);
  const id = form?.get("id");
  const photo = form?.get("photo");
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "Invalid organization payload" }, { status: 400 });
  }
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "Selecciona una foto" }, { status: 400 });
  }

  try {
    const user = await getRequestUser(request);
    assertAdmin(user);

    const { getFirestoreDocument, updateFirestoreDocument } = await import("@/lib/firebase/firestore-rest");
    const useServiceAccount = (await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT")) === "true";
    const firebaseIdToken = useServiceAccount ? undefined : requestBearerToken(request) ?? undefined;

    const existing = await getFirestoreDocument("organizations", id, firebaseIdToken);
    if (!existing.exists) {
      return NextResponse.json({ error: "La organización no existe" }, { status: 404 });
    }

    const { uploadPublicImage } = await import("@/lib/firebase/storage-rest");
    const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const photoUrl = await uploadPublicImage(`organizations/${id}/${Date.now()}.${extension}`, photo);

    await updateFirestoreDocument("organizations", id, { photoUrl }, firebaseIdToken);

    return NextResponse.json({ data: { id, photoUrl } });
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
    console.error("[organizations] update failed", error);
    return NextResponse.json({ error: "Unable to update organization" }, { status: 500 });
  }
}
