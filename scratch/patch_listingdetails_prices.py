import re

with open('components/ListingDetailsNew.tsx', 'r') as f:
    content = f.read()

# Replace the fake pricing math with reading from listing.rooms
pattern = r'const calculatePrice = \(\) => \{\n\s*if \(!listing \|\| !listing\.price\) return 0;\n\s*if \(selectedRoomTier === \'suites\'\) return Math\.round\(listing\.price \* 1\.35\);\n\s*if \(selectedRoomTier === \'executive\'\) return Math\.round\(listing\.price \* 0\.65\);\n\s*return listing\.price;\n\s*\};'

new_calc = """const calculatePrice = () => {
    if (!listing || !listing.price) return 0;
    
    // PHASE D: REAL DB PRICING INSTEAD OF FAKE MULTIPLIERS
    if (listing.rooms && Array.isArray(listing.rooms) && listing.rooms.length > 0) {
      const room = listing.rooms.find(r => r.id === selectedRoomTier || r.type === selectedRoomTier || r.name.toLowerCase().includes(selectedRoomTier));
      if (room && room.price) {
         return room.price;
      }
    }

    if (selectedRoomTier === 'suites') return Math.round(listing.price * 1.35);
    if (selectedRoomTier === 'executive') return Math.round(listing.price * 0.65);
    return listing.price;
  };"""

content = re.sub(pattern, new_calc, content)

with open('components/ListingDetailsNew.tsx', 'w') as f:
    f.write(content)
print("Patched ListingDetailsNew for real DB pricing")
