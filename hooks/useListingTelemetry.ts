import { useEffect, useRef } from 'react';

export function useListingTelemetry(listingId: string) {
  const trackedPhotos = useRef(new Set<number>());
  const trackingActive = useRef(true);

  // Intent Telemetry: Tracks photo scrolling
  const trackPhotoView = (photoIndex: number) => {
    if (!trackingActive.current) return;
    if (!trackedPhotos.current.has(photoIndex)) {
      trackedPhotos.current.add(photoIndex);
      
      // Fire CRM telemetry for AI Intent Scoring
      fetch('/api/marketing/track/interaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          listingId, 
          action: 'photo_scroll', 
          details: { index: photoIndex } 
        })
      }).catch(console.error);
    }
  };

  // Intent Telemetry: Tracks date selection
  const trackDateSelection = (checkIn: string, checkOut: string) => {
    if (!trackingActive.current) return;
    fetch('/api/marketing/track/interaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        listingId, 
        action: 'date_selection', 
        details: { checkIn, checkOut } 
      })
    }).catch(console.error);
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      trackingActive.current = false;
    };
  }, []);

  return { trackPhotoView, trackDateSelection };
}
