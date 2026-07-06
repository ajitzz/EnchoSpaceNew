const fs = require('fs');
let file = fs.readFileSync('components/ListingDetails.tsx', 'utf-8');

const componentStr = `
const PremiumInventoryUnitCard = ({ room, listing, isSelected, toggleSelection, formatPrice }: any) => {
    return (
        <div 
            onClick={toggleSelection}
            className={\`group relative overflow-hidden rounded-2xl border-2 transition-all cursor-pointer \${isSelected ? 'border-black bg-white shadow-xl scale-[1.02]' : 'border-gray-100 bg-white hover:border-gray-300 hover:shadow-md'}\`}
        >
            {isSelected && (
                <div className="absolute top-4 right-4 z-20 w-6 h-6 bg-black rounded-full flex items-center justify-center shadow-lg">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
            )}
            <div className="flex flex-col md:flex-row h-full">
                {room.photos && room.photos.length > 0 && (
                    <div className="w-full md:w-1/3 aspect-video md:aspect-auto relative overflow-hidden">
                        <img src={room.photos[0].previewUrl || room.photos[0]} alt={room.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    </div>
                )}
                <div className="flex-1 p-5 md:p-6 flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">{room.name}</h3>
                            <div className="text-right">
                                <span className="text-xl font-extrabold text-gray-900">{formatPrice(room.price)}</span>
                                <span className="text-sm font-medium text-gray-500 block">per night</span>
                            </div>
                        </div>
                        {room.description && (
                            <p className="text-sm text-gray-600 line-clamp-2 mt-2 leading-relaxed">{room.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-md">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                {room.capacity || 2} Guests
                            </span>
                            {room.hasAttachedBathroom && (
                                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                    Ensuite
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
`;

if(!file.includes('PremiumInventoryUnitCard')) {
    console.log('Not fixing, no usages found');
} else if (!file.includes('const PremiumInventoryUnitCard')) {
    const insertIndex = file.indexOf('export const ListingDetails');
    file = file.slice(0, insertIndex) + componentStr + file.slice(insertIndex);
    fs.writeFileSync('components/ListingDetails.tsx', file);
    console.log('Added PremiumInventoryUnitCard');
} else {
    console.log('Already defined');
}
