import { NextResponse } from "next/server";

import { vaultMetaSchema } from "@/lib/api-schema";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meta = await prisma.vaultMeta.findUnique({
    where: {
      userId: session.user.id,
    },
  });

  if (!meta) {
    return NextResponse.json({ error: "Vault not found" }, { status: 404 });
  }

  return NextResponse.json(meta);
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = vaultMetaSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid vault metadata" }, { status: 400 });
  }

  const meta = await prisma.vaultMeta.upsert({
    where: {
      userId: session.user.id,
    },
    update: {
      salt: parsed.data.salt,
      kdfAlgo: parsed.data.kdfAlgo,
      kdfParams: parsed.data.kdfParams,
      encryptedVaultKey: parsed.data.encryptedVaultKey,
      vaultKeyIv: parsed.data.vaultKeyIv,
      encryptedCheck: parsed.data.encryptedCheck,
      checkIv: parsed.data.checkIv,
      cryptoVersion: parsed.data.cryptoVersion,
      schemaVersion: parsed.data.schemaVersion,
    },
    create: {
      userId: session.user.id,
      salt: parsed.data.salt,
      kdfAlgo: parsed.data.kdfAlgo,
      kdfParams: parsed.data.kdfParams,
      encryptedVaultKey: parsed.data.encryptedVaultKey,
      vaultKeyIv: parsed.data.vaultKeyIv,
      encryptedCheck: parsed.data.encryptedCheck,
      checkIv: parsed.data.checkIv,
      cryptoVersion: parsed.data.cryptoVersion,
      schemaVersion: parsed.data.schemaVersion,
    },
  });

  return NextResponse.json(meta, { status: 201 });
}
