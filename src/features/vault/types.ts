import type { VaultMetaRecord } from "@/lib/crypto/types";
import type { NotePayload } from "@/lib/crypto/note";

export type VaultMetaApiRecord = VaultMetaRecord & {
  userId: string;
};

export type EncryptedNoteRecord = {
  id: string;
  title: string;
  tags: string[];
  bodyPlaintext: string | null;
  ciphertext: string | null;
  iv: string | null;
  aad: string | null;
  isSensitive: boolean;
  lockMode: "standard" | "sensitive";
  createdAt: string;
  updatedAt: string;
};

export type NoteListItem = {
  id: string;
  title: string;
  tags: string[];
  bodyPlaintext: string | null;
  isSensitive: boolean;
  lockMode: "standard" | "sensitive";
  createdAt: string;
  updatedAt: string;
};

export type UnlockedNote = NoteListItem & {
  payload: NotePayload;
};

export type PasskeyListItem = {
  id: string;
  credentialId: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export type PasskeyListResponse = {
  hasPasskeys: boolean;
  passkeys: PasskeyListItem[];
};

export type BiometricUnlockBundle = {
  version: 1;
  userId: string;
  credentialId: string;
  salt: string;
  wrappedVaultKey: string;
  wrappedVaultKeyIv: string;
};
