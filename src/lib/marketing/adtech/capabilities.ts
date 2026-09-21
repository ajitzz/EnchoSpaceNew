import type {AdtechProfile} from './contracts.js';
import {MarketingError} from '../domain.js';

// Executable adapter capabilities, not editable business presets or provider acceptance claims.
export const adtechCapabilities = {
  contract: 'ADTECH_V1',
  META: {apiVersion: 'v26.0', geography: ['PROVIDER_CITY_RADIUS', 'COORDINATE_RADIUS', 'PROVIDER_REGION_EXCLUSION'],
    accountValidationRequired: true, residentsOnly: false, instantForms: false, advantagePlusWithoutAudienceNetwork: false},
  GOOGLE: {apiVersion: 'v25', geography: ['PROVIDER_CITY_RADIUS', 'COORDINATE_RADIUS', 'PROVIDER_REGION_EXCLUSION'],
    targetCpa: true, negativeKeywords: ['EXACT', 'PHRASE'], accountValidationRequired: true},
} as const;

export function strategyCapabilityIssues(profile: AdtechProfile, provider: 'META'|'GOOGLE'): string[] {
  if (provider === 'GOOGLE') return [];
  const errors: string[] = [];
  if (profile.meta.objective !== 'OUTCOME_SALES' || profile.meta.conversionEvent !== 'PURCHASE') errors.push('LEAD_CONVERSION_AUTHORITY_REQUIRED');
  if (profile.meta.placementMode !== 'MANUAL') errors.push('ADVANTAGE_PLUS_AUDIENCE_NETWORK_EXCLUSION_UNVERIFIED');
  if (profile.meta.specialAdCategories.includes('HOUSING') && (profile.meta.ageMin !== 18 || profile.meta.ageMax !== 65 || profile.meta.genders.length)) errors.push('SPECIAL_CATEGORY_DEMOGRAPHICS_UNSUPPORTED');
  return errors;
}
export function assertStrategyCapabilities(profile: AdtechProfile, provider: 'META'|'GOOGLE') {
  const issues = strategyCapabilityIssues(profile, provider);
  if (issues.length) throw new MarketingError('TARGETING_CAPABILITY_UNSUPPORTED', `This strategy cannot publish: ${issues.join(', ')}.`, 422);
}
