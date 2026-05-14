"use client";

import type { BiometricUnlockBundle } from "@/features/vault/types";

const DB_NAME = "sealnote";
const DB_VERSION = 1;
const STORE_NAME = "biometric-unlock";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error("Failed to open biometric storage."));
    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function readBiometricUnlockBundle(userId: string): Promise<BiometricUnlockBundle | null> {
  try {
    const database = await openDatabase();

    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(userId);

      request.onerror = () => reject(request.error ?? new Error("Failed to read biometric state."));
      request.onsuccess = () => resolve((request.result as BiometricUnlockBundle | undefined) ?? null);
    });
  } catch {
    return null;
  }
}

export async function writeBiometricUnlockBundle(bundle: BiometricUnlockBundle) {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).put(bundle);

    request.onerror = () => reject(request.error ?? new Error("Failed to save biometric state."));
    request.onsuccess = () => resolve();
  });
}

export async function removeBiometricUnlockBundle(userId: string) {
  try {
    const database = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).delete(userId);

      request.onerror = () => reject(request.error ?? new Error("Failed to clear biometric state."));
      request.onsuccess = () => resolve();
    });
  } catch {
    // Ignore local cleanup failures. Master password remains the fallback.
  }
}
