import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{
    credentialId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { credentialId } = await context.params;
  const deleted = await prisma.userPasskey.deleteMany({
    where: {
      credentialId,
      userId: session.user.id,
    },
  });

  if (!deleted.count) {
    return NextResponse.json({ error: "Passkey not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
