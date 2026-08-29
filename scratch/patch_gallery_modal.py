import re

with open('components/SanctuaryGalleryModal.tsx', 'r') as f:
    content = f.read()

# Replace GalleryCategoryKey
new_key_def = """export type GalleryCategoryKey = 
  | 'all'
  | 'property'
  | 'suites'
  | 'deluxe'
  | 'executive';"""
content = re.sub(r"export type GalleryCategoryKey =[\s\S]*?\| 'details';", new_key_def, content)


# Replace GALLERY_CATEGORIES
new_categories = """export const GALLERY_CATEGORIES: CategoryConfig[] = [
  {
    key: 'all',
    label: 'All Spaces',
    shortLabel: 'All',
    icon: '✨',
    headline: 'Complete Sanctuary Panorama',
    description: 'A curated visual journey through every architectural zone and living space.'
  },
  {
    key: 'property',
    label: 'Property & Amenities',
    shortLabel: 'Amenities',
    icon: '🏊',
    headline: 'Sanctuary Grounds & Wellness',
    description: 'Horizon infinity pools, architectural facades, and Zen meditation gardens.'
  },
  {
    key: 'suites',
    label: 'Presidential Suites',
    shortLabel: 'Suites',
    icon: '👑',
    headline: 'Presidential Panorama Suites',
    description: 'Double-height acoustic glazing framing natural ridge views, sunken fireside lounges, and warm 2700K ambient architectural illumination.'
  },
  {
    key: 'deluxe',
    label: 'Deluxe Rooms',
    shortLabel: 'Deluxe',
    icon: '🛏️',
    headline: 'Deluxe Garden Sanctuaries',
    description: 'Organic Belgian linen bedding, private sunrise balconies, acoustically isolated timber walls, and seamless integrated wardrobe suites.'
  },
  {
    key: 'executive',
    label: 'Executive Studios',
    shortLabel: 'Executive',
    icon: '💻',
    headline: 'Executive Work & Rest Enclaves',
    description: 'Ergonomic architectural workstations, high-speed fiber connectivity, and dedicated twilight reading nooks.'
  }
];"""
content = re.sub(r"export const GALLERY_CATEGORIES: CategoryConfig\[\] = \[(?:[^\]]+)\];", new_categories, content)

# Now rewrite classifyListingPhotos to use these new categories
new_classify = """export function classifyListingPhotos(listing: Listing): SpatialPhoto[] {
  const result: SpatialPhoto[] = [];
  
  // 1. If listing has rooms with photos, use those for the room tiers!
  if (listing.rooms && Array.isArray(listing.rooms)) {
     listing.rooms.forEach(room => {
       if (room.photos && Array.isArray(room.photos)) {
          room.photos.forEach((photo: any, idx: number) => {
             result.push({
               id: `${room.id}-photo-${idx}`,
               url: photo.previewUrl || photo.url || photo,
               category: (room.type as any) || 'suites',
               categoryLabel: room.name,
               title: photo.title || `${room.name} Feature`,
               description: photo.description || '',
               specs: room.features?.join(' · ') || '',
               lightingTime: photo.lightingTime || '',
               isHero: photo.isHero || false
             });
          });
       }
     });
  }

  // 2. If listing.photos has property photos, map them
  if (listing.photos && listing.photos.length > 0) {
    listing.photos.forEach((photo: any, idx: number) => {
       // Only add if we didn't already process it, or just map legacy categories to 'property'
       const cat = (['exterior', 'pool', 'garden', 'living_room', 'dining', 'bathroom'].includes(photo.category)) ? 'property' : 'suites';
       result.push({
         ...photo,
         category: cat,
         categoryLabel: GALLERY_CATEGORIES.find(c => c.key === cat)?.label || 'Space',
       });
    });
  }

  // 3. Fallback: if result is empty, map the raw URLs
  if (result.length === 0) {
    const rawUrls: string[] = [];
    if (listing.imageUrl) rawUrls.push(listing.imageUrl);
    if (listing.imageUrls && Array.isArray(listing.imageUrls)) {
      listing.imageUrls.forEach(url => {
        if (url && !rawUrls.includes(url)) rawUrls.push(url);
      });
    }

    const categorySequence: {
      category: GalleryCategoryKey;
      title: string;
      description: string;
      specs: string;
      lightingTime: string;
    }[] = [
      {
        category: 'property',
        title: 'Architectural Arrival & Sanctuary Facade',
        description: 'Monolithic clean lines and natural timber louvers framing the dramatic landscape entry.',
        specs: 'Gated Private Compound · Mountain Ridge View',
        lightingTime: 'Golden Hour · 6:15 PM'
      },
      {
        category: 'suites',
        title: 'Presidential Master Suite & Sunrise Terrace',
        description: 'King-sized organic plush mattress dressed in Italian sateen linens with direct eastern sunrise exposure.',
        specs: '1,250 sqft · King Bed · Acoustically Isolated Walls',
        lightingTime: 'Morning Glow · 7:00 AM'
      },
      {
        category: 'deluxe',
        title: 'Deluxe Garden Double Room',
        description: 'Freestanding volcanic stone soak tub overlooking private bamboo courtyard with rainfall shower enclave.',
        specs: 'Heated Marble Floors · Rainfall Shower · Aesop Botanicals',
        lightingTime: 'Diffused Daylight · 11:00 AM'
      },
      {
        category: 'executive',
        title: 'Executive Work Sanctuary',
        description: 'Handcrafted live-edge walnut desk, high-speed fiber connectivity, and dedicated twilight reading nooks.',
        specs: 'Ergonomic Setup · High-Speed WiFi',
        lightingTime: 'Afternoon Sunlight · 3:30 PM'
      }
    ];

    rawUrls.forEach((url, idx) => {
      const template = categorySequence[idx % categorySequence.length];
      result.push({
        id: `${listing.id}-spatial-photo-${idx}`,
        url,
        category: template.category as any,
        categoryLabel: GALLERY_CATEGORIES.find(c => c.key === template.category)?.label,
        title: idx < categorySequence.length ? template.title : `${template.title} (Perspective ${Math.floor(idx / categorySequence.length) + 1})`,
        description: template.description,
        specs: template.specs,
        lightingTime: template.lightingTime,
        isHero: idx === 0
      });
    });
  }

  return result;
}"""

# Using regex to replace the whole classifyListingPhotos function
content = re.sub(r'export function classifyListingPhotos[\s\S]*?return rawUrls\.map\([\s\S]*?\}\);\n\}', new_classify, content)

with open('components/SanctuaryGalleryModal.tsx', 'w') as f:
    f.write(content)
print("Patched SanctuaryGalleryModal")
