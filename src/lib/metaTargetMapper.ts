export class MetaTargetMapper {
  // Common coordinates database for zero-latency lookup of popular feeder locations
  static knownLocations: Record<string, { lat: number; lng: number }> = {
    'mumbai': { lat: 19.0760, lng: 72.8777 },
    'delhi': { lat: 28.7041, lng: 77.1025 },
    'bangalore': { lat: 12.9716, lng: 77.5946 },
    'bengaluru': { lat: 12.9716, lng: 77.5946 },
    'hyderabad': { lat: 17.3850, lng: 78.4867 },
    'chennai': { lat: 13.0827, lng: 80.2707 },
    'pune': { lat: 18.5204, lng: 73.8567 },
    'new york': { lat: 40.7128, lng: -74.0060 },
    'los angeles': { lat: 34.0522, lng: -118.2437 },
    'san francisco': { lat: 37.7749, lng: -122.4194 },
    'london': { lat: 51.5074, lng: -0.1278 },
    'dubai': { lat: 25.2048, lng: 55.2708 },
    'singapore': { lat: 1.3521, lng: 103.8198 },
    'sydney': { lat: -33.8688, lng: 151.2093 }
  };

  // Maps amenities to Meta Interest IDs (mock IDs based on actual Meta structure)
  static amenityToInterestId: Record<string, { id: string; name: string }> = {
    'Wifi': { id: '6003180424072', name: 'Digital nomad' },
    'Pool': { id: '6003294371904', name: 'Luxury Resorts' },
    'Hot tub': { id: '6002986422304', name: 'Travel & Leisure' },
    'Kitchen': { id: '6003107053572', name: 'Cooking' },
    'Gym': { id: '6003006240072', name: 'Physical fitness' },
    'Parking': { id: '6003155793072', name: 'Road trip' },
    'Beachfront': { id: '6003212130372', name: 'Beach resort' }
  };

  static mapTargeting(campaign: any, listing: any) {
    const targeting: any = {};
    
    // 1. Process Geo Locations
    const radiusKm = Math.max(25, Number(campaign.target_radius_km) || 50); // Enforce HOUSING 25km min
    const customLocations: any[] = [];

    let parsedLocationsJson: any[] = [];
    if (typeof campaign.target_locations_json === 'string') {
        try { parsedLocationsJson = JSON.parse(campaign.target_locations_json); } catch (e) { console.error(e); }
    } else if (Array.isArray(campaign.target_locations_json)) {
        parsedLocationsJson = campaign.target_locations_json;
    }

    // Attempt to extract lat/lng from structured json if valid
    for (const loc of parsedLocationsJson) {
        if (loc && loc.lat && loc.lng) {
            customLocations.push({
                latitude: Number(loc.lat),
                longitude: Number(loc.lng),
                radius: radiusKm,
                distance_unit: 'kilometer'
            });
        }
    }

    // Fallback to text matching if structured JSON lacks lat/lng (e.g. backend just split strings)
    if (customLocations.length === 0) {
        const locationsRaw = campaign.target_locations || '';
        const locationNames = locationsRaw.split(',').map((l: string) => l.trim().toLowerCase()).filter(Boolean);
        
        for (const loc of locationNames) {
            if (this.knownLocations[loc]) {
                customLocations.push({
                    latitude: this.knownLocations[loc].lat,
                    longitude: this.knownLocations[loc].lng,
                    radius: radiusKm,
                    distance_unit: 'kilometer'
                });
            }
        }
    }
    
    if (customLocations.length > 0) {
      targeting.geo_locations = {
        custom_locations: customLocations
      };
    } else {
      // Fallback to Country Targeting if no known locations
      targeting.geo_locations = {
        countries: ['US', 'IN']
      };
    }

    // 2. Process Flexible Spec (Interests based on amenities & personas)
    const interests: any[] = [];
    
    // Map property amenities
    const amenities = listing.listing_amenities || listing.amenities;
    if (amenities && Array.isArray(amenities)) {
      for (const amenity of amenities) {
        if (this.amenityToInterestId[amenity]) {
          interests.push(this.amenityToInterestId[amenity]);
        }
      }
    }

    // Map Personas (audience_interests)
    let personas = [];
    if (typeof campaign.audience_interests === 'string') {
      try {
        personas = JSON.parse(campaign.audience_interests);
      } catch (e) { /* ignore */ }
    } else if (Array.isArray(campaign.audience_interests)) {
      personas = campaign.audience_interests;
    }
    
    if (campaign.target_audience_persona && !personas.includes(campaign.target_audience_persona)) {
        personas.push(campaign.target_audience_persona);
    }
    
    for (const persona of personas) {
      if (persona.includes('couples')) {
        interests.push({ id: '6003310069672', name: 'Couples' });
      }
      if (persona.includes('families')) {
        interests.push({ id: '6003178044772', name: 'Family vacations' });
      }
      if (persona.includes('friends')) {
        interests.push({ id: '6003254924472', name: 'Friendship' });
      }
      if (persona.includes('digital_nomads')) {
        interests.push({ id: '6003180424072', name: 'Digital nomad' });
      }
    }
    
    // Deduplicate interests
    const uniqueInterests = Array.from(new Map(interests.map(item => [item.id, item])).values());
    
    // DELIBERATELY OMITTING flexible_spec (interests) for HOUSING compliance & preventing mock ID errors.
    
    return targeting;
  }
}
