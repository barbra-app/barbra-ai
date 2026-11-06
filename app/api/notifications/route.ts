import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser, requestBearerToken } from "@/lib/auth/server-session";
import { runtimeEnv } from "@/lib/runtime-env";
import type { AppNotification } from "@/lib/domain/analytics";

export const dynamic = "force-dynamic";

async function firestoreHelpers(request: Request) {
  const { listFirestoreDocuments, queryFirestoreDocuments, updateFirestoreDocument } = await import("@/lib/firebase/firestore-rest");
  const useServiceAccount = (await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT")) === "true";
  const firebaseIdToken = useServiceAccount ? undefined : requestBearerToken(request) ?? undefined;
  return { listFirestoreDocuments, queryFirestoreDocuments, updateFirestoreDocument, firebaseIdToken };
}

function errorResponse(error: unknown, fallback = "Unable to process notifications request") {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  console.error("[notifications] request failed", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    const { listFirestoreDocuments, queryFirestoreDocuments, firebaseIdToken } = await firestoreHelpers(request);

    const docs = user.role === "admin"
      ? await listFirestoreDocuments("notifications", firebaseIdToken)
      : user.organizationId
        ? await queryFirestoreDocuments("notifications", "organizationId", user.organizationId, firebaseIdToken)
        : [];

    const data: AppNotification[] = docs
      .filter((doc) => doc.exists && doc.data.createdBy !== user.uid)
      .map((doc) => {
        const readBy = Array.isArray(doc.data.readBy) ? doc.data.readBy.map(String) : [];
        return {
          id: doc.id,
          type: doc.data.type === "artist_created" ? "artist_created" : "concert_created",
          title: String(doc.data.title ?? ""),
          message: String(doc.data.message ?? ""),
          createdAt: String(doc.data.createdAt ?? ""),
          read: readBy.includes(user.uid),
        } satisfies AppNotification;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30);

    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error, "Unable to list notifications");
  }
}

const MarkReadSchema = z.object({ id: z.string().min(1).max(200) });

export async function PATCH(request: Request) {
  try {
    const user = await getRequestUser(request);
    const body = await request.json().catch(() => null);
    const parsed = MarkReadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid notification payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const { getFirestoreDocument } = await import("@/lib/firebase/firestore-rest");
    const { updateFirestoreDocument, firebaseIdToken } = await firestoreHelpers(request);

    const existing = await getFirestoreDocument("notifications", parsed.data.id, firebaseIdToken);
    if (!existing.exists) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    const readBy = Array.isArray(existing.data.readBy) ? existing.data.readBy.map(String) : [];
    if (!readBy.includes(user.uid)) {
      readBy.push(user.uid);
      await updateFirestoreDocument("notifications", parsed.data.id, { readBy }, firebaseIdToken);
    }

    return NextResponse.json({ data: { id: parsed.data.id } });
  } catch (error) {
    return errorResponse(error, "Unable to mark notification as read");
  }
}
