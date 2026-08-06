const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Find the hardcoded Ad Set creation in dispatchMetaCampaign
// Let's replace the hardcoded targeting with the adsetSpecifications.targeting that we built.

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
            instagram_positions: ['stream', 'story']
          }`,
  `          targeting: adsetSpecifications.targeting`
);

// We also need to fix how interests are formatted in adsetSpecifications.targeting.
// Meta API expects: "flexible_spec": [ { "interests": [ {id: "...", name: "..."} ] } ]
// Let's fix the targeting object generation.
code = code.replace(
  `        interests: targetInterests.map(i => i.name)`,
  `        flexible_spec: [{ interests: targetInterests }]`
);

fs.writeFileSync('server.ts', code);
console.log("Fixed adset targeting payload.");
