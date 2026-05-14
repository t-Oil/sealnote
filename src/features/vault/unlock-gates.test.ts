import { describe, expect, it } from "vitest";

import {
  canDisableBiometricUnlock,
  canShowBiometricUnlockForProtectedNote,
  shouldAutoAttemptBiometricUnlockForProtectedNote,
  shouldShowPasswordFallbackForProtectedNote,
} from "@/features/vault/unlock-gates";

describe("protected note unlock gates", () => {
  it("allows biometric unlock when the vault is locked and biometric is configured", () => {
    expect(
      canShowBiometricUnlockForProtectedNote({
        hasVaultMeta: true,
        hasVaultKey: false,
        supportsBiometricUnlock: true,
        hasBiometricBundle: true,
        hasMatchingBiometricPasskey: true,
      }),
    ).toBe(true);
  });

  it("requires fallback password when biometric is not configured", () => {
    expect(
      canShowBiometricUnlockForProtectedNote({
        hasVaultMeta: true,
        hasVaultKey: false,
        supportsBiometricUnlock: true,
        hasBiometricBundle: false,
        hasMatchingBiometricPasskey: false,
      }),
    ).toBe(false);
  });
});

describe("biometric disable gate", () => {
  it("allows disabling while the vault is unlocked in memory", () => {
    expect(
      canDisableBiometricUnlock({
        hasVaultKey: true,
        hasBiometricBundle: true,
        hasMatchingBiometricPasskey: true,
      }),
    ).toBe(true);
  });

  it("blocks disabling when no matching biometric setup exists", () => {
    expect(
      canDisableBiometricUnlock({
        hasVaultKey: true,
        hasBiometricBundle: true,
        hasMatchingBiometricPasskey: false,
      }),
    ).toBe(false);
  });
});

describe("protected note unlock flow", () => {
  it("auto-attempts biometric only on the first locked-note entry", () => {
    expect(
      shouldAutoAttemptBiometricUnlockForProtectedNote({
        canUnlockWithBiometric: true,
        biometricFailures: 0,
        isEditorOpen: true,
        needsUnlock: true,
        forcePasswordFallback: false,
      }),
    ).toBe(true);

    expect(
      shouldAutoAttemptBiometricUnlockForProtectedNote({
        canUnlockWithBiometric: true,
        biometricFailures: 1,
        isEditorOpen: true,
        needsUnlock: true,
        forcePasswordFallback: false,
      }),
    ).toBe(false);
  });

  it("reveals password fallback after repeated biometric failures", () => {
    expect(
      shouldShowPasswordFallbackForProtectedNote({
        canUnlockWithBiometric: true,
        biometricFailures: 2,
        failureThreshold: 3,
        forcePasswordFallback: false,
      }),
    ).toBe(false);

    expect(
      shouldShowPasswordFallbackForProtectedNote({
        canUnlockWithBiometric: true,
        biometricFailures: 3,
        failureThreshold: 3,
        forcePasswordFallback: false,
      }),
    ).toBe(true);
  });
});
