import { z } from "zod";

export const vaultMetaSchema = z.object({
  salt: z.string().min(1),
  kdfAlgo: z.literal("PBKDF2-SHA256"),
  kdfParams: z.object({
    iterations: z.number().int().positive(),
  }),
  encryptedVaultKey: z.string().min(1),
  vaultKeyIv: z.string().min(1),
  encryptedCheck: z.string().min(1),
  checkIv: z.string().min(1),
  cryptoVersion: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
});

export const noteRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().default(""),
  tags: z.array(z.string()).default([]),
  bodyPlaintext: z.string().nullable().default(null),
  ciphertext: z.string().nullable().default(null),
  iv: z.string().nullable().default(null),
  aad: z.string().nullable().default(null),
  isSensitive: z.boolean().default(false),
  lockMode: z.enum(["standard", "sensitive"]).default("standard"),
});

export const vaultMetaApiSchema = vaultMetaSchema.extend({
  userId: z.string().min(1),
});

export const encryptedNoteApiSchema = noteRecordSchema.extend({
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const passkeyApiSchema = z.object({
  id: z.string().min(1),
  credentialId: z.string().min(1),
  deviceType: z.string().min(1),
  backedUp: z.boolean(),
  createdAt: z.string().min(1),
  lastUsedAt: z.string().nullable(),
});

export const passkeyListApiSchema = z.object({
  hasPasskeys: z.boolean(),
  passkeys: z.array(passkeyApiSchema),
});
