export function generateIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function generateVaultKeyBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}
