import type {PublicAcceptedOffer} from '../../../types';

// A public numeric `price` remains for the existing card/map/detail contract.
// Keep its range small enough that a two-decimal INR display cannot lose a paise.
export const MAX_PUBLIC_OFFER_AMOUNT_MINOR = 900719925474099n;

export function acceptedOfferAmountMinor(value: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) throw new Error('Invalid accepted offer amount');
  const amount = BigInt(value);
  if (amount > MAX_PUBLIC_OFFER_AMOUNT_MINOR) throw new Error('Accepted offer exceeds public display precision');
  return amount;
}

export function acceptedOfferPriceRupees(offer: PublicAcceptedOffer | null): number | null {
  return offer ? Number(acceptedOfferAmountMinor(offer.amountMinor)) / 100 : null;
}

export function formatAcceptedOfferPrice(offer: PublicAcceptedOffer): string {
  const amount = acceptedOfferAmountMinor(offer.amountMinor);
  const rupees = (amount / 100n).toLocaleString('en-IN');
  const paise = amount % 100n;
  return `₹${rupees}${paise ? `.${paise.toString().padStart(2, '0')}` : ''}`;
}

export function currentIndiaDate(now: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'Asia/Kolkata', year: 'numeric',
    month: '2-digit', day: '2-digit'}).formatToParts(now);
  const part = (type: string) => parts.find(entry => entry.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function acceptedOfferIsCurrent(offer: PublicAcceptedOffer | null | undefined, now: number): boolean {
  return Boolean(offer && now >= Date.parse(offer.effectiveFrom) &&
    now < Date.parse(offer.effectiveUntil) && offer.stayEnd > currentIndiaDate(now));
}

/** Hide accepted prices at the first known temporal boundary in a long-lived tab. */
export function nextAcceptedOfferRefreshDelay(offers: Array<PublicAcceptedOffer | null | undefined>, now: number): number | null {
  const current = offers.filter((offer): offer is PublicAcceptedOffer => acceptedOfferIsCurrent(offer, now));
  if (!current.length) return null;
  const nextIndiaMidnight = Date.parse(`${currentIndiaDate(now)}T18:30:00Z`);
  return Math.max(1, Math.min(3600000, nextIndiaMidnight - now,
    ...current.map(offer => Date.parse(offer.effectiveUntil) - now)));
}
