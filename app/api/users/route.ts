import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdmin, getRequestUser, requestBearerToken } from "@/lib/auth/server-session";
import { runtimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

async function firestoreHelpers(request: Request) {
  const { getFirestoreDocument, listFirestoreDocuments, updateFirestoreDocument, deleteFirestoreDocument } = await import("@/lib/firebase/firestore-rest");
  const useServiceAccount = (await runtimeEnv("FIRESTORE_USE_SERVICE_ACCOUNT")) === "true";
  const firebaseIdToken = useServiceAccount ? undefined : requestBearerToken(request) ?? undefined;
  return { getFirestoreDocument, listFirestoreDocuments, updateFirestoreDocument, deleteFirestoreDocument, firebaseIdToken };
}

function toManagedUser(doc: { id: string; data: Record<string, unknown> }) {
  return {
    uid: doc.id,
    name: String(doc.data.name ?? ""),
    email: String(doc.data.email ?? ""),
    role: (doc.data.role === "admin" || doc.data.role === "owner" ? "admin" : "user") as "admin" | "user",
    organizationId: doc.data.organizationId ? String(doc.data.organizationId) : null,
  };
}

function errorResponse(error: unknown, fallback = "Unable to process users request") {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  console.error("[users] request failed", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const user = await getRequestUser(request);
    assertAdmin(user);
    const { listFirestoreDocuments, firebaseIdToken } = await firestoreHelpers(request);
    const docs = await listFirestoreDocuments("users", firebaseIdToken);
    const data = docs.filter((doc) => doc.exists).map(toManagedUser).sort((a, b) => a.email.localeCompare(b.email));
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error, "Unable to list users");
  }
}

const CreateUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  role: z.enum(["admin", "user"]),
  organizationId: z.string().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    assertAdmin(user);
    const body = await request.json().catch(() => null);
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos de usuario inválidos", details: parsed.error.flatten() }, { status: 400 });
    }
    if (parsed.data.role === "user" && !parsed.data.organizationId) {
      return NextResponse.json({ error: "Selecciona una organización para un usuario cliente" }, { status: 400 });
    }

    const { createFirebaseUser } = await import("@/lib/firebase/auth-rest");
    let uid: string;
    try {
      const created = await createFirebaseUser({ email: parsed.data.email, displayName: parsed.data.name });
      uid = created.uid;
    } catch (authError) {
      if (authError instanceof Error && authError.message === "auth/email-already-exists") {
        return NextResponse.json({ error: "Ya existe una cuenta con ese correo" }, { status: 409 });
      }
      throw authError;
    }

    const organizationId = parsed.data.role === "admin" ? null : parsed.data.organizationId ?? null;
    const { updateFirestoreDocument, firebaseIdToken } = await firestoreHelpers(request);
    await updateFirestoreDocument("users", uid, {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      organizationId,
      organizationIds: organizationId ? [organizationId] : [],
      projectIds: [],
    }, firebaseIdToken);

    return NextResponse.json(
      { data: { uid, name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, organizationId } },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, "Unable to create user");
  }
}

const UpdateUserSchema = z.object({
  uid: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  role: z.enum(["admin", "user"]),
  organizationId: z.string().min(1).max(120).optional(),
});

export async function PATCH(request: Request) {
  try {
    const user = await getRequestUser(request);
    assertAdmin(user);
    const body = await request.json().catch(() => null);
    const parsed = UpdateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos de usuario inválidos", details: parsed.error.flatten() }, { status: 400 });
    }
    if (parsed.data.role === "user" && !parsed.data.organizationId) {
      return NextResponse.json({ error: "Selecciona una organización para un usuario cliente" }, { status: 400 });
    }

    const { getFirestoreDocument, updateFirestoreDocument, firebaseIdToken } = await firestoreHelpers(request);
    const existing = await getFirestoreDocument("users", parsed.data.uid, firebaseIdToken);
    if (!existing.exists) {
      return NextResponse.json({ error: "El usuario no existe" }, { status: 404 });
    }

    if (parsed.data.name) {
      const { updateFirebaseUserDisplayName } = await import("@/lib/firebase/auth-rest");
      try {
        await updateFirebaseUserDisplayName(parsed.data.uid, parsed.data.name);
      } catch (authError) {
        if (!(authError instanceof Error && authError.message === "auth/user-not-found")) throw authError;
      }
    }

    const organizationId = parsed.data.role === "admin" ? null : parsed.data.organizationId ?? null;
    await updateFirestoreDocument("users", parsed.data.uid, {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      role: parsed.data.role,
      organizationId,
      organizationIds: organizationId ? [organizationId] : [],
    }, firebaseIdToken);

    return NextResponse.json({
      data: toManagedUser({
        id: parsed.data.uid,
        data: { ...existing.data, ...(parsed.data.name ? { name: parsed.data.name } : {}), role: parsed.data.role, organizationId },
      }),
    });
  } catch (error) {
    return errorResponse(error, "Unable to update user");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getRequestUser(request);
    assertAdmin(user);
    const url = new URL(request.url);
    const uid = url.searchParams.get("uid");
    if (!uid) return NextResponse.json({ error: "Falta el id del usuario" }, { status: 400 });
    if (uid === user.uid) {
      return NextResponse.json({ error: "No puedes borrar tu propia cuenta desde aquí" }, { status: 409 });
    }

    const { deleteFirebaseUser } = await import("@/lib/firebase/auth-rest");
    try {
      await deleteFirebaseUser(uid);
    } catch (authError) {
      if (!(authError instanceof Error && authError.message === "auth/user-not-found")) throw authError;
    }

    const { deleteFirestoreDocument, firebaseIdToken } = await firestoreHelpers(request);
    await deleteFirestoreDocument("users", uid, firebaseIdToken);

    return NextResponse.json({ data: { uid } });
  } catch (error) {
    return errorResponse(error, "Unable to delete user");
  }
}
