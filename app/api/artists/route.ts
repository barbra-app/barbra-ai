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
  const body = await request.json().catch(() => null);
  const parsed = CreateArtistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid artist payload", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, parsed.data.organizationId, parsed.data.projectId);
    assertAdmin(user);

    const { createFirestoreDocument } = await import("@/lib/firebase/firestore-rest");
    const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
    const firebaseIdToken = useServiceAccount ? undefined : requestBearerToken(request) ?? undefined;
    const doc = await createFirestoreDocument("artists", {
      projectId: parsed.data.projectId,
      displayName: parsed.data.displayName,
    }, firebaseIdToken);

    return NextResponse.json(
      { data: { id: doc.id, projectId: parsed.data.projectId, displayName: parsed.data.displayName } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    console.error("[artists] create failed", error);
    return NextResponse.json({ error: "Unable to create artist" }, { status: 500 });
  }
}
