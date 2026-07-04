import { useEffect, useCallback } from 'react';

export function useAppBadge() {
  const setBadge = useCallback((count?: number) => {
    try {
      if ('setAppBadge' in navigator && count !== undefined && count > 0) {
        (navigator as any).setAppBadge(count);
      } else if ('clearAppBadge' in navigator) {
        (navigator as any).clearAppBadge();
      }
    } catch (error) {
      console.warn('App Badge API not supported or failed', error);
    }
  }, []);

  const clearBadge = useCallback(() => {
    try {
      if ('clearAppBadge' in navigator) {
        (navigator as any).clearAppBadge();
      }
    } catch (error) {
      console.warn('App Badge API not supported or failed', error);
    }
  }, []);

  return { setBadge, clearBadge };
}

export function useNativeNotification() {
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.log('This browser does not support desktop notification');
      return false;
    }
    
    if (Notification.permission === 'granted') {
      return true;
    }
    
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    
    return false;
  }, []);

  const showNotification = useCallback(async (title: string, options?: NotificationOptions) => {
    const hasPermission = await requestPermission();
    if (hasPermission) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && registration.showNotification) {
          registration.showNotification(title, {
            icon: '/pwa-192x192.svg',
            // vibrate: [200, 100, 200],
            ...options,
          });
        } else {
            new Notification(title, {
                icon: '/pwa-192x192.svg',
                ...options,
            });
        }
      } catch (e) {
        // Fallback or ignore if service worker isn't fully ready
        new Notification(title, {
          icon: '/pwa-192x192.svg',
          ...options,
        });
      }
    }
  }, [requestPermission]);

  return { requestPermission, showNotification };
}
