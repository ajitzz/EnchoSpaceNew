import React, { useState, useMemo, useEffect } from 'react';
import { Listing } from '../types';
import { 
  ChevronRight, 
  ChevronLeft, 
  Plus, 
  Calendar as CalendarIcon, 
  ShieldAlert, 
  Lock, 
  Unlock, 
  Sparkles, 
  Check, 
  X, 
  User, 
  DollarSign, 
  Clock, 
  Layers, 
  Hotel, 
  Home, 
  Plane, 
  Wrench,
  Info,
  ChevronDown,
  Building2
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { useCurrency } from './CurrencyContext';

interface HostCalendarProps {
  listings: Listing[];
  reservations?: any[];
}

interface PhysicalUnit {
  unitNumber: number;
  unitName: string;
  tierKey: string;
}

interface RoomMatrixItem {
  tierKey: string;
  name: string;
  icon: string;
  price: number;
  capacity: number;
  inventoryCount: number;
  tag?: string;
  units: PhysicalUnit[];
}

interface RoomBooking {
  id: string | number;
  roomTier: string;
  roomUnitNumber: number;
  guestName: string;
  guestEmail: string;
  guestAvatar?: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  guestsCount: number;
  status: string;
  source: string;
}

interface RoomBlock {
  id: number;
  roomTierKey: string;
  roomName: string;
  roomUnitNumber: number; // 0 = all units
  startDate: string;
  endDate: string;
  blockSource: 'airbnb' | 'booking_com' | 'direct' | 'maintenance' | 'manual';
  guestName?: string;
  note?: string;
  createdAt?: string;
}

const BLOCK_SOURCES = [
  { id: 'airbnb', label: 'Airbnb', icon: '✈️', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  { id: 'booking_com', label: 'Booking.com', icon: '🏨', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { id: 'direct', label: 'Direct / Offline VIP', icon: '💎', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { id: 'maintenance', label: 'Maintenance', icon: '🛠️', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  { id: 'manual', label: 'Host Personal Hold', icon: '🧘', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
];

export default function HostCalendar({ listings, reservations = [] }: HostCalendarProps) {
  const { formatPrice } = useCurrency();
  const { token } = useAuth();

  const [selectedListingId, setSelectedListingId] = useState<string | number | null>(
    listings.length > 0 ? listings[0].id : null
  );

  const [currentDate, setCurrentDate] = useState(new Date());
  const [rooms, setRooms] = useState<RoomMatrixItem[]>([]);
  const [bookings, setBookings] = useState<RoomBooking[]>([]);
  const [blocks, setBlocks] = useState<RoomBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [collapsedTiers, setCollapsedTiers] = useState<{ [tierKey: string]: boolean }>({});

  // Block Modal State
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [selectedBlockToInspect, setSelectedBlockToInspect] = useState<RoomBlock | null>(null);
  const [selectedBookingToInspect, setSelectedBookingToInspect] = useState<RoomBooking | null>(null);

  // New Block Form State
  const [blockForm, setBlockForm] = useState({
    roomTierKey: 'all',
    roomUnitNumber: 0, // 0 = all units
    roomName: 'All Sanctuary Rooms',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    blockSource: 'airbnb' as 'airbnb' | 'booking_com' | 'direct' | 'maintenance' | 'manual',
    guestName: '',
    note: ''
  });

  const selectedListing = useMemo(
    () => listings.find(l => String(l.id) === String(selectedListingId)) || listings[0],
    [listings, selectedListingId]
  );

  // Fetch Room Calendar Matrix Data
  const fetchCalendarMatrix = async () => {
    if (!selectedListingId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/listings/${selectedListingId}/room-calendar`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
        setBookings(data.bookings || []);
        setBlocks(data.blocks || []);
      }
    } catch (err) {
      console.error('[HOST CALENDAR FETCH ERROR]', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendarMatrix();
  }, [selectedListingId, token]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const toggleTierCollapse = (tierKey: string) => {
    setCollapsedTiers(prev => ({ ...prev, [tierKey]: !prev[tierKey] }));
  };

  // Quick Open Block Modal with Pre-filled Unit & Dates
  const openBlockModal = (tierKey = 'all', unitNumber = 0, dayNum?: number) => {
    const selectedRoom = rooms.find(r => r.tierKey === tierKey);
    const startStr = dayNum 
      ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
      : new Date().toISOString().split('T')[0];
    
    const endStr = dayNum
      ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum + 1 > daysInMonth ? daysInMonth : dayNum + 1).padStart(2, '0')}`
      : new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];

    let roomDisplayName = 'All Sanctuary Rooms';
    if (selectedRoom) {
      roomDisplayName = unitNumber > 0 
        ? `${selectedRoom.name} #${String(unitNumber).padStart(2, '0')}` 
        : `${selectedRoom.name} (All ${selectedRoom.inventoryCount} Units)`;
    }

    setBlockForm({
      roomTierKey: tierKey,
      roomUnitNumber: unitNumber,
      roomName: roomDisplayName,
      startDate: startStr,
      endDate: endStr,
      blockSource: 'booking_com',
      guestName: '',
      note: ''
    });
    setIsBlockModalOpen(true);
  };

  // Submit Block
  const handleSaveBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListingId) return;

    try {
      const res = await fetch(`/api/listings/${selectedListingId}/room-calendar/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(blockForm)
      });

      if (res.ok) {
        setIsBlockModalOpen(false);
        fetchCalendarMatrix();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to block dates');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save room block');
    }
  };

  // Delete Block (Unblock)
  const handleDeleteBlock = async (blockId: number) => {
    if (!selectedListingId) return;
    if (!confirm('Are you sure you want to release these dates back to the public booking pool?')) return;

    try {
      const res = await fetch(`/api/listings/${selectedListingId}/room-calendar/block/${blockId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setSelectedBlockToInspect(null);
        fetchCalendarMatrix();
      } else {
        alert('Failed to delete date block');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while deleting date block');
    }
  };

  // Date array for horizontal matrix
  const daysArray = useMemo(() => {
    const arr = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      arr.push({
        day: d,
        dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        weekday: dateObj.toLocaleDateString('en-US', { weekday: 'narrow' }),
        isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6,
        isToday: new Date().toDateString() === dateObj.toDateString()
      });
    }
    return arr;
  }, [year, month, daysInMonth]);

  // Check unit cell occupation
  const getUnitOccupation = (tierKey: string, unitNumber: number, dateStr: string) => {
    // 1. Check Encho Bookings for this unit
    const matchedBooking = bookings.find(b => {
      const isTier = b.roomTier === tierKey || !b.roomTier;
      const isUnit = Number(b.roomUnitNumber) === unitNumber || (!b.roomUnitNumber && unitNumber === 1);
      return isTier && isUnit && b.startDate <= dateStr && b.endDate >= dateStr;
    });
    if (matchedBooking) {
      return { type: 'booking', data: matchedBooking };
    }

    // 2. Check Blocks for this unit or all units
    const matchedBlock = blocks.find(blk => {
      const isTier = blk.roomTierKey === tierKey || blk.roomTierKey === 'all';
      const isUnit = Number(blk.roomUnitNumber) === unitNumber || Number(blk.roomUnitNumber) === 0;
      return isTier && isUnit && blk.startDate <= dateStr && blk.endDate >= dateStr;
    });
    if (matchedBlock) {
      return { type: 'block', data: matchedBlock };
    }

    return null;
  };

  // Summary counts
  const totalInventoryUnits = useMemo(() => {
    return rooms.reduce((acc, r) => acc + (r.inventoryCount || 1), 0);
  }, [rooms]);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 md:py-12 pb-36 text-slate-100">
      
      {/* HEADER CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-8 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#0284C7]/10 border border-[#0284C7]/30 text-[#38BDF8] text-[10px] font-mono font-black uppercase tracking-widest">
              Unit-Level Multi-Inventory Matrix (10/10 PMS)
            </span>
            {selectedListing?.brand && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-semibold uppercase tracking-widest">
                {selectedListing.brand}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight font-display flex items-center gap-3">
            <span>Multi-Unit Calendar Matrix</span>
            <span className="text-xs font-mono font-bold px-3 py-1 bg-slate-800 text-slate-300 rounded-xl border border-slate-700">
              {totalInventoryUnits} Physical Units Live
            </span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Manage individual room units independently. Block single units for Booking.com/Airbnb while keeping remaining units open for Encho guests.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Listing Selector Dropdown */}
          {listings.length > 1 && (
            <select
              value={selectedListingId || ''}
              onChange={(e) => setSelectedListingId(e.target.value)}
              className="bg-[#101726] border border-slate-700 hover:border-slate-500 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
            >
              {listings.map(l => (
                <option key={l.id} value={l.id}>
                  {l.title} ({l.city})
                </option>
              ))}
            </select>
          )}

          {/* Block Unit Dates Button */}
          <button
            onClick={() => openBlockModal('all', 0)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-sky-950/40 transition-all cursor-pointer active:scale-95"
          >
            <Lock className="w-4 h-4" />
            <span>Block Specific Unit / Dates</span>
          </button>
        </div>
      </div>

      {/* TIMELINE CONTROLS & LEGEND */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#101726]/80 border border-slate-800 p-4 rounded-2xl mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-[#0A0F1C] border border-slate-700/60 rounded-xl p-1">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs sm:text-sm font-bold text-white tracking-wide">
              {monthName} {year}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setCurrentDate(new Date())}
            className="text-[11px] font-mono font-semibold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Today
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[11px] font-medium text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Encho Guest
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Booking.com
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Airbnb
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Direct VIP
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Maintenance
          </span>
        </div>
      </div>

      {/* MATRIX TIMELINE GRID */}
      <div className="bg-[#0A0F1C] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <div className="min-w-[1000px]">
            
            {/* Header Date Row */}
            <div className="grid grid-cols-[260px_repeat(auto-fit,minmax(32px,1fr))] border-b border-slate-800 bg-[#101726]">
              <div className="p-3.5 text-xs font-black uppercase tracking-wider text-slate-400 border-r border-slate-800 flex items-center justify-between">
                <span>Suite & Physical Units</span>
                <span className="text-[10px] text-slate-500 font-mono font-normal">Inventory</span>
              </div>
              <div className="grid grid-flow-col auto-cols-fr">
                {daysArray.map(d => (
                  <div 
                    key={d.day} 
                    className={`p-2 text-center border-r border-slate-800/60 last:border-r-0 ${
                      d.isToday 
                        ? 'bg-sky-500/20 text-sky-300 font-black' 
                        : d.isWeekend 
                          ? 'bg-[#151D2E]/60 text-slate-400' 
                          : 'text-slate-500'
                    }`}
                  >
                    <div className="text-[10px] font-mono leading-none">{d.weekday}</div>
                    <div className="text-xs font-bold mt-1">{d.day}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Room Tiers & Unit Sub-Rows */}
            {rooms.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                No room configurations found for this listing. Add room types in the Host Form to activate the full Room Matrix.
              </div>
            ) : (
              rooms.map((room) => {
                const isCollapsed = collapsedTiers[room.tierKey];
                return (
                  <div key={room.tierKey} className="border-b border-slate-800 last:border-b-0">
                    
                    {/* Tier Group Header Bar */}
                    <div className="bg-[#131B2E] border-b border-slate-800/60 px-3.5 py-2.5 flex items-center justify-between">
                      <div 
                        onClick={() => toggleTierCollapse(room.tierKey)}
                        className="flex items-center gap-2 cursor-pointer group"
                      >
                        <ChevronDown className={`w-4 h-4 text-slate-400 group-hover:text-white transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                        <span className="text-sm">{room.icon}</span>
                        <h2 className="text-xs sm:text-sm font-bold text-white font-display uppercase tracking-wider group-hover:text-sky-300 transition-colors">
                          {room.name}
                        </h2>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300 font-bold ml-1">
                          {room.inventoryCount} Unit{room.inventoryCount > 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-400">
                          ₹{room.price.toLocaleString()} / nt
                        </span>
                        <button
                          onClick={() => openBlockModal(room.tierKey, 0)}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-[#0284C7] text-slate-300 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                          title={`Block all ${room.inventoryCount} units of ${room.name}`}
                        >
                          <Lock className="w-3 h-3" />
                          <span>Block All {room.inventoryCount} Units</span>
                        </button>
                      </div>
                    </div>

                    {/* Physical Units Rows */}
                    {!isCollapsed && room.units.map((unit) => (
                      <div 
                        key={`${room.tierKey}-${unit.unitNumber}`}
                        className="grid grid-cols-[260px_repeat(auto-fit,minmax(32px,1fr))] border-b border-slate-800/40 hover:bg-[#101726]/40 transition-colors group/unit last:border-b-0"
                      >
                        {/* Unit Name Label */}
                        <div className="p-3 border-r border-slate-800 flex items-center justify-between gap-2 bg-[#0A0F1C]/90 pl-6">
                          <div className="min-w-0 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#0284C7]" />
                            <span className="text-xs font-semibold text-slate-200 truncate font-mono">
                              Unit #{String(unit.unitNumber).padStart(2, '0')}
                            </span>
                          </div>

                          <button
                            onClick={() => openBlockModal(room.tierKey, unit.unitNumber)}
                            className="p-1 rounded-md bg-slate-800/60 hover:bg-[#0284C7] text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0 opacity-40 group-hover/unit:opacity-100"
                            title={`Block Unit #${unit.unitNumber}`}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Days Cells */}
                        <div className="grid grid-flow-col auto-cols-fr">
                          {daysArray.map(d => {
                            const occ = getUnitOccupation(room.tierKey, unit.unitNumber, d.dateStr);

                            if (occ?.type === 'booking') {
                              const b = occ.data as RoomBooking;
                              const isStart = b.startDate === d.dateStr;
                              return (
                                <div
                                  key={d.day}
                                  onClick={() => setSelectedBookingToInspect(b)}
                                  className="p-0.5 border-r border-slate-800/60 flex items-center justify-center cursor-pointer bg-emerald-950/40 hover:bg-emerald-900/60 transition-colors relative group/cell"
                                  title={`Encho Booking: ${b.guestName} (${b.startDate} to ${b.endDate})`}
                                >
                                  <div className="w-full h-7 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold flex items-center justify-center px-1 truncate">
                                    {isStart ? (
                                      <span className="truncate flex items-center gap-1 font-sans">
                                        <User className="w-2.5 h-2.5 shrink-0" />
                                        {b.guestName.split(' ')[0]}
                                      </span>
                                    ) : (
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            if (occ?.type === 'block') {
                              const blk = occ.data as RoomBlock;
                              const isStart = blk.startDate === d.dateStr;
                              const sourceMeta = BLOCK_SOURCES.find(s => s.id === blk.blockSource) || BLOCK_SOURCES[1];
                              
                              return (
                                <div
                                  key={d.day}
                                  onClick={() => setSelectedBlockToInspect(blk)}
                                  className="p-0.5 border-r border-slate-800/60 flex items-center justify-center cursor-pointer bg-slate-900/60 hover:bg-slate-800/80 transition-colors relative group/blk"
                                  title={`${sourceMeta.label} Block: ${blk.guestName || blk.note || 'Reserved'}`}
                                >
                                  <div className={`w-full h-7 rounded border text-[10px] font-bold flex items-center justify-center px-1 truncate ${sourceMeta.color}`}>
                                    {isStart ? (
                                      <span className="truncate flex items-center gap-1 font-sans">
                                        <span>{sourceMeta.icon}</span>
                                        {blk.guestName ? blk.guestName.split(' ')[0] : sourceMeta.label}
                                      </span>
                                    ) : (
                                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            // Empty Available Date Cell
                            return (
                              <div
                                key={d.day}
                                onClick={() => openBlockModal(room.tierKey, unit.unitNumber, d.day)}
                                className={`border-r border-slate-800/40 hover:bg-sky-500/10 cursor-pointer transition-colors flex items-center justify-center group/cell ${
                                  d.isWeekend ? 'bg-[#0E1524]/20' : ''
                                }`}
                                title={`Click to block ${room.name} Unit #${unit.unitNumber} on ${d.dateStr}`}
                              >
                                <span className="text-[9px] text-slate-600 opacity-0 group-hover/cell:opacity-100 font-mono">
                                  +
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* 2-CLICK DATE & UNIT BLOCK MODAL */}
      {/* ========================================== */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#101726] border border-slate-700 w-full max-w-lg rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setIsBlockModalOpen(false)}
              className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white font-display">Block Specific Unit / Dates</h3>
                <p className="text-xs text-slate-400 mt-0.5">Hold 1 unit for Booking.com/Airbnb or lock the entire estate.</p>
              </div>
            </div>

            <form onSubmit={handleSaveBlock} className="space-y-4">
              
              {/* Room Target & Unit Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Suite Category
                  </label>
                  <select
                    value={blockForm.roomTierKey}
                    onChange={(e) => {
                      const tier = e.target.value;
                      const sel = rooms.find(r => r.tierKey === tier);
                      setBlockForm({
                        ...blockForm,
                        roomTierKey: tier,
                        roomUnitNumber: 0,
                        roomName: sel ? sel.name : 'All Sanctuary Rooms'
                      });
                    }}
                    className="w-full bg-[#0A0F1C] border border-slate-700 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white font-semibold focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                  >
                    <option value="all">🌟 Entire Estate (All Rooms)</option>
                    {rooms.map(r => (
                      <option key={r.tierKey} value={r.tierKey}>
                        {r.icon} {r.name} ({r.inventoryCount} Units)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Physical Unit
                  </label>
                  <select
                    value={blockForm.roomUnitNumber}
                    disabled={blockForm.roomTierKey === 'all'}
                    onChange={(e) => {
                      const uNum = Number(e.target.value);
                      const sel = rooms.find(r => r.tierKey === blockForm.roomTierKey);
                      setBlockForm({
                        ...blockForm,
                        roomUnitNumber: uNum,
                        roomName: uNum > 0 && sel ? `${sel.name} #${String(uNum).padStart(2, '0')}` : (sel ? sel.name : 'All Rooms')
                      });
                    }}
                    className="w-full bg-[#0A0F1C] border border-slate-700 disabled:opacity-40 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white font-semibold focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                  >
                    <option value={0}>⚡ All Units in this Suite</option>
                    {(() => {
                      const sel = rooms.find(r => r.tierKey === blockForm.roomTierKey);
                      if (!sel) return null;
                      return sel.units.map(u => (
                        <option key={u.unitNumber} value={u.unitNumber}>
                          🎯 Only Unit #{String(u.unitNumber).padStart(2, '0')}
                        </option>
                      ));
                    })()}
                  </select>
                </div>
              </div>

              {/* Date Range Picker */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={blockForm.startDate}
                    onChange={(e) => setBlockForm({ ...blockForm, startDate: e.target.value })}
                    className="w-full bg-[#0A0F1C] border border-slate-700 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    End Date
                  </label>
                  <input
                    type="date"
                    min={blockForm.startDate}
                    value={blockForm.endDate}
                    onChange={(e) => setBlockForm({ ...blockForm, endDate: e.target.value })}
                    className="w-full bg-[#0A0F1C] border border-slate-700 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                    required
                  />
                </div>
              </div>

              {/* Block Source / Platform */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Platform / Provenance
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BLOCK_SOURCES.map(src => (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => setBlockForm({ ...blockForm, blockSource: src.id as any })}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all text-left ${
                        blockForm.blockSource === src.id
                          ? 'bg-[#0284C7]/20 border-[#0284C7] text-sky-300 shadow-md'
                          : 'bg-[#0A0F1C] border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-sm">{src.icon}</span>
                      <span className="truncate">{src.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Guest Name & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Customer Name <span className="text-slate-500 lowercase">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Booking.com Guest: Rohit Sharma"
                    value={blockForm.guestName}
                    onChange={(e) => setBlockForm({ ...blockForm, guestName: e.target.value })}
                    className="w-full bg-[#0A0F1C] border border-slate-700 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Status / Booking Note <span className="text-slate-500 lowercase">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Paid online on Booking.com"
                    value={blockForm.note}
                    onChange={(e) => setBlockForm({ ...blockForm, note: e.target.value })}
                    className="w-full bg-[#0A0F1C] border border-slate-700 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBlockModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-sky-950/40 transition-all cursor-pointer"
                >
                  Confirm Unit Lock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* INSPECT BLOCK MODAL (1-CLICK UNBLOCK) */}
      {/* ========================================== */}
      {selectedBlockToInspect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#101726] border border-slate-700 w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setSelectedBlockToInspect(null)}
              className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white font-display">
                  {selectedBlockToInspect.roomName}
                  {selectedBlockToInspect.roomUnitNumber > 0 && (
                    <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300">
                      Unit #{selectedBlockToInspect.roomUnitNumber}
                    </span>
                  )}
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  {selectedBlockToInspect.startDate} → {selectedBlockToInspect.endDate}
                </span>
              </div>
            </div>

            <div className="bg-[#0A0F1C] border border-slate-800 rounded-2xl p-4 space-y-3 mb-6">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider">Channel / Reason:</span>
                <span className="font-bold text-white uppercase">{selectedBlockToInspect.blockSource}</span>
              </div>
              {selectedBlockToInspect.guestName && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Customer:</span>
                  <span className="font-semibold text-slate-200">{selectedBlockToInspect.guestName}</span>
                </div>
              )}
              {selectedBlockToInspect.note && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Status Note:</span>
                  <span className="text-slate-300 italic">{selectedBlockToInspect.note}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedBlockToInspect(null)}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-400 hover:text-white transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBlock(selectedBlockToInspect.id)}
                className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-rose-950/40 transition-all cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
                <span>Release Unit (Unblock)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* INSPECT ENCHO BOOKING MODAL */}
      {/* ========================================== */}
      {selectedBookingToInspect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#101726] border border-slate-700 w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setSelectedBookingToInspect(null)}
              className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg">
                {selectedBookingToInspect.guestAvatar ? (
                  <img src={selectedBookingToInspect.guestAvatar} alt="" className="w-full h-full rounded-2xl object-cover" />
                ) : (
                  selectedBookingToInspect.guestName[0]
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-white font-display">
                    {selectedBookingToInspect.guestName}
                  </h3>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                    ENCHO PAID
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{selectedBookingToInspect.guestEmail}</p>
              </div>
            </div>

            <div className="bg-[#0A0F1C] border border-slate-800 rounded-2xl p-4 space-y-3 mb-6">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider">Suite & Unit:</span>
                <span className="font-bold text-white uppercase">
                  {selectedBookingToInspect.roomTier} · Unit #{selectedBookingToInspect.roomUnitNumber || 1}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider">Stay Dates:</span>
                <span className="font-semibold text-emerald-400 font-mono">
                  {selectedBookingToInspect.startDate} → {selectedBookingToInspect.endDate}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider">Guests:</span>
                <span className="font-semibold text-slate-200">{selectedBookingToInspect.guestsCount} Guest(s)</span>
              </div>
              <div className="flex justify-between text-xs border-t border-slate-800 pt-2">
                <span className="text-slate-500 font-bold uppercase tracking-wider">Gross Rent Paid:</span>
                <span className="font-bold text-white font-mono">₹{selectedBookingToInspect.totalPrice.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedBookingToInspect(null)}
                className="px-5 py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
