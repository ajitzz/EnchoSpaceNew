const fs = require('fs');
let code = fs.readFileSync('components/AdminDashboard.tsx', 'utf-8');

const stateInsertStr = `  const [activeTab, setActiveTab] = useState<'analytics' | 'listings' | 'users' | 'settings' | 'offers' | 'reviews' | 'messages' | 'seo'>('analytics');`;
const stateReplaceStr = `  const [activeTab, setActiveTab] = useState<'analytics' | 'listings' | 'users' | 'settings' | 'offers' | 'reviews' | 'messages' | 'seo'>('analytics');
  const [editingRoomsListing, setEditingRoomsListing] = useState<Listing | null>(null);
  const [editingRoomsData, setEditingRoomsData] = useState<any[]>([]);

  const openRoomsEditor = (listing: Listing, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingRoomsListing(listing);
      setEditingRoomsData(listing.rooms ? JSON.parse(JSON.stringify(listing.rooms)) : []);
  };

  const saveRoomsData = async () => {
      if (!editingRoomsListing) return;
      try {
          const res = await fetch(\`/api/listings/\${editingRoomsListing.id}/rooms\`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
              body: JSON.stringify({ rooms: editingRoomsData })
          });
          if (res.ok) {
              setListings(prev => prev.map(l => l.id === editingRoomsListing.id ? { ...l, rooms: editingRoomsData } : l));
              setEditingRoomsListing(null);
          } else {
              alert("Failed to update inventory rooms.");
          }
      } catch (err) {
          console.error(err);
          alert("Error saving rooms.");
      }
  };`;

if (!code.includes('const openRoomsEditor')) {
    code = code.replace(stateInsertStr, stateReplaceStr);
}

const jsxInsertStr = `    </div>
  );
};

export default AdminDashboard;`;

const modalJsx = `
      {editingRoomsListing && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-6">
                      <h2 className="text-2xl font-bold">Edit Inventory Units for {editingRoomsListing.title}</h2>
                      <button onClick={() => setEditingRoomsListing(null)} className="text-gray-500 hover:text-black">Close</button>
                  </div>
                  
                  <div className="space-y-4">
                      {editingRoomsData.map((room, idx) => (
                          <div key={idx} className="p-4 border border-gray-200 rounded-xl bg-gray-50">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div>
                                      <label className="text-xs font-bold uppercase text-gray-500">Name</label>
                                      <input type="text" value={room.name} onChange={e => {
                                          const next = [...editingRoomsData];
                                          next[idx].name = e.target.value;
                                          setEditingRoomsData(next);
                                      }} className="w-full p-2 border rounded" />
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold uppercase text-gray-500">Base Price</label>
                                      <input type="number" value={room.price} onChange={e => {
                                          const next = [...editingRoomsData];
                                          next[idx].price = Number(e.target.value);
                                          setEditingRoomsData(next);
                                      }} className="w-full p-2 border rounded" />
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold uppercase text-gray-500">Inventory Count</label>
                                      <input type="number" value={room.inventory_count || 0} onChange={e => {
                                          const next = [...editingRoomsData];
                                          next[idx].inventory_count = Number(e.target.value);
                                          setEditingRoomsData(next);
                                      }} className="w-full p-2 border rounded" />
                                  </div>
                                  <div className="flex items-end">
                                      <button onClick={() => {
                                          setEditingRoomsData(prev => prev.filter((_, i) => i !== idx));
                                      }} className="text-red-600 font-bold p-2 hover:bg-red-50 rounded w-full">Remove</button>
                                  </div>
                              </div>
                          </div>
                      ))}
                      
                      <button onClick={() => {
                          setEditingRoomsData(prev => [...prev, { id: Date.now().toString(), name: 'New Unit', price: 0, inventory_count: 1, tiers: [], amenities: [] }]);
                      }} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl font-bold text-gray-600 hover:border-black hover:text-black transition-colors">
                          + Add Unit
                      </button>
                  </div>
                  
                  <div className="mt-8 flex justify-end">
                      <button onClick={saveRoomsData} className="px-6 py-3 bg-black text-white font-bold rounded-xl shadow-lg active:scale-95">Save Changes</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default AdminDashboard;`;

if (!code.includes('editingRoomsListing &&')) {
    code = code.replace(jsxInsertStr, modalJsx);
}

const EditIconStr = `import { Edit3 } from 'lucide-react';`;
if (!code.includes('import { Edit3 }')) {
    code = code.replace(`import { Map, Compass, MoreHorizontal } from 'lucide-react';`, `import { Map, Compass, MoreHorizontal, Edit3 } from 'lucide-react';`);
}

const actionInsertStr = `                                              <button onClick={(e) => handleEditType(listing, e)} className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left">
                                                  <Edit3 className="w-4 h-4" /> Edit Type
                                              </button>`;
const actionReplaceStr = `                                              <button onClick={(e) => handleEditType(listing, e)} className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left">
                                                  <Edit3 className="w-4 h-4" /> Edit Type
                                              </button>
                                              <button onClick={(e) => openRoomsEditor(listing, e)} className="flex items-center gap-2 w-full px-4 py-2 text-sm text-[#0284C7] font-semibold hover:bg-[#0284C7]/10 text-left">
                                                  <Edit3 className="w-4 h-4" /> Manage Inventory Units
                                              </button>`;

if (!code.includes('Manage Inventory Units')) {
    code = code.replace(actionInsertStr, actionReplaceStr);
}

fs.writeFileSync('components/AdminDashboard.tsx', code);
console.log('Admin Dashboard fix patched successfully!');
