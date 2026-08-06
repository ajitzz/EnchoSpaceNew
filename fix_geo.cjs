const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  `    const geoLocationsPayload = customLocations.length > 0 ? {
      custom_locations: customLocations,
      location_types: ['home', 'recent'],
      housing_category_rule: 'Meta HOUSING SAC rules enforce min 25km radius around target city centres'
    } : {
      countries: Array.from(new Set(targetCountries)),
      geo_radius_km: 25,
      housing_category_rule: 'Meta HOUSING SAC rules enforce min 25km radius around target city centres'
    };`,
  `    const geoLocationsPayload = customLocations.length > 0 ? {
      custom_locations: customLocations,
      location_types: ['home', 'recent']
    } : {
      countries: Array.from(new Set(targetCountries))
    };`
);

code = code.replace(
  `        age_range_note: '18-65+ (Meta HOUSING Special Category Mandatory Bound)',
        gender_note: 'All Genders (Meta HOUSING Special Category Non-Discrimination Mandate)',`,
  ``
);

fs.writeFileSync('server.ts', code);
console.log("Fixed targeting fields to remove dummy comment fields.");
