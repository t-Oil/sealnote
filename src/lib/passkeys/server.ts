import { createHmac, timingSafeEqual } from "node:crypto";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { PASSKEY_AUTH_COOKIE, PASSKEY_COOKIE_TTL_SECONDS, PASSKEY_REGISTER_COOKIE, PASSKEY_RP_NAME, type PasskeyChallengeKind, type SignedPasskeyChallenge } from "@/lib/passkeys/shared";

type PasskeyRecord = {
  backedUp: boolean;
  counter: number;
  credentialId: string;
  deviceType: string;
  publicKey: string;
  transports: string[];
  userId: string;
};

function getPasskeySecret() {
  const secret = process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for passkey challenge signing.");
  }

  return secret;
}

function signPayload(payload: string) {
  return createHmac("sha256", getPasskeySecret()).update(payload).digest("base64url");
}

export function createSignedChallengeValue(input: SignedPasskeyChallenge) {
  const payload = Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function verifySignedChallengeValue(value: string | undefined, expected: {
  kind: PasskeyChallengeKind;
  userId: string;
}) {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payload);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expectedSignature);

  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    return null;
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SignedPasskeyChallenge;

  if (
    decoded.kind !== expected.kind ||
    decoded.userId !== expected.userId ||
    decoded.expiresAt < Date.now()
  ) {
    return null;
  }

  return decoded;
}

export function challengeCookieName(kind: PasskeyChallengeKind) {
  return kind === "registration" ? PASSKEY_REGISTER_COOKIE : PASSKEY_AUTH_COOKIE;
}

export function challengeCookieValue(kind: PasskeyChallengeKind, userId: string, challenge: string) {
  return createSignedChallengeValue({
    challenge,
    expiresAt: Date.now() + PASSKEY_COOKIE_TTL_SECONDS * 1000,
    kind,
    userId,
  });
}

export function challengeCookieOptions() {
  return {
    httpOnly: true,
    maxAge: PASSKEY_COOKIE_TTL_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function getRpConfig(request: Request) {
  const originHeader = request.headers.get("origin");

  if (originHeader) {
    const originUrl = new URL(originHeader);

    return {
      expectedOrigin: originUrl.origin,
      rpID: originUrl.hostname,
      rpName: PASSKEY_RP_NAME,
    };
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (forwardedHost) {
    const forwardedUrl = new URL(`${forwardedProto ?? "https"}://${forwardedHost}`);

    return {
      expectedOrigin: forwardedUrl.origin,
      rpID: forwardedUrl.hostname,
      rpName: PASSKEY_RP_NAME,
    };
  }

  const host = request.headers.get("host");

  if (host) {
    const protocol = new URL(request.url).protocol;
    const hostUrl = new URL(`${protocol}//${host}`);

    return {
      expectedOrigin: hostUrl.origin,
      rpID: hostUrl.hostname,
      rpName: PASSKEY_RP_NAME,
    };
  }

  const url = new URL(request.url);

  return {
    expectedOrigin: url.origin,
    rpID: url.hostname,
    rpName: PASSKEY_RP_NAME,
  };
}

export async function buildRegistrationOptions(input: {
  request: Request;
  user: {
    email?: string | null;
    id: string;
    name?: string | null;
  };
  passkeys: Pick<PasskeyRecord, "credentialId" | "transports">[];
}) {
  const { rpID, rpName } = getRpConfig(input.request);
  const options = await generateRegistrationOptions({
    rpID,
    rpName,
    userID: new TextEncoder().encode(input.user.id),
    userName: input.user.email ?? input.user.name ?? input.user.id,
    userDisplayName: input.user.name ?? input.user.email ?? input.user.id,
    attestationType: "none",
    excludeCredentials: input.passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: normalizeTransports(passkey.transports),
    })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
    supportedAlgorithmIDs: [-7, -257],
  });

  return options;
}

export async function buildAuthenticationOptions(input: {
  request: Request;
  passkeys: Pick<PasskeyRecord, "credentialId" | "transports">[];
}) {
  const { rpID } = getRpConfig(input.request);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: input.passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: normalizeTransports(passkey.transports),
    })),
    userVerification: "required",
  });

  return options;
}

export async function verifyPasskeyRegistration(input: {
  challenge: string;
  request: Request;
  response: RegistrationResponseJSON;
}) {
  const { expectedOrigin, rpID } = getRpConfig(input.request);

  return verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: true,
    supportedAlgorithmIDs: [-7, -257],
  });
}

export async function verifyPasskeyAuthentication(input: {
  challenge: string;
  passkey: PasskeyRecord;
  request: Request;
  response: AuthenticationResponseJSON;
}) {
  const { expectedOrigin, rpID } = getRpConfig(input.request);

  return verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin,
    expectedRPID: rpID,
    credential: {
      id: input.passkey.credentialId,
      publicKey: Buffer.from(input.passkey.publicKey, "base64url"),
      counter: input.passkey.counter,
      transports: normalizeTransports(input.passkey.transports),
    },
    requireUserVerification: true,
  });
}

export function normalizeTransports(transports: string[] | undefined) {
  if (!transports?.length) {
    return undefined;
  }

  return transports.filter(Boolean) as AuthenticatorTransportFuture[];
}

export function serializePasskeyRegistrationOptions(options: PublicKeyCredentialCreationOptionsJSON) {
  return options;
}

export function serializePasskeyAuthenticationOptions(options: PublicKeyCredentialRequestOptionsJSON) {
  return options;
}

export function passkeyRecordFromVerification(input: {
  userId: string;
  verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  response: RegistrationResponseJSON;
}) {
  if (!input.verification.registrationInfo) {
    throw new Error("Passkey registration details missing.");
  }

  const registrationInfo = input.verification.registrationInfo;

  return {
    userId: input.userId,
    credentialId: registrationInfo.credential.id,
    publicKey: Buffer.from(registrationInfo.credential.publicKey).toString("base64url"),
    counter: registrationInfo.credential.counter,
    transports: input.response.response.transports ?? [],
    deviceType: registrationInfo.credentialDeviceType,
    backedUp: registrationInfo.credentialBackedUp,
  };
}
