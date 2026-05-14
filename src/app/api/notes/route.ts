import { NextResponse } from "next/server";

import { noteRecordSchema } from "@/lib/api-schema";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notes = await prisma.note.findMany({
    where: {
      userId: session.user.id,
      deletedAt: null,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return NextResponse.json(notes);
}

export async function POST(request: Request) {
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

  const note = await prisma.note.create({
    data: {
      id: parsed.data.id,
      userId: session.user.id,
      title: parsed.data.title,
      tags: parsed.data.tags,
      bodyPlaintext:
        parsed.data.lockMode === "standard" ? parsed.data.bodyPlaintext : undefined,
      ciphertext: parsed.data.ciphertext ?? undefined,
      iv: parsed.data.iv ?? undefined,
      aad: parsed.data.aad ?? undefined,
      isSensitive: parsed.data.isSensitive,
      lockMode: parsed.data.lockMode,
    },
  });

  return NextResponse.json(note, { status: 201 });
}
