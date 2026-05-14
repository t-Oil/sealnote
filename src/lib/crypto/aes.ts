import { bytesToString, stringToBytes, toArrayBuffer } from "@/lib/crypto/encoding";
import { generateIv } from "@/lib/crypto/random";
import type { DecryptStringInput, EncryptStringInput, EncryptionResult } from "@/lib/crypto/types";

async function encryptBytes(params: {
  key: CryptoKey;
  plaintextBytes: Uint8Array;
  aad?: Uint8Array;
  iv?: Uint8Array;
}): Promise<EncryptionResult> {
  const iv = params.iv ?? generateIv();
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: params.aad ? toArrayBuffer(params.aad) : undefined,
    },
    params.key,
    toArrayBuffer(params.plaintextBytes),
  );

  return {
    ciphertext: new Uint8Array(encrypted),
    iv,
  };
}

export async function encryptString({
  key,
  plaintext,
  aad,
  iv,
}: EncryptStringInput): Promise<EncryptionResult> {
  return encryptBytes({
    key,
    aad,
    iv,
    plaintextBytes: stringToBytes(plaintext),
  });
}

export async function decryptString({
  key,
  ciphertext,
  iv,
  aad,
}: DecryptStringInput): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: aad ? toArrayBuffer(aad) : undefined,
    },
    key,
    toArrayBuffer(ciphertext),
  );

  return bytesToString(new Uint8Array(decrypted));
}
