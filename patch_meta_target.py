import re

with open('server.ts', 'r') as f:
    code = f.read()

# We want to find the section defining targetCountries and adsetSpecifications
target_logic = """
    const targetCountries = ['US', 'IN', 'GB', 'AE'];
    if (campaign.target_locations && typeof campaign.target_locations === 'string') {
      const locUpper = campaign.target_locations.toUpperCase();
      if (locUpper.includes('UK') || locUpper.includes('LONDON')) targetCountries.push('GB');
      if (locUpper.includes('UAE') || locUpper.includes('DUBAI')) targetCountries.push('AE');
      if (locUpper.includes('CANADA') || locUpper.includes('TORONTO')) targetCountries.push('CA');
    }

    const persona = campaign.target_audience_persona || 'couples';
"""

new_target_logic = """
    const targetCountries = ['US', 'IN', 'GB', 'AE'];
    let customLocations = [];
    if (campaign.target_locations_json) {
      try {
        const parsedLocs = typeof campaign.target_locations_json === 'string' ? JSON.parse(campaign.target_locations_json) : campaign.target_locations_json;
        if (Array.isArray(parsedLocs)) {
          customLocations = parsedLocs.map(loc => ({
            latitude: loc.lat,
            longitude: loc.lng,
            radius: Math.max(loc.radius || 25, 25), // Meta Housing enforces min 15mi/25km
            distance_unit: 'kilometer'
          })).filter(loc => loc.latitude && loc.longitude);
        }
      } catch (e) {
        console.error('Failed to parse target_locations_json:', e);
      }
    } else if (campaign.target_locations && typeof campaign.target_locations === 'string') {
      const locUpper = campaign.target_locations.toUpperCase();
      if (locUpper.includes('UK') || locUpper.includes('LONDON')) targetCountries.push('GB');
      if (locUpper.includes('UAE') || locUpper.includes('DUBAI')) targetCountries.push('AE');
      if (locUpper.includes('CANADA') || locUpper.includes('TORONTO')) targetCountries.push('CA');
    }

    const geoLocationsPayload = customLocations.length > 0 ? {
      custom_locations: customLocations,
      location_types: ['home', 'recent'],
      housing_category_rule: 'Meta HOUSING SAC rules enforce min 25km radius around target city centres'
    } : {
      countries: Array.from(new Set(targetCountries)),
      geo_radius_km: 25,
      housing_category_rule: 'Meta HOUSING SAC rules enforce min 25km radius around target city centres'
    };

    const persona = campaign.target_audience_persona || 'couples';
"""

if target_logic.strip() in code:
    code = code.replace(target_logic.strip(), new_target_logic.strip())
    print("Replaced target logic.")

adset_targeting_old = """
        geo_locations: { 
           countries: Array.from(new Set(targetCountries)),
          geo_radius_km: 25,
          housing_category_rule: 'Meta HOUSING SAC rules enforce min 25km radius around target city centres'
        },
"""
adset_targeting_new = """
        geo_locations: geoLocationsPayload,
"""

if adset_targeting_old.strip() in code:
    code = code.replace(adset_targeting_old.strip(), adset_targeting_new.strip())
    print("Replaced adset targeting 1.")

adset_targeting_old2 = """
            geo_locations: { 
               countries: Array.from(new Set(targetCountries)),
              location_types: ['home', 'recent']
            },
"""
if adset_targeting_old2.strip() in code:
    code = code.replace(adset_targeting_old2.strip(), adset_targeting_new.strip())
    print("Replaced adset targeting 2.")

with open('server.ts', 'w') as f:
    f.write(code)
