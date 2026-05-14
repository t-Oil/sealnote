import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const passkeys = await prisma.userPasskey.findMany({
    where: {
      userId: session.user.id,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      backedUp: true,
      credentialId: true,
      createdAt: true,
      deviceType: true,
      id: true,
      lastUsedAt: true,
    },
  });

  return NextResponse.json({
    hasPasskeys: passkeys.length > 0,
    passkeys,
  });
}
