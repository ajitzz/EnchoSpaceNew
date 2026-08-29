import re

with open('types.ts', 'r') as f:
    content = f.read()

# Replace SpatialPhoto interface
pattern = r"export interface SpatialPhoto \{[\s\S]*?\n\}"
new_interface = """export interface SpatialPhoto {
  id: string;
  url: string;
  tier: 'common' | 'suites' | 'deluxe' | 'executive';
  category: 'living_room' | 'dining' | 'bedroom' | 'bathroom' | 'garden' | 'exterior' | 'pool' | 'details' | 'balcony' | 'parking' | 'other';
  categoryLabel?: string;
  title: string;
  description: string;
  specs?: string;
  lightingTime?: string;
  isHero?: boolean;
}"""

content = re.sub(pattern, new_interface, content)

with open('types.ts', 'w') as f:
    f.write(content)
print("Updated types.ts")
