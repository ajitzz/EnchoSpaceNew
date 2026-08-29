import re

with open('types.ts', 'r') as f:
    content = f.read()

# Update SpatialPhoto category
pattern = r"category: 'living_room' \| 'dining' \| 'bedroom' \| 'bathroom' \| 'garden' \| 'exterior' \| 'pool' \| 'details' \| 'other';"
new = "category: 'living_room' | 'dining' | 'bedroom' | 'bathroom' | 'garden' | 'exterior' | 'pool' | 'details' | 'other' | 'property' | 'suites' | 'deluxe' | 'executive';"
content = content.replace(pattern, new)

# Add photos to Room
pattern2 = r"inventory_count\?: number; // Number of available units for this specific room type\n  tiers\?: RoomTier\[\]; // Pricing tiers\n\}"
new2 = "inventory_count?: number; // Number of available units for this specific room type\n  tiers?: RoomTier[]; // Pricing tiers\n  photos?: SpatialPhoto[];\n  type?: string;\n}"
content = re.sub(pattern2, new2, content)


with open('types.ts', 'w') as f:
    f.write(content)
print("Patched types.ts")
