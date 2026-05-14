import { stringToBytes, toArrayBuffer } from "@/lib/crypto/encoding";
import type { DeriveKekInput } from "@/lib/crypto/types";

export async function deriveKek({
  password,
  salt,
  iterations,
}: DeriveKekInput): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(stringToBytes(password)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations,
    },
    material,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}
