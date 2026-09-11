export function isGoogleSandboxEnabled(environment: Record<string, string | undefined>) {
  return environment.NODE_ENV === 'test' || (environment.NODE_ENV !== 'production' && environment.GOOGLE_ADS_SANDBOX_MODE === 'true');
}
