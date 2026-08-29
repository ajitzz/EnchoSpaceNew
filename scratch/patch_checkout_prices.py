import re

with open('components/CheckoutPage.tsx', 'r') as f:
    content = f.read()

# Replace getRoomTierPrice
pattern = r'const getRoomTierPrice = \(\) => \{\n\s*if \(!listing \|\| !listing\.price\) return 0;\n\s*if \(listing\?\.currency === \'USD\'\) return tierMeta\.priceUsd;\n\s*if \(listing\?\.price && listing\.price > 1000\) \{\n\s*if \(activeRoomTier === \'suites\'\) return Math\.round\(listing\.price \* 1\.35\);\n\s*if \(activeRoomTier === \'executive\'\) return Math\.round\(listing\.price \* 0\.65\);\n\s*return listing\.price;\n\s*\}\n\s*return tierMeta\.price;\n\s*\};'

new_calc = """const getRoomTierPrice = () => {
    if (!listing || !listing.price) return 0;
    
    // CMS Phase F: True Database Room Pricing
    if (listing.rooms && Array.isArray(listing.rooms) && listing.rooms.length > 0) {
      const room = listing.rooms.find((r: any) => r.id === activeRoomTier || r.type === activeRoomTier || r.name.toLowerCase().includes(activeRoomTier));
      if (room && room.price) {
         return room.price;
      }
    }

    if (listing?.currency === 'USD') return tierMeta.priceUsd;
    if (listing?.price && listing.price > 1000) {
      if (activeRoomTier === 'suites') return Math.round(listing.price * 1.35);
      if (activeRoomTier === 'executive') return Math.round(listing.price * 0.65);
      return listing.price;
    }
    return tierMeta.price;
  };"""

if re.search(pattern, content):
    content = re.sub(pattern, new_calc, content)
else:
    print("Could not find getRoomTierPrice pattern")

# Replace tRate mapping in render
tRate_pattern = r'const tRate = listing\?\.currency === \'USD\' \? t\.priceUsd : \(listing\?\.price && listing\.price > 1000 \? \(tierKey === \'suites\' \? Math\.round\(listing\.price \* 1\.35\) : tierKey === \'executive\' \? Math\.round\(listing\.price \* 0\.65\) : listing\.price\) : t\.price\);'

tRate_new = """let tRate = t.price;
                    if (listing?.rooms && Array.isArray(listing.rooms) && listing.rooms.length > 0) {
                      const room = listing.rooms.find((r: any) => r.id === tierKey || r.type === tierKey || r.name.toLowerCase().includes(tierKey));
                      if (room && room.price) tRate = room.price;
                    } else if (listing?.currency === 'USD') {
                      tRate = t.priceUsd;
                    } else if (listing?.price && listing.price > 1000) {
                      tRate = tierKey === 'suites' ? Math.round(listing.price * 1.35) : tierKey === 'executive' ? Math.round(listing.price * 0.65) : listing.price;
                    }"""

if re.search(tRate_pattern, content):
    content = re.sub(tRate_pattern, tRate_new, content)
else:
    print("Could not find tRate pattern")


with open('components/CheckoutPage.tsx', 'w') as f:
    f.write(content)
print("Patched CheckoutPage pricing")
