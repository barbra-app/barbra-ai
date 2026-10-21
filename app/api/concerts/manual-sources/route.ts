import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdmin, assertProjectAccess, getRequestUser, requestBearerToken } from "@/lib/auth/server-session";
import { manualSources } from "@/lib/data/manual-sources";
import { runtimeEnv } from "@/lib/runtime-env";
import type { ConcertManualSource } from "@/lib/domain/analytics";

export const dynamic = "force-dynamic";

const ScopeSchema = z.object({
  organizationId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(120),
  concertId: z.string().min(1).max(120),
});

const metric = z.number().finite().min(0).nullable();

const SourceSchema = z.object({
  platform: z.string().trim().min(1).max(80),
  active: z.boolean(),
  impressions: metric,
  clicks: metric,
  conversions: metric,
  ctr: z.number().finite().min(0).max(1).nullable(),
  billedSpend: metric,
  notes: z.string().trim().max(1000),
});

const CreateSchema = ScopeSchema.extend({ source: SourceSchema });
const UpdateSchema = ScopeSchema.extend({ id: z.string().min(1).max(120), source: SourceSchema });
const DeleteSchema = ScopeSchema.extend({ id: z.string().min(1).max(120) });

// Loads the concert after the same auth/admin/project checks as the evidence
// route, then hands its current manualSources to `change` and persists the result.
async function mutate(
  request: Request,
  scope: z.infer<typeof ScopeSchema>,
  change: (existing: ConcertManualSource[]) => ConcertManualSource[] | null,
) {
  try {
    const user = await getRequestUser(request);
    assertProjectAccess(user, scope.organizationId, scope.projectId);
    assertAdmin(user);

    const { getFirestoreDocument, updateFirestoreDocument } = await import("@/lib/firebase/firestore-rest");
    const useServiceAccount = await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT") === "true";
    const firebaseIdToken = useServiceAccount ? undefined : requestBearerToken(request) ?? undefined;

    const concert = await getFirestoreDocument("concerts", scope.concertId, firebaseIdToken);
    if (!concert.exists || concert.data.projectId !== scope.projectId) {
      return NextResponse.json({ error: "El evento no existe en este proyecto" }, { status: 404 });
    }

    const next = change(manualSources(concert.data.manualSources));
    if (!next) return NextResponse.json({ error: "La fuente no existe en este evento" }, { status: 404 });

    await updateFirestoreDocument("concerts", scope.concertId, { manualSources: next }, firebaseIdToken);
    return NextResponse.json({ data: { manualSources: next } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    console.error("[concerts/manual-sources] update failed", error);
    return NextResponse.json({ error: "No fue posible guardar la fuente" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid manual source payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const { source, ...scope } = parsed.data;
  return mutate(request, scope, (existing) => [
    ...existing,
    { id: crypto.randomUUID(), ...source, updatedAt: new Date().toISOString() },
  ]);
}

export async function PATCH(request: Request) {
  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid manual source payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id, source, ...scope } = parsed.data;
  return mutate(request, scope, (existing) => existing.some((item) => item.id === id)
    ? existing.map((item) => item.id === id ? { id, ...source, updatedAt: new Date().toISOString() } : item)
    : null);
}

export async function DELETE(request: Request) {
  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid manual source payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id, ...scope } = parsed.data;
  return mutate(request, scope, (existing) => existing.some((item) => item.id === id)
    ? existing.filter((item) => item.id !== id)
    : null);
}
