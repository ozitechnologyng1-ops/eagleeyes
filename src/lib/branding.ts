/**
 * branding.ts - Dynamic Multi-Tenant Branding Engine
 *
 * Configures the platform identity, titles, and logos dynamically based on:
 * 1. Environment variable override: VITE_CLIENT_BRAND (e.g. 'ogun' or 'lagos')
 * 2. Hostname/Domain detection:
 *    - ogunadc.com / ogun.* / *.ogunadc.* -> Ogun ADC 2027
 *    - lagos.* / lagosadc.* -> Lagos 2027
 *    - default -> EagleEye 2027
 */

export interface BrandConfig {
  id: 'ogun' | 'lagos' | 'default';
  appName: string;
  subtitle: string;
  fullTitle: string;
  logoUrl?: string; // Optional custom logo image URL
  shortCode: string;
  metaDescription: string;
}

const BRANDS: Record<string, BrandConfig> = {
  ogun: {
    id: 'ogun',
    appName: 'Ogun 2027',
    subtitle: 'Ogun ADC Secure Election Management System',
    fullTitle: 'Ogun 2027 | Ogun ADC Secure Election Management System',
    logoUrl: '/brands/ogun-jal-2027.png',
    shortCode: 'OG',
    metaDescription: 'Ogun ADC High-Fidelity Multi-Tiered Election Management System for real-time result collation and voter canvassing.'
  },
  lagos: {
    id: 'lagos',
    appName: 'Lagos 2027',
    subtitle: 'Lagos ADC Secure Election Management System',
    fullTitle: 'Lagos 2027 | Lagos ADC Secure Election Management System',
    shortCode: 'LG',
    metaDescription: 'Lagos ADC High-Fidelity Multi-Tiered Election Management System for real-time result collation and voter canvassing.'
  },
  default: {
    id: 'default',
    appName: 'EagleEye 2027',
    subtitle: 'Secure Election Management System',
    fullTitle: 'EagleEye 2027 | Election Management System',
    shortCode: 'EE',
    metaDescription: 'High-fidelity, interactive multi-tiered election management system for real-time result collation and voter canvassing.'
  }
};

export function getBrandConfig(): BrandConfig {
  // 1. Check explicit environment variable (VITE_CLIENT_BRAND=ogun or VITE_CLIENT_BRAND=lagos)
  const envBrand = (import.meta.env.VITE_CLIENT_BRAND as string | undefined)?.toLowerCase().trim();
  if (envBrand && BRANDS[envBrand]) {
    return BRANDS[envBrand];
  }

  // 2. Check hostname / domain
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname.toLowerCase();
    
    // Ogun domain matches (e.g., ogunadc.com, ogun.domain.com, ogun-election.com)
    if (
      hostname.includes('ogunadc.com') || 
      hostname.includes('ogun')
    ) {
      return BRANDS.ogun;
    }

    // Lagos domain matches (e.g., lagosadc.com, lagos.domain.com)
    if (
      hostname.includes('lagosadc.com') ||
      hostname.includes('lagos')
    ) {
      return BRANDS.lagos;
    }
  }

  return BRANDS.default;
}
