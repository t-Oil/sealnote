import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildRegistrationOptions,
  challengeCookieName,
  challengeCookieOptions,
  challengeCookieValue,
  serializePasskeyRegistrationOptions,
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
  const options = await buildRegistrationOptions({
    request,
    user: session.user,
    passkeys: passkeys.map((passkey: { credentialId: string; transports: string[] }) => ({
      credentialId: passkey.credentialId,
      transports: passkey.transports,
    })),
  });
  const response = NextResponse.json(serializePasskeyRegistrationOptions(options));

  response.cookies.set(
    challengeCookieName("registration"),
    challengeCookieValue("registration", session.user.id, options.challenge),
    challengeCookieOptions(),
  );

  return response;
}
