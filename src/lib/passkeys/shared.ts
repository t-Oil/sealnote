export const PASSKEY_RP_NAME = "SealNote";
export const PASSKEY_AUTH_COOKIE = "sealnote-passkey-auth";
export const PASSKEY_REGISTER_COOKIE = "sealnote-passkey-register";
export const PASSKEY_COOKIE_TTL_SECONDS = 60 * 5;
export const PASSKEY_PRF_LABEL = "sealnote-biometric-v1";

export type PasskeyChallengeKind = "authentication" | "registration";

export type SignedPasskeyChallenge = {
  challenge: string;
  expiresAt: number;
  kind: PasskeyChallengeKind;
  userId: string;
};
