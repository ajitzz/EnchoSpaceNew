const fs = require('fs');
let file = fs.readFileSync('components/AdminDashboard.tsx', 'utf-8');

const modalUI = `
      {/* Rooms Editor Modal */}
      {editingRoomsListing && (
          <div className="fixed inset-0 bg-black/60 z-[999] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold">Edit Rooms for {editingRoomsListing.title}</h3>
                      <button onClick={() => setEditingRoomsListing(null)} className="p-2 hover:bg-gray-100 rounded-full">
                          <XIcon className="w-5 h-5" />
                      </button>
                  </div>
                  
                  <div className="space-y-6">
                      {editingRoomsData.map((room, idx) => (
                          <div key={idx} className="p-4 border rounded-xl border-gray-200 bg-gray-50">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                      <label className="text-xs font-bold uppercase text-gray-500">Name</label>
                                      <input type="text" value={room.name} onChange={(e) => {
                                          const newRooms = [...editingRoomsData];
                                          newRooms[idx].name = e.target.value;
                                          setEditingRoomsData(newRooms);
                                      }} className="w-full p-2 border rounded mt-1" />
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold uppercase text-gray-500">Price</label>
                                      <input type="number" value={room.price} onChange={(e) => {
                                          const newRooms = [...editingRoomsData];
                                          newRooms[idx].price = Number(e.target.value);
                                          setEditingRoomsData(newRooms);
                                      }} className="w-full p-2 border rounded mt-1" />
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold uppercase text-gray-500">Video URL</label>
                                      <input type="url" value={room.video_url || ''} onChange={(e) => {
                                          const newRooms = [...editingRoomsData];
                                          newRooms[idx].video_url = e.target.value;
                                          setEditingRoomsData(newRooms);
                                      }} className="w-full p-2 border rounded mt-1" />
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold uppercase text-gray-500">Description</label>
                                      <textarea value={room.description || ''} onChange={(e) => {
                                          const newRooms = [...editingRoomsData];
                                          newRooms[idx].description = e.target.value;
                                          setEditingRoomsData(newRooms);
                                      }} className="w-full p-2 border rounded mt-1" />
                                  </div>
                              </div>
                          </div>
                      ))}
                      
                      <div className="flex justify-end gap-3 pt-4">
                          <button onClick={() => setEditingRoomsListing(null)} className="px-4 py-2 border rounded-lg font-bold text-gray-600">Cancel</button>
                          <button onClick={saveRoomsData} className="px-4 py-2 bg-black text-white rounded-lg font-bold">Save Changes</button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
export default AdminDashboard;`;

// Let's find the end of the file.
// The file should end with `</div>\n  );\n};\nexport default AdminDashboard;` or similar.
file = file.replace(
  /    <\/div>\n\s*<\/div>\n\s*\);\n};\n\nexport default AdminDashboard;/g,
  `    </div>\n      </div>\n${modalUI}`
);

// We also need to add the edit rooms button to the table
const oldTableActions = `<button onClick={(e) => handleEditRentalMode(listing, e)} title="Edit Rental Mode" className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors">
                                             <EditIcon className="w-4 h-4" />
                                          </button>`;
const newTableActions = `<button onClick={(e) => handleEditRentalMode(listing, e)} title="Edit Rental Mode" className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors">
                                             <EditIcon className="w-4 h-4" />
                                          </button>
                                          <button onClick={(e) => openRoomsEditor(listing, e)} title="Edit Inventory Units" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                                             <ListIcon className="w-4 h-4" />
                                          </button>`;
                                          
if(!file.includes('Edit Inventory Units')) {
    file = file.replace(oldTableActions, newTableActions);
    fs.writeFileSync('components/AdminDashboard.tsx', file);
    console.log('Admin patched');
}
