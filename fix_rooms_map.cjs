const fs = require('fs');
let file = fs.readFileSync('components/ListingDetails.tsx', 'utf-8');

const startIndex = file.indexOf('{listing.rooms.map((room, idx) => {');
if (startIndex !== -1) {
    const endStr = ')}';
    let currentIndex = startIndex;
    
    // find the end of the map function
    const mapEndStr = "                            )})}";
    const endIndex = file.indexOf(mapEndStr, startIndex);
    
    if (endIndex !== -1) {
        const toReplace = file.substring(startIndex, endIndex + mapEndStr.length);
        const replacement = `{listing.rooms.map((room, idx) => {
                                const isRoomSelected = selectedConfigIds.includes(room.id);
                                return (
                                    <PremiumInventoryUnitCard 
                                        key={room.id || idx} 
                                        room={room} 
                                        listing={listing} 
                                        isSelected={isRoomSelected} 
                                        toggleSelection={() => toggleConfigSelection(room.id, listing.rooms?.map(r => r.id) || [])}
                                        formatPrice={formatPrice}
                                    />
                                );
                            })}`;
        
        file = file.replace(toReplace, replacement);
        fs.writeFileSync('components/ListingDetails.tsx', file);
        console.log('Replaced rooms map successfully.');
    } else {
        console.log('Could not find end of rooms map.');
    }
} else {
    console.log('Could not find start of rooms map.');
}
