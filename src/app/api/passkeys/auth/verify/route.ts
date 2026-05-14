import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  challengeCookieName,
  challengeCookieOptions,
  verifyPasskeyAuthentication,
  verifySignedChallengeValue,
} from "@/lib/passkeys/server";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as AuthenticationResponseJSON;
  const cookieStore = await cookies();
  const challengeCookie = cookieStore.get(challengeCookieName("authentication"))?.value;
  const signedChallenge = verifySignedChallengeValue(challengeCookie, {
    kind: "authentication",
    userId: session.user.id,
  });

  if (!signedChallenge) {
    return NextResponse.json({ error: "Biometric unlock expired. Use master password." }, { status: 400 });
  }

  const passkey = await prisma.userPasskey.findUnique({
    where: {
      credentialId: body.id,
    },
  });

  if (!passkey || passkey.userId !== session.user.id) {
    return NextResponse.json({ error: "Passkey not found. Use master password." }, { status: 404 });
  }

  try {
    const verification = await verifyPasskeyAuthentication({
      challenge: signedChallenge.challenge,
      passkey: {
        backedUp: passkey.backedUp,
        counter: passkey.counter,
        credentialId: passkey.credentialId,
        deviceType: passkey.deviceType,
        publicKey: passkey.publicKey,
        transports: passkey.transports,
        userId: passkey.userId,
      },
      request,
      response: body,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "Biometric unlock failed. Use master password." }, { status: 400 });
    }

    await prisma.userPasskey.update({
      where: {
        credentialId: passkey.credentialId,
      },
      data: {
        backedUp: verification.authenticationInfo.credentialBackedUp,
        counter: verification.authenticationInfo.newCounter,
        deviceType: verification.authenticationInfo.credentialDeviceType,
        lastUsedAt: new Date(),
      },
    });

    const response = NextResponse.json({ ok: true });

    response.cookies.set(challengeCookieName("authentication"), "", {
      ...challengeCookieOptions(),
      maxAge: 0,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Biometric unlock failed. Use master password." },
      { status: 400 },
    );
  }
}
