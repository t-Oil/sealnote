import { bytesToBase64, bytesToString, base64ToBytes, stringToBytes, toArrayBuffer } from "@/lib/crypto/encoding";
import { deriveKek } from "@/lib/crypto/kdf";
import { generateIv, generateSalt, generateVaultKeyBytes } from "@/lib/crypto/random";
import type { VaultMetaRecord } from "@/lib/crypto/types";

const CHECK_VALUE = "sealnote-vault-check-v1";

async function encryptBytes(params: {
  key: CryptoKey;
  plaintext: Uint8Array;
  iv: Uint8Array;
}): Promise<Uint8Array> {
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(params.iv),
    },
    params.key,
    toArrayBuffer(params.plaintext),
  );

  return new Uint8Array(encrypted);
}

async function decryptBytes(params: {
  key: CryptoKey;
  ciphertext: Uint8Array;
  iv: Uint8Array;
}): Promise<Uint8Array> {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(params.iv),
    },
    params.key,
    toArrayBuffer(params.ciphertext),
  );

  return new Uint8Array(decrypted);
}

export async function setupVault(params: {
  password: string;
  iterations: number;
}): Promise<{ meta: VaultMetaRecord; vaultKey: Uint8Array; kek: CryptoKey }> {
  const salt = generateSalt();
  const kek = await deriveKek({
    password: params.password,
    salt,
    iterations: params.iterations,
  });
  const vaultKey = generateVaultKeyBytes();
  const vaultKeyIv = generateIv();
  const checkIv = generateIv();
  const encryptedVaultKey = await encryptBytes({
    key: kek,
    plaintext: vaultKey,
    iv: vaultKeyIv,
  });
  const encryptedCheck = await encryptBytes({
    key: kek,
    plaintext: stringToBytes(CHECK_VALUE),
    iv: checkIv,
  });

  return {
    meta: {
      salt: bytesToBase64(salt),
      kdfAlgo: "PBKDF2-SHA256",
      kdfParams: {
        iterations: params.iterations,
      },
      encryptedVaultKey: bytesToBase64(encryptedVaultKey),
      vaultKeyIv: bytesToBase64(vaultKeyIv),
      encryptedCheck: bytesToBase64(encryptedCheck),
      checkIv: bytesToBase64(checkIv),
      cryptoVersion: 1,
      schemaVersion: 1,
    },
    vaultKey,
    kek,
  };
}

export async function unlockVault(params: {
  password: string;
  meta: VaultMetaRecord;
}): Promise<{ kek: CryptoKey; vaultKey: Uint8Array }> {
  const kek = await deriveKek({
    password: params.password,
    salt: base64ToBytes(params.meta.salt),
    iterations: params.meta.kdfParams.iterations,
  });

  try {
    const checkBytes = await decryptBytes({
      key: kek,
      ciphertext: base64ToBytes(params.meta.encryptedCheck),
      iv: base64ToBytes(params.meta.checkIv),
    });

    if (bytesToString(checkBytes) !== CHECK_VALUE) {
      throw new Error("Invalid master password");
    }

    const vaultKey = await decryptBytes({
      key: kek,
      ciphertext: base64ToBytes(params.meta.encryptedVaultKey),
      iv: base64ToBytes(params.meta.vaultKeyIv),
    });

    return { kek, vaultKey };
  } catch {
    throw new Error("Invalid master password");
  }
}
