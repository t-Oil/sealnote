import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildAuthenticationOptions,
  challengeCookieName,
  challengeCookieOptions,
  challengeCookieValue,
  serializePasskeyAuthenticationOptions,
} from "@/lib/passkeys/server";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const passkeys = await prisma.userPasskey.findMany({
    where: {
      userId: session.user.id,
    },
    select: {
      credentialId: true,
      transports: true,
    },
  });

  if (!passkeys.length) {
    return NextResponse.json({ error: "Biometric unlock not set up." }, { status: 404 });
  }

  const options = await buildAuthenticationOptions({
    request,
    passkeys: passkeys.map((passkey: { credentialId: string; transports: string[] }) => ({
      credentialId: passkey.credentialId,
      transports: passkey.transports,
    })),
  });
  const response = NextResponse.json(serializePasskeyAuthenticationOptions(options));

  response.cookies.set(
    challengeCookieName("authentication"),
    challengeCookieValue("authentication", session.user.id, options.challenge),
    challengeCookieOptions(),
  );

  return response;
}
