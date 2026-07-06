const fs = require('fs');

// 1. Patch types.ts
let types = fs.readFileSync('types.ts', 'utf-8');
if (!types.includes('bedrooms?: number; // Added for deep search')) {
    types = types.replace(
        `export interface Room {
  id: string;
  name: string;
  price: number;
  capacity?: number;`,
        `export interface Room {
  id: string;
  name: string;
  price: number;
  capacity?: number;
  bedrooms?: number; // Added for deep search
  beds?: number; // Added for deep search`
    );
    fs.writeFileSync('types.ts', types);
}

// 2. Patch server.ts
let server = fs.readFileSync('server.ts', 'utf-8');
const oldBedroomsQuery = `queryStr += \` AND l.bedrooms >= \$\${queryParams.length}\`;`;
const newBedroomsQuery = `queryStr += \` AND (l.bedrooms >= \$\${queryParams.length} OR EXISTS (SELECT 1 FROM jsonb_array_elements(l.rooms) as r WHERE (r->>'bedrooms')::numeric >= \$\${queryParams.length}))\`;`;

const oldBedsQuery = `queryStr += \` AND l.beds >= \$\${queryParams.length}\`;`;
const newBedsQuery = `queryStr += \` AND (l.beds >= \$\${queryParams.length} OR EXISTS (SELECT 1 FROM jsonb_array_elements(l.rooms) as r WHERE (r->>'beds')::numeric >= \$\${queryParams.length}))\`;`;

const oldGuestsQuery = `queryStr += \` AND l.max_guests >= \$\${queryParams.length}\`;`;
const newGuestsQuery = `queryStr += \` AND (l.max_guests >= \$\${queryParams.length} OR EXISTS (SELECT 1 FROM jsonb_array_elements(l.rooms) as r WHERE (r->>'capacity')::numeric >= \$\${queryParams.length}))\`;`;

server = server.replace(oldBedroomsQuery, newBedroomsQuery);
server = server.replace(oldBedsQuery, newBedsQuery);
server = server.replace(oldGuestsQuery, newGuestsQuery);
fs.writeFileSync('server.ts', server);

// 3. Patch AdminDashboard.tsx
let admin = fs.readFileSync('components/AdminDashboard.tsx', 'utf-8');
const adminOldFields = `<label className="text-xs font-bold uppercase text-gray-500">Inventory Count</label>
                                      <input type="number" value={room.inventory_count || 0} onChange={e => {
                                          const next = [...editingRoomsData];
                                          next[idx].inventory_count = Number(e.target.value);
                                          setEditingRoomsData(next);
                                      }} className="w-full p-2 border rounded" />
                                  </div>`;
const adminNewFields = `<label className="text-xs font-bold uppercase text-gray-500">Inventory</label>
                                      <input type="number" value={room.inventory_count || 0} onChange={e => {
                                          const next = [...editingRoomsData];
                                          next[idx].inventory_count = Number(e.target.value);
                                          setEditingRoomsData(next);
                                      }} className="w-full p-2 border rounded" />
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold uppercase text-gray-500">Beds</label>
                                      <input type="number" value={room.bedrooms || 0} onChange={e => {
                                          const next = [...editingRoomsData];
                                          next[idx].bedrooms = Number(e.target.value);
                                          setEditingRoomsData(next);
                                      }} className="w-full p-2 border rounded" placeholder="Beds (BHK)" />
                                  </div>`;
if (!admin.includes('placeholder="Beds (BHK)"')) {
    admin = admin.replace(adminOldFields, adminNewFields);
    fs.writeFileSync('components/AdminDashboard.tsx', admin);
}

console.log('Deep search and fields patched.');
