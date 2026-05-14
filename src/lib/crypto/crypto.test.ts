import { describe, expect, it } from "vitest";

import { decryptString, encryptString } from "@/lib/crypto/aes";
import { bytesToBase64, stringToBytes } from "@/lib/crypto/encoding";
import { deriveKek } from "@/lib/crypto/kdf";
import { generateIv } from "@/lib/crypto/random";
import { setupVault, unlockVault } from "@/lib/crypto/vault";

describe("encoding", () => {
  it("roundtrips utf8 bytes through base64", () => {
    const bytes = stringToBytes("SealNote secret");

    expect(bytesToBase64(bytes)).toBe("U2VhbE5vdGUgc2VjcmV0");
  });
});

describe("random", () => {
  it("generates 12-byte ivs", () => {
    expect(generateIv()).toHaveLength(12);
  });
});

describe("kdf", () => {
  it("derives a usable aes-gcm key from a password", async () => {
    const key = await deriveKek({
      password: "correct horse battery staple",
      salt: crypto.getRandomValues(new Uint8Array(16)),
      iterations: 600_000,
    });

    expect(key.type).toBe("secret");
    expect(key.algorithm.name).toBe("AES-GCM");
  });
});

describe("aes", () => {
  it("encrypts and decrypts a payload with aad", async () => {
    const key = await deriveKek({
      password: "master-pass",
      salt: crypto.getRandomValues(new Uint8Array(16)),
      iterations: 600_000,
    });
    const aad = stringToBytes("user:u1:note:n1:v:1");

    const encrypted = await encryptString({
      key,
      plaintext: JSON.stringify({ title: "Hello", body: "World" }),
      aad,
    });
    const decrypted = await decryptString({
      key,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      aad,
    });

    expect(JSON.parse(decrypted)).toEqual({ title: "Hello", body: "World" });
  });

  it("fails decryption with the wrong key", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const aad = stringToBytes("user:u1:note:n1:v:1");
    const key = await deriveKek({
      password: "master-pass",
      salt,
      iterations: 600_000,
    });
    const wrongKey = await deriveKek({
      password: "wrong-pass",
      salt,
      iterations: 600_000,
    });
    const encrypted = await encryptString({
      key,
      plaintext: "sealed",
      aad,
    });

    await expect(
      decryptString({
        key: wrongKey,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        aad,
      }),
    ).rejects.toThrow();
  });

  it("fails decryption with wrong aad", async () => {
    const key = await deriveKek({
      password: "master-pass",
      salt: crypto.getRandomValues(new Uint8Array(16)),
      iterations: 600_000,
    });
    const encrypted = await encryptString({
      key,
      plaintext: "sealed",
      aad: stringToBytes("user:u1:note:n1:v:1"),
    });

    await expect(
      decryptString({
        key,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        aad: stringToBytes("user:u1:note:n2:v:1"),
      }),
    ).rejects.toThrow();
  });
});

describe("vault", () => {
  it("sets up and unlocks a vault from the same password", async () => {
    const setup = await setupVault({
      password: "master-pass",
      iterations: 600_000,
    });

    const unlocked = await unlockVault({
      password: "master-pass",
      meta: setup.meta,
    });

    expect(unlocked.kek.algorithm.name).toBe("AES-GCM");
    expect(unlocked.vaultKey).toHaveLength(32);
  });

  it("rejects a wrong master password", async () => {
    const setup = await setupVault({
      password: "master-pass",
      iterations: 600_000,
    });

    await expect(
      unlockVault({
        password: "wrong-pass",
        meta: setup.meta,
      }),
    ).rejects.toThrow("Invalid master password");
  });
});
