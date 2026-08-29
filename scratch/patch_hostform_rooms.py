import re

with open('components/HostForm.tsx', 'r') as f:
    content = f.read()

default_rooms = """existingListing?.rooms && existingListing.rooms.length > 0 
      ? existingListing.rooms.map((room: any) => ({
      ...room,
      photos: room.imageUrls ? room.imageUrls.map((url: string) => ({
        id: Math.random().toString(36).substring(2, 9),
        previewUrl: url
      })) : []
    })) 
      : [
          { id: 'suites', name: 'Presidential Panorama Suite', type: 'suites', price: 18500, capacity: 2, inventory_count: 1, features: ['1,200 sq.ft', '270° Valley View', 'Heated Jacuzzi'], amenities: [] },
          { id: 'deluxe', name: 'Deluxe Garden Double Room', type: 'deluxe', price: 11500, capacity: 2, inventory_count: 2, features: ['650 sq.ft', 'Garden Verandah', 'Twin Plush Beds'], amenities: [] },
          { id: 'executive', name: 'Executive Studio Sanctuary', type: 'executive', price: 7500, capacity: 1, inventory_count: 1, features: ['420 sq.ft', 'Ergonomic Work Enclave', 'Rain Shower'], amenities: [] }
        ]"""

# Replace the rooms initialization
pattern = r'rooms: existingListing\?\.rooms\?\.map\(\(room: any\) => \(\{\n\s*\.\.\.room,\n\s*photos: room\.imageUrls \? room\.imageUrls\.map\(\(url: string\) => \(\{\n\s*id: Math\.random\(\)\.toString\(36\)\.substring\(2, 9\),\n\s*previewUrl: url\n\s*\}\)\) : \[\]\n\s*\}\)\) \|\| \(\[\] as any\[\]\),'

if re.search(pattern, content):
    content = re.sub(pattern, f"rooms: {default_rooms},", content)
    with open('components/HostForm.tsx', 'w') as f:
        f.write(content)
    print("Patched HostForm rooms initialization")
else:
    print("Could not find pattern")
