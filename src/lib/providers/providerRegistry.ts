/**
 * Provider Registry
 * ENCHO Advertising Operating System
 *
 * Central registry of available ad providers.
 * Enforces provider registration without hardcoding concrete classes into callers.
 */

import { AdProvider } from './AdProvider.js';
import { ProviderId } from './types.js';

class ProviderRegistry {
  private providers = new Map<ProviderId, AdProvider>();

  public registerProvider(provider: AdProvider): void {
    if (!provider || !provider.providerId) {
      throw new Error('Cannot register invalid AdProvider: missing providerId.');
    }
    this.providers.set(provider.providerId, provider);
  }

  public getProvider(providerId: ProviderId = 'META'): AdProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`AdProvider '${providerId}' is not registered in ENCHO Provider Registry.`);
    }
    return provider;
  }

  public hasProvider(providerId: ProviderId): boolean {
    return this.providers.has(providerId);
  }

  public listProviders(): ProviderId[] {
    return Array.from(this.providers.keys());
  }
}

export const providerRegistry = new ProviderRegistry();

