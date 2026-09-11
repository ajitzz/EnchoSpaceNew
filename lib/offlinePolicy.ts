/** Only low-risk wishlist writes may be replayed; bookings and money always need a fresh response. */
export function canReplayOffline(url: string, method: string) {
  return ['POST', 'DELETE'].includes(method.toUpperCase()) && /^\/api\/(?:wishlists|experience-wishlists)(?:\/[^/?#]+)?$/.test(url);
}
