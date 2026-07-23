import React from 'react';

export const ListingCardSkeleton = () => {
  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-[4/3] bg-gray-200 rounded-3xl w-full relative overflow-hidden">
        {/* Shimmer effect */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      </div>
      <div className="flex items-start justify-between mt-1">
        <div className="flex flex-col gap-2 w-full">
          <div className="h-5 bg-gray-200 rounded-lg w-3/4 relative overflow-hidden">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          </div>
          <div className="h-4 bg-gray-200 rounded-lg w-1/2 relative overflow-hidden">
             <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          </div>
          <div className="h-4 bg-gray-200 rounded-lg w-1/3 mt-1 relative overflow-hidden">
             <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          </div>
        </div>
        <div className="h-4 bg-gray-200 rounded-lg w-12 ml-4 relative overflow-hidden flex-shrink-0 mt-1">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </div>
      </div>
    </div>
  );
};

export const DashboardListingSkeleton = () => (
    <div className="flex flex-col gap-3">
        <div className="aspect-square bg-gray-200 rounded-2xl w-full relative overflow-hidden">
             <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </div>
        <div>
            <div className="h-5 bg-gray-200 rounded-lg w-1/2 mb-2 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
            <div className="h-4 bg-gray-200 rounded-lg w-3/4 mb-2 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
            <div className="h-5 bg-gray-200 rounded-lg w-1/3 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
        </div>
    </div>
);

export const ReservationSkeleton = () => (
    <div className="bg-dune p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center gap-6">
        <div className="w-24 h-24 rounded-2xl bg-gray-200 relative overflow-hidden shrink-0"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
        <div className="flex-1 w-full space-y-2">
            <div className="h-6 bg-gray-200 rounded-lg w-3/4 md:w-1/2 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
            <div className="h-4 bg-gray-200 rounded-lg w-1/2 md:w-1/3 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
            <div className="h-4 bg-gray-200 rounded-lg w-1/3 md:w-1/4 mt-2 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
        </div>
        <div className="text-right space-y-2 w-full md:w-auto">
             <div className="h-6 bg-gray-200 rounded-lg w-16 relative overflow-hidden md:ml-auto"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
             <div className="h-4 bg-gray-200 rounded-lg w-20 relative overflow-hidden md:ml-auto"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
             <div className="h-8 bg-gray-200 rounded-lg w-24 relative overflow-hidden mt-3 md:ml-auto"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
        </div>
    </div>
);

export const InboxSkeleton = () => (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-80px)]">
        <div className="h-10 bg-gray-200 rounded-lg w-48 mb-6 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
        <div className="bg-dune border border-gray-200 rounded-3xl overflow-hidden shadow-sm h-[calc(100%-80px)] flex">
            <div className="w-full md:w-1/3 border-r border-gray-200 flex flex-col relative overflow-hidden">
                <div className="p-4 border-b border-gray-100"><div className="h-10 bg-gray-200 rounded-xl relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div></div>
                <div className="flex-1 p-2 space-y-2">
                    {[1,2,3,4].map(n => (
                        <div key={n} className="p-3 rounded-2xl flex gap-3 items-center relative overflow-hidden">
                            <div className="w-14 h-14 bg-gray-200 rounded-full shrink-0 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                            <div className="flex-1">
                                <div className="h-4 bg-gray-200 w-1/2 mb-2 rounded relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                                <div className="h-3 bg-gray-200 w-3/4 rounded relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="hidden md:flex flex-1 flex-col items-center justify-center relative overflow-hidden bg-gray-50/50">
               <div className="w-16 h-16 bg-gray-200 rounded-full mb-4 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
               <div className="h-5 bg-gray-200 w-48 rounded-lg relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
            </div>
        </div>
    </div>
);

export const AdminInboxSkeleton = () => (
    <div className="bg-dune rounded-2xl shadow-sm border border-gray-200 h-[600px] flex overflow-hidden">
        <div className="w-full md:w-1/3 border-r border-gray-200 flex flex-col bg-slate-50/50">
            <div className="p-4 border-b border-gray-100 bg-dune/50 backdrop-blur-md sticky top-0 z-10 space-y-2">
                 <div className="h-5 bg-gray-200 w-3/4 rounded relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                 <div className="h-3 bg-gray-200 w-1/2 rounded relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
            </div>
            <div className="flex-1 p-2 space-y-2">
                {[1,2,3,4].map(n => (
                    <div key={n} className="p-3 rounded-2xl flex gap-3 items-center relative overflow-hidden border border-gray-100 bg-dune">
                        <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                        <div className="flex-1">
                            <div className="h-4 bg-gray-200 w-1/2 mb-2 rounded relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                            <div className="h-3 bg-gray-200 w-full rounded relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
        <div className="hidden md:flex w-2/3 flex-col items-center justify-center bg-gray-50/50">
            <div className="w-16 h-16 bg-gray-200 rounded-full mb-4 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
            <div className="h-5 bg-gray-200 w-48 rounded-lg relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
        </div>
    </div>
);

export const ListingDetailsSkeleton = () => {
    return (
        <div className="min-h-screen bg-dune">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
                <div className="h-8 bg-gray-200 rounded-lg w-3/4 md:w-1/2 mb-4 relative overflow-hidden">
                   <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                </div>
                <div className="flex items-center gap-4 mb-6">
                   <div className="h-5 bg-gray-200 rounded-lg w-32 relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                   </div>
                   <div className="h-5 bg-gray-200 rounded-lg w-24 relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                   </div>
                </div>

                {/* Images Skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-4 grid-rows-2 gap-2 md:gap-4 h-[40vh] md:h-[60vh] rounded-3xl overflow-hidden mb-12">
                   <div className="md:col-span-2 row-span-2 bg-gray-200 relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                   </div>
                   <div className="hidden md:block bg-gray-200 relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                   </div>
                   <div className="hidden md:block bg-gray-200 relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                   </div>
                   <div className="hidden md:block bg-gray-200 relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                   </div>
                   <div className="hidden md:block bg-gray-200 relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                   </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-12 pb-24">
                   <div className="lg:w-2/3">
                      <div className="h-6 bg-gray-200 rounded-lg w-1/3 mb-6 relative overflow-hidden">
                         <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                      </div>
                      <div className="flex gap-4 mb-8">
                         <div className="h-4 bg-gray-200 rounded-lg w-20 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                         <div className="h-4 bg-gray-200 rounded-lg w-20 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                         <div className="h-4 bg-gray-200 rounded-lg w-20 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                      </div>

                      <div className="space-y-4 py-8 border-t border-gray-200">
                         <div className="h-4 bg-gray-200 rounded-lg w-full relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                         <div className="h-4 bg-gray-200 rounded-lg w-full relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                         <div className="h-4 bg-gray-200 rounded-lg w-5/6 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                         <div className="h-4 bg-gray-200 rounded-lg w-4/6 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                      </div>
                   </div>

                   <div className="lg:w-1/3">
                      <div className="bg-dune rounded-3xl p-6 shadow-xl border border-gray-100">
                         <div className="h-8 bg-gray-200 rounded-lg w-1/3 mb-6 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                         <div className="h-32 bg-gray-200 rounded-xl w-full mb-6 relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                         <div className="h-12 bg-gray-200 rounded-xl w-full relative overflow-hidden"><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" /></div>
                      </div>
                   </div>
                </div>
            </div>
        </div>
    )
}
