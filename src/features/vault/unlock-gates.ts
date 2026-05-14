export function canShowBiometricUnlockForProtectedNote(input: {
  hasVaultMeta: boolean;
  hasVaultKey: boolean;
  supportsBiometricUnlock: boolean;
  hasBiometricBundle: boolean;
  hasMatchingBiometricPasskey: boolean;
}) {
  return (
    input.hasVaultMeta &&
    !input.hasVaultKey &&
    input.supportsBiometricUnlock &&
    input.hasBiometricBundle &&
    input.hasMatchingBiometricPasskey
  );
}

export function canDisableBiometricUnlock(input: {
  hasVaultKey: boolean;
  hasBiometricBundle: boolean;
  hasMatchingBiometricPasskey: boolean;
}) {
  return input.hasVaultKey && input.hasBiometricBundle && input.hasMatchingBiometricPasskey;
}

export function shouldAutoAttemptBiometricUnlockForProtectedNote(input: {
  canUnlockWithBiometric: boolean;
  biometricFailures: number;
  isEditorOpen: boolean;
  needsUnlock: boolean;
  forcePasswordFallback: boolean;
}) {
  return (
    input.canUnlockWithBiometric &&
    input.biometricFailures === 0 &&
    input.isEditorOpen &&
    input.needsUnlock &&
    !input.forcePasswordFallback
  );
}

export function shouldShowPasswordFallbackForProtectedNote(input: {
  canUnlockWithBiometric: boolean;
  biometricFailures: number;
  failureThreshold: number;
  forcePasswordFallback: boolean;
}) {
  return (
    !input.canUnlockWithBiometric ||
    input.forcePasswordFallback ||
    input.biometricFailures >= input.failureThreshold
  );
}
