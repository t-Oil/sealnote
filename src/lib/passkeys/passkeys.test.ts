import { describe, expect, it } from "vitest";

import { createBiometricBundle, unwrapVaultKeyWithBiometric } from "@/lib/crypto/biometric-vault";
import { challengeCookieValue, getRpConfig, verifySignedChallengeValue } from "@/lib/passkeys/server";

describe("biometric vault bundle", () => {
  it("roundtrips a wrapped vault key from the same prf seed", async () => {
    const prfSeed = crypto.getRandomValues(new Uint8Array(32));
    const vaultKey = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await createBiometricBundle({
      prfSeed,
      vaultKey,
    });

    const unwrapped = await unwrapVaultKeyWithBiometric({
      prfSeed,
      salt: wrapped.salt,
      wrappedVaultKey: wrapped.wrappedVaultKey,
      wrappedVaultKeyIv: wrapped.wrappedVaultKeyIv,
    });

    expect(Array.from(unwrapped)).toEqual(Array.from(vaultKey));
  });
});

describe("passkey challenge signing", () => {
  it("accepts a signed challenge for the same user and kind", () => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    const signed = challengeCookieValue("authentication", "user-1", "challenge-1");

    expect(
      verifySignedChallengeValue(signed, {
        kind: "authentication",
        userId: "user-1",
      }),
    ).toMatchObject({
      challenge: "challenge-1",
      kind: "authentication",
      userId: "user-1",
    });
  });

  it("rejects a signed challenge for the wrong user", () => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    const signed = challengeCookieValue("registration", "user-1", "challenge-1");

    expect(
      verifySignedChallengeValue(signed, {
        kind: "registration",
        userId: "user-2",
      }),
    ).toBeNull();
  });
});

describe("passkey rp config", () => {
  it("prefers the browser origin header over the internal request url", () => {
    const request = new Request("http://127.0.0.1:3000/api/passkeys/register/options", {
      headers: {
        origin: "http://localhost:3041",
      },
    });

    expect(getRpConfig(request)).toMatchObject({
      expectedOrigin: "http://localhost:3041",
      rpID: "localhost",
    });
  });

  it("falls back to forwarded host and proto when origin is absent", () => {
    const request = new Request("http://app:3000/api/passkeys/register/options", {
      headers: {
        "x-forwarded-host": "192.168.50.153:3041",
        "x-forwarded-proto": "http",
      },
    });

    expect(getRpConfig(request)).toMatchObject({
      expectedOrigin: "http://192.168.50.153:3041",
      rpID: "192.168.50.153",
    });
  });
});
