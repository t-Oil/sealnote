import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  challengeCookieName,
  challengeCookieOptions,
  passkeyRecordFromVerification,
  verifyPasskeyRegistration,
  verifySignedChallengeValue,
} from "@/lib/passkeys/server";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as RegistrationResponseJSON;
  const cookieStore = await cookies();
  const challengeCookie = cookieStore.get(challengeCookieName("registration"))?.value;
  const signedChallenge = verifySignedChallengeValue(challengeCookie, {
    kind: "registration",
    userId: session.user.id,
  });

  if (!signedChallenge) {
    return NextResponse.json({ error: "Passkey registration expired. Try again." }, { status: 400 });
  }

  try {
    const verification = await verifyPasskeyRegistration({
      challenge: signedChallenge.challenge,
      request,
      response: body,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "Passkey registration failed." }, { status: 400 });
    }

    const passkey = passkeyRecordFromVerification({
      userId: session.user.id,
      verification,
      response: body,
    });

    await prisma.userPasskey.upsert({
      where: {
        credentialId: passkey.credentialId,
      },
      update: {
        backedUp: passkey.backedUp,
        counter: passkey.counter,
        deviceType: passkey.deviceType,
        publicKey: passkey.publicKey,
        transports: passkey.transports,
      },
      create: passkey,
    });

    const response = NextResponse.json({
      ok: true,
      credentialId: passkey.credentialId,
    });

    response.cookies.set(challengeCookieName("registration"), "", {
      ...challengeCookieOptions(),
      maxAge: 0,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Passkey registration failed." },
      { status: 400 },
    );
  }
}
