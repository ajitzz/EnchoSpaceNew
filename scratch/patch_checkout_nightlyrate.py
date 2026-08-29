import re

with open('components/CheckoutPage.tsx', 'r') as f:
    content = f.read()

pattern = r'const nightlyRate = useMemo\(\(\) => \{\n\s*if \(isExperience\) return experience\?\.price \|\| 0;\n\s*if \(listing\?\.currency === \'USD\'\) return tierMeta\.priceUsd;\n\s*if \(listing\?\.price && listing\.price > 1000\) \{\n\s*if \(activeRoomTier === \'suites\'\) return Math\.round\(listing\.price \* 1\.35\);\n\s*if \(activeRoomTier === \'executive\'\) return Math\.round\(listing\.price \* 0\.65\);\n\s*return listing\.price;\n\s*\}\n\s*return tierMeta\.price;\n\s*\}, \[isExperience, experience, listing, activeRoomTier, tierMeta\]\);'

new_calc = """const nightlyRate = useMemo(() => {
    if (isExperience) return experience?.price || 0;
    
    // CMS Phase F: True Database Room Pricing
    if (listing?.rooms && Array.isArray(listing.rooms) && listing.rooms.length > 0) {
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
  }, [isExperience, experience, listing, activeRoomTier, tierMeta]);"""

if re.search(pattern, content):
    content = re.sub(pattern, new_calc, content)
    with open('components/CheckoutPage.tsx', 'w') as f:
        f.write(content)
    print("Patched nightlyRate")
else:
    print("Could not find nightlyRate pattern")
