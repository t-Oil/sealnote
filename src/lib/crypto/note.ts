import { decryptString, encryptString } from "@/lib/crypto/aes";
import { stringToBytes, toArrayBuffer } from "@/lib/crypto/encoding";

export type NotePayload = {
  title: string;
  body: string;
  tags: string[];
  type: "note";
  fields: Record<string, string>;
};

export function buildNoteAad(params: {
  userId: string;
  noteId: string;
  cryptoVersion: number;
}) {
  return stringToBytes(
    `user:${params.userId}:note:${params.noteId}:v:${params.cryptoVersion}`,
  );
}

export async function importVaultKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(rawKey),
    {
      name: "AES-GCM",
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptNotePayload(params: {
  vaultKey: Uint8Array;
  payload: NotePayload;
  aad: Uint8Array;
}) {
  const key = await importVaultKey(params.vaultKey);

  return encryptString({
    key,
    plaintext: JSON.stringify(params.payload),
    aad: params.aad,
  });
}

export async function decryptNotePayload(params: {
  vaultKey: Uint8Array;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  aad: Uint8Array;
}) {
  const key = await importVaultKey(params.vaultKey);
  const plaintext = await decryptString({
    key,
    ciphertext: params.ciphertext,
    iv: params.iv,
    aad: params.aad,
  });

  return JSON.parse(plaintext) as NotePayload;
}
