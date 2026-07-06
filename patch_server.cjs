const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');
const searchStr = `    try {
      const listingRes = await pool.query('SELECT title, user_id FROM listings WHERE id = $1', [listingId]);
      if (listingRes.rows.length > 0) {
          listingTitle = listingRes.rows[0].title;
          hostId = listingRes.rows[0].user_id;
      }
    } catch(e) { console.error(e); }`;

const replaceStr = `    try {
      const listingRes = await pool.query('SELECT title, user_id, rooms FROM listings WHERE id = $1', [listingId]);
      if (listingRes.rows.length > 0) {
          listingTitle = listingRes.rows[0].title;
          hostId = listingRes.rows[0].user_id;

          // Resort Plus: Inventory Deduction Logic
          let rooms = listingRes.rows[0].rooms;
          let isUpdated = false;
          
          if (roomId && rooms && Array.isArray(rooms)) {
             rooms = rooms.map((room: any) => {
                if (room.id === roomId && room.inventory_count !== undefined) {
                   if (room.inventory_count > 0) {
                       room.inventory_count -= 1;
                       isUpdated = true;
                   }
                }
                return room;
             });
          }

          if (isUpdated) {
             await pool.query('UPDATE listings SET rooms = $1::jsonb WHERE id = $2', [JSON.stringify(rooms), listingId]);
          }
      }
    } catch(e) { console.error(e); }`;

if (code.includes(searchStr)) {
    code = code.replace(searchStr, replaceStr);
    fs.writeFileSync('server.ts', code);
    console.log('Successfully patched server.ts!');
} else {
    console.log('Could not find target string in server.ts.');
}
