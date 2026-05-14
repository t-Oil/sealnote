export type AuthLaunchEnvironment = {
  matchMedia?: (query: string) => { matches: boolean };
  navigatorStandalone?: boolean;
};

export function isStandaloneMode(env: AuthLaunchEnvironment): boolean {
  const matchesStandalone = env.matchMedia?.("(display-mode: standalone)").matches ?? false;

  return matchesStandalone || env.navigatorStandalone === true;
}

export function shouldUseExternalGoogleAuth(env: AuthLaunchEnvironment): boolean {
  return isStandaloneMode(env);
}
