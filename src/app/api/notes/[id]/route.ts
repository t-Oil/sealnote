import { NextResponse } from "next/server";

import { noteRecordSchema } from "@/lib/api-schema";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isValidNotePayload(data: {
  lockMode: "standard" | "sensitive";
  bodyPlaintext: string | null;
  ciphertext: string | null;
  iv: string | null;
  aad: string | null;
}) {
  if (data.lockMode === "sensitive") {
    return Boolean(data.ciphertext && data.iv && data.aad);
  }

  return data.bodyPlaintext !== null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = noteRecordSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid note payload" }, { status: 400 });
  }

  if (!isValidNotePayload(parsed.data)) {
    return NextResponse.json({ error: "Invalid note payload" }, { status: 400 });
  }

  const { id } = await context.params;

  const updated = await prisma.note.updateMany({
    where: {
      id,
      userId: session.user.id,
      deletedAt: null,
    },
    data: {
      title: parsed.data.title,
      tags: parsed.data.tags,
      bodyPlaintext: { set: parsed.data.lockMode === "standard" ? parsed.data.bodyPlaintext : null },
      ciphertext: { set: parsed.data.ciphertext },
      iv: { set: parsed.data.iv },
      aad: { set: parsed.data.aad },
      isSensitive: parsed.data.isSensitive,
      lockMode: parsed.data.lockMode,
      deletedAt: null,
    },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const note = await prisma.note.findUnique({ where: { id } });

  return NextResponse.json(note);
}

export async function DELETE(_: Request, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const deleted = await prisma.note.updateMany({
    where: {
      id,
      userId: session.user.id,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
