const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  `          targeting: {
            age_min: 18,
            age_max: 65,
            genders: [1, 2],
            geo_locations: { 
              countries: Array.from(new Set(targetCountries)),
              location_types: ['home', 'recent']
            },
            publisher_platforms: ['facebook', 'instagram'],
            facebook_positions: ['feed', 'story'],
            instagram_positions: ['stream', 'story'],
            flexible_spec: [{ interests: defaultInterests }]
          }`,
  `          targeting: adsetSpecifications.targeting`
);

fs.writeFileSync('server.ts', code);
console.log("Fixed adset targeting payload.");
