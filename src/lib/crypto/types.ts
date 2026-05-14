export type EncryptionResult = {
  ciphertext: Uint8Array;
  iv: Uint8Array;
};

export type DeriveKekInput = {
  password: string;
  salt: Uint8Array;
  iterations: number;
};

export type EncryptStringInput = {
  key: CryptoKey;
  plaintext: string;
  aad?: Uint8Array;
  iv?: Uint8Array;
};

export type DecryptStringInput = {
  key: CryptoKey;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  aad?: Uint8Array;
};

export type VaultMetaRecord = {
  salt: string;
  kdfAlgo: "PBKDF2-SHA256";
  kdfParams: {
    iterations: number;
  };
  encryptedVaultKey: string;
  vaultKeyIv: string;
  encryptedCheck: string;
  checkIv: string;
  cryptoVersion: number;
  schemaVersion: number;
};
