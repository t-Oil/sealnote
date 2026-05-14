import { base64ToBytes, bytesToBase64, toArrayBuffer } from "@/lib/crypto/encoding";
import { generateIv, generateSalt } from "@/lib/crypto/random";

const BIO_INFO = new TextEncoder().encode("sealnote-biometric-wrap-v1");

type WrappedVaultKeyRecord = {
  salt: string;
  wrappedVaultKey: string;
  wrappedVaultKeyIv: string;
};

export async function createBiometricBundle(input: {
  prfSeed: Uint8Array;
  vaultKey: Uint8Array;
}): Promise<WrappedVaultKeyRecord> {
  const salt = generateSalt();
  const wrapKey = await deriveBiometricWrapKey({
    prfSeed: input.prfSeed,
    salt,
  });
  const iv = generateIv();
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
    },
    wrapKey,
    toArrayBuffer(input.vaultKey),
  );

  return {
    salt: bytesToBase64(salt),
    wrappedVaultKey: bytesToBase64(new Uint8Array(encrypted)),
    wrappedVaultKeyIv: bytesToBase64(iv),
  };
}

export async function unwrapVaultKeyWithBiometric(input: {
  prfSeed: Uint8Array;
  salt: string;
  wrappedVaultKey: string;
  wrappedVaultKeyIv: string;
}) {
  const wrapKey = await deriveBiometricWrapKey({
    prfSeed: input.prfSeed,
    salt: base64ToBytes(input.salt),
  });
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(base64ToBytes(input.wrappedVaultKeyIv)),
    },
    wrapKey,
    toArrayBuffer(base64ToBytes(input.wrappedVaultKey)),
  );

  return new Uint8Array(decrypted);
}

async function deriveBiometricWrapKey(input: {
  prfSeed: Uint8Array;
  salt: Uint8Array;
}) {
  const seedKey = await crypto.subtle.importKey("raw", toArrayBuffer(input.prfSeed), "HKDF", false, ["deriveKey"]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(input.salt),
      info: BIO_INFO,
    },
    seedKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}
