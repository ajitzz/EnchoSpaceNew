const fs = require('fs');

// Patch App.tsx
let appCode = fs.readFileSync('App.tsx', 'utf-8');
appCode = appCode.replace(
`interface BookingData {
    moveInDate: string;
    configuration: string;
    name: string;
    phone: string;
    totalRent: number;
}`,
`interface BookingData {
    moveInDate: string;
    configuration: string;
    name: string;
    phone: string;
    totalRent: number;
    roomIds?: string[];
}`
);

const oldPayload = `        const payload = {
            listingId: selectedListing.originalId || selectedListing.id,
            roomId: selectedListing.selectedConfigId || (selectedListing.originalId ? selectedListing.id : undefined),
            moveInDate: data.moveInDate,
            configuration: data.configuration,
            name: data.name,
            phone: data.phone,
            totalRent: data.totalRent,
            userId: user?.id,
            offlineId: crypto.randomUUID?.() || Math.random().toString(),
        };`;

const newPayload = `        const payload = {
            listingId: selectedListing.originalId || selectedListing.id,
            roomId: data.roomIds ? data.roomIds.join(',') : (selectedListing.selectedConfigId || (selectedListing.originalId ? selectedListing.id : undefined)),
            moveInDate: data.moveInDate,
            configuration: data.configuration,
            name: data.name,
            phone: data.phone,
            totalRent: data.totalRent,
            userId: user?.id,
            offlineId: crypto.randomUUID?.() || Math.random().toString(),
        };`;
        
appCode = appCode.replace(oldPayload, newPayload);
fs.writeFileSync('App.tsx', appCode);

// Patch ListingDetails.tsx
let listingCode = fs.readFileSync('components/ListingDetails.tsx', 'utf-8');
const oldFinish = `  const finishBooking = () => {
      setIsCheckoutOpen(false);
      if (onBook) {
          const maintenanceFee = Math.round(currentDayPrice * 0.10);
          onBook({
              moveInDate,
              configuration: activeConfig.label,
              name: guestName,
              phone: guestPhone,
              totalRent: currentDayPrice + maintenanceFee
          });
      }
  };`;
  
const newFinish = `  const finishBooking = () => {
      setIsCheckoutOpen(false);
      if (onBook) {
          const maintenanceFee = Math.round(currentDayPrice * 0.10);
          onBook({
              moveInDate,
              configuration: activeConfig.label,
              name: guestName,
              phone: guestPhone,
              totalRent: currentDayPrice + maintenanceFee,
              roomIds: selectedConfigIds.filter(id => id !== 'entire_place')
          });
      }
  };`;
listingCode = listingCode.replace(oldFinish, newFinish);
fs.writeFileSync('components/ListingDetails.tsx', listingCode);

// Patch server.ts
let serverCode = fs.readFileSync('server.ts', 'utf-8');
const oldDeduction = `          if (roomId && rooms && Array.isArray(rooms)) {
             rooms = rooms.map((room: any) => {
                if (room.id === roomId && room.inventory_count !== undefined) {
                   if (room.inventory_count > 0) {
                       room.inventory_count -= 1;
                       isUpdated = true;
                   }
                }
                return room;
             });
          }`;
const newDeduction = `          if (roomId && rooms && Array.isArray(rooms)) {
             const selectedIds = String(roomId).split(',');
             rooms = rooms.map((room: any) => {
                if (selectedIds.includes(room.id) && room.inventory_count !== undefined) {
                   if (room.inventory_count > 0) {
                       room.inventory_count -= 1;
                       isUpdated = true;
                   }
                }
                return room;
             });
          }`;
serverCode = serverCode.replace(oldDeduction, newDeduction);
fs.writeFileSync('server.ts', serverCode);

console.log('Successfully patched App.tsx, ListingDetails.tsx and server.ts!');
